import type {
  BuildResult,
  BuildTotals,
  ColumnMapping,
  FilterOperator,
  FilterRule,
  Invoice,
  InvoiceConfig,
  InvoiceItem,
  Issue,
  RowOverride,
  RowOverrides,
  SkippedRow,
} from "./types";
import { UNMAPPED } from "./types";
import { applySalt, generateSalt } from "./salt";
import { donateOrgName, isKnownDonateCode } from "./donateCodes";
import {
  ORDER_NO_PATTERN,
  byteLength,
  charLength,
  cleanCarrier,
  cleanCompact,
  cleanEmail,
  cleanField,
  cleanOrderNo,
  cleanTaxId,
  clean,
  digitsOnly,
  isValidTaxId,
  parseAmount,
  truncate,
} from "./text";
import { isBlankRow } from "./sheet";

/** 手機條碼載具：第 1 碼為 "/"，其後 7 碼限大寫英數與 + - . */
export const MOBILE_CARRIER_PATTERN = /^\/[0-9A-Z+\-.]{7}$/;
/** 自然人憑證條碼：2 碼大寫英文 + 14 碼數字 */
export const CITIZEN_CARRIER_PATTERN = /^[A-Z]{2}\d{14}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX = {
  訂單編號: 20,
  B2B買受人名稱: 75,
  B2C買受人名稱: 30,
  買受人地址: 100,
  商品名稱: 30,
  商品單位: 2,
  商品數量位數: 5,
  金額位數: 10,
  備註: 200,
} as const;

/** 取欄位值；未對應時回傳空字串 */
function cell(row: string[], index: number): string {
  if (index === UNMAPPED || index < 0 || index >= row.length) return "";
  return row[index] ?? "";
}

/**
 * 是否為 0 元訂單。
 *
 * 金額空白視為 0；「免費」這類無法解析的內容則不算 0 元，
 * 會留到驗證階段回報錯誤，避免因欄位對應錯誤而整批被靜靜略過。
 */
export function isZeroAmountRow(
  row: string[],
  mapping: ColumnMapping,
  override: RowOverride = {},
): boolean {
  const overridden = override.values?.發票金額;
  // 尚未對應發票金額欄位、且沒有人工填值時不套用，否則整批會被當成 0 元靜靜略過，
  // 讓人誤以為資料有問題而不是欄位沒設定
  if (mapping.發票金額 === UNMAPPED && overridden === undefined) return false;
  const raw = overridden ?? cell(row, mapping.發票金額);
  if (clean(raw) === "") return true;
  const amount = parseAmount(raw);
  return Number.isFinite(amount) && Math.round(amount) <= 0;
}

/** 略過清單的內容摘要 */
function rowPreview(row: string[]): string {
  return row.filter(Boolean).slice(0, 4).join(" / ");
}

export const OPERATOR_LABEL: Record<FilterOperator, string> = {
  equals: "等於",
  notEquals: "不等於",
  contains: "包含",
  notContains: "不包含",
  notEmpty: "不為空白",
  isEmpty: "為空白",
};

/** 「不為空白」「為空白」不需要比對值 */
export function operatorNeedsValue(operator: FilterOperator): boolean {
  return operator !== "notEmpty" && operator !== "isEmpty";
}

/** 判斷某一列是否符合單一條件；未指定欄位的條件視為不設限 */
export function matchesFilter(row: string[], rule: FilterRule): boolean {
  if (rule.column === UNMAPPED) return true;
  const actual = clean(cell(row, rule.column));
  const expected = clean(rule.value);
  switch (rule.operator) {
    case "equals":
      return actual === expected;
    case "notEquals":
      return actual !== expected;
    case "contains":
      return expected === "" || actual.includes(expected);
    case "notContains":
      return expected === "" || !actual.includes(expected);
    case "notEmpty":
      return actual !== "";
    case "isEmpty":
      return actual === "";
    default:
      return true;
  }
}

/** 多個條件為交集：全部符合才會開立 */
export function matchesFilters(row: string[], rules: FilterRule[]): boolean {
  return rules.every((rule) => matchesFilter(row, rule));
}

/** 把條件描述成可讀文字，用於說明某列為何被略過 */
export function describeRule(rule: FilterRule, headers: string[] = []): string {
  const name = headers[rule.column] || `第 ${rule.column + 1} 欄`;
  const label = OPERATOR_LABEL[rule.operator] ?? rule.operator;
  return operatorNeedsValue(rule.operator) ? `${name} ${label}「${rule.value}」` : `${name} ${label}`;
}

/**
 * 由含稅總額回推銷售額與稅額。
 *
 * 先四捨五入算出銷售額，稅額再以「總額 - 銷售額」取得，確保
 * 銷售額 + 稅額 === 發票金額（規格第 17 項），不會因兩次獨立四捨五入而差 1 元。
 */
export function splitAmount(
  總額: number,
  稅別: string,
  稅率: number,
): { 銷售額合計: number; 稅額: number } {
  if (稅別 === "2" || 稅別 === "3") {
    // 零稅率、免稅：稅額為 0
    return { 銷售額合計: 總額, 稅額: 0 };
  }
  const rate = Number.isFinite(稅率) && 稅率 > 0 ? 稅率 : 0;
  const 銷售額合計 = Math.round(總額 / (1 + rate / 100));
  return { 銷售額合計, 稅額: 總額 - 銷售額合計 };
}

/**
 * 產生明細錄(I)。
 *
 * ezPay 規則（手冊範例第 8 頁）：B2B 三聯式的商品單價為未稅，加總等於銷售額；
 * B2C 二聯式的商品單價為含稅，加總等於發票金額。
 */
function buildItem(
  發票種類: "B2B" | "B2C",
  銷售額合計: number,
  發票金額: number,
  商品名稱: string,
  商品單位: string,
  數量: number,
  稅別: string,
  issues: Issue[],
): InvoiceItem {
  const 小計 = 發票種類 === "B2B" ? 銷售額合計 : 發票金額;

  if (!商品名稱.trim()) {
    issues.push({ level: "error", field: "商品名稱", message: "商品名稱為必填" });
  } else if (charLength(商品名稱) > MAX.商品名稱) {
    issues.push({
      level: "warning",
      field: "商品名稱",
      message: `商品名稱超過 ${MAX.商品名稱} 字元，已截斷`,
    });
  }

  if (!商品單位.trim()) {
    issues.push({ level: "error", field: "商品單位", message: "商品單位為必填" });
  } else if (charLength(商品單位) > MAX.商品單位) {
    issues.push({
      level: "warning",
      field: "商品單位",
      message: `商品單位超過 ${MAX.商品單位} 字元，已截斷`,
    });
  }

  let 商品數量 = Number.isFinite(數量) && 數量 > 0 ? Math.floor(數量) : 1;
  if (String(商品數量).length > MAX.商品數量位數) {
    issues.push({
      level: "error",
      field: "商品數量",
      message: `商品數量 ${商品數量} 超過 ${MAX.商品數量位數} 位數上限`,
    });
  }
  if (String(小計).length > MAX.金額位數) {
    issues.push({
      level: "error",
      field: "商品小計",
      message: `商品小計 ${小計} 超過 ${MAX.金額位數} 位數上限`,
    });
  }
  if (小計 % 商品數量 !== 0) {
    // 規格要求「商品數量 * 商品單價 = 商品小計」且皆為整數，無法整除時退回 1
    issues.push({
      level: "warning",
      field: "商品數量",
      message: `金額 ${小計} 無法被數量 ${商品數量} 整除，已改以數量 1 開立`,
    });
    商品數量 = 1;
  }

  return {
    商品名稱: truncate(商品名稱, MAX.商品名稱),
    商品數量,
    商品單位: truncate(商品單位, MAX.商品單位),
    商品單價: 小計 / 商品數量,
    商品小計: 小計,
    // 商品課稅別僅在稅別 = 9（混合應稅與免稅或零稅率）時需要
    商品課稅別: 稅別 === "9" ? "1" : "",
  };
}

/** 決定買受人的載具 / 捐贈 / 索取紙本三選一狀態 */
function resolveCarrier(
  value: (field: keyof ColumnMapping) => string,
  email: string,
  issues: Issue[],
  forcePaper: boolean,
): Pick<Invoice, "載具類別" | "載具編號" | "捐贈碼" | "受贈單位" | "索取紙本發票"> {
  // 人工指定索取紙本時，載具與捐贈碼一律清空（規格要求三者互斥）
  if (forcePaper) {
    return { 載具類別: "", 載具編號: "", 捐贈碼: "", 受贈單位: "", 索取紙本發票: "Y" };
  }
  const 捐贈碼 = digitsOnly(value("捐贈碼"));
  const 手機條碼 = cleanCarrier(value("手機條碼載具"));
  const 自然人憑證 = cleanCarrier(value("自然人憑證載具"));

  // 1. 捐贈優先：規格規定有捐贈碼時，載具欄位必為空、索取紙本為 N
  if (捐贈碼) {
    if (!/^\d{3,7}$/.test(捐贈碼)) {
      issues.push({
        level: "error",
        field: "捐贈碼",
        message: `捐贈碼「${捐贈碼}」格式錯誤，限 3~7 碼純數字`,
      });
    } else if (!isKnownDonateCode(捐贈碼)) {
      issues.push({
        level: "warning",
        field: "捐贈碼",
        message: `捐贈碼「${捐贈碼}」不在內建的受贈單位清單中，請再確認`,
      });
    }
    if (手機條碼 || 自然人憑證) {
      issues.push({
        level: "warning",
        field: "捐贈碼",
        message: "同時填了捐贈碼與載具，已依規格優先採用捐贈碼並清空載具",
      });
    }
    return {
      載具類別: "",
      載具編號: "",
      捐贈碼,
      受贈單位: donateOrgName(捐贈碼),
      索取紙本發票: "N",
    };
  }

  // 2. 手機條碼載具
  if (手機條碼) {
    if (!MOBILE_CARRIER_PATTERN.test(手機條碼)) {
      issues.push({
        level: "error",
        field: "手機條碼載具",
        message: `手機條碼「${手機條碼}」格式錯誤，應為 "/" + 7 碼大寫英數或 + - .`,
      });
    }
    return {
      載具類別: "0",
      載具編號: 手機條碼,
      捐贈碼: "",
      受贈單位: "",
      索取紙本發票: "N",
    };
  }

  // 3. 自然人憑證條碼載具
  if (自然人憑證) {
    if (!CITIZEN_CARRIER_PATTERN.test(自然人憑證)) {
      issues.push({
        level: "error",
        field: "自然人憑證載具",
        message: `自然人憑證「${自然人憑證}」格式錯誤，應為 2 碼大寫英文 + 14 碼數字`,
      });
    }
    return {
      載具類別: "1",
      載具編號: 自然人憑證,
      捐贈碼: "",
      受贈單位: "",
      索取紙本發票: "N",
    };
  }

  // 4. 有 Email 就存 ezPay 電子發票載具，載具編號以 Email 作為買受人識別代號
  if (email) {
    return {
      載具類別: "2",
      載具編號: email,
      捐贈碼: "",
      受贈單位: "",
      索取紙本發票: "N",
    };
  }

  // 5. 三者皆無：規格要求索取紙本必填 Y
  return { 載具類別: "", 載具編號: "", 捐贈碼: "", 受贈單位: "", 索取紙本發票: "Y" };
}

function buildInvoice(
  row: string[],
  sourceRow: number,
  config: InvoiceConfig,
  salt: string,
  override: RowOverride = {},
): Invoice {
  const { mapping } = config;
  const issues: Issue[] = [];
  // 人工修正優先於來源檔的內容
  const value = (field: keyof ColumnMapping) =>
    override.values?.[field] ?? cell(row, mapping[field]);

  const 原始訂單編號 = cleanCompact(value("訂單編號"));
  const 商店自訂編號 = applySalt(原始訂單編號, salt, config.salt.separator);

  if (!原始訂單編號) {
    issues.push({ level: "error", field: "訂單編號", message: "訂單編號為空" });
  } else if (cleanOrderNo(原始訂單編號) !== 原始訂單編號) {
    issues.push({
      level: "warning",
      field: "訂單編號",
      message: `原編號「${原始訂單編號}」含非英數字元，已自動轉換為「${商店自訂編號}」`,
    });
  } else if (!ORDER_NO_PATTERN.test(商店自訂編號) || 商店自訂編號.length > MAX.訂單編號) {
    issues.push({
      level: "error",
      field: "訂單編號",
      message: `自訂編號「${商店自訂編號}」不符規格（限英數字與底線，最長 20 字元）`,
    });
  }

  const 統一編號 = cleanTaxId(value("B2B統一編號"));
  const 公司名稱 = cleanField(value("B2B公司名稱"));
  const 是B2B = Boolean(統一編號) && Boolean(公司名稱);
  const 發票種類 = 是B2B ? "B2B" : "B2C";

  if (統一編號 && !公司名稱) {
    issues.push({
      level: "warning",
      field: "B2B公司名稱",
      message: `有統一編號 ${統一編號} 但缺公司名稱，已改開 B2C`,
    });
  }
  if (是B2B && !/^\d{8}$/.test(統一編號)) {
    issues.push({
      level: "error",
      field: "B2B統一編號",
      message: `統一編號「${統一編號}」應為 8 碼數字`,
    });
  } else if (是B2B && !isValidTaxId(統一編號)) {
    // 檢查碼不符多半是打錯字，但也可能是極少數的例外編號，故列為提醒
    issues.push({
      level: "warning",
      field: "B2B統一編號",
      message: `統一編號「${統一編號}」檢查碼不符，請再確認`,
    });
  }

  const email = cleanEmail(value("電子郵件"));
  if (email && !EMAIL_PATTERN.test(email)) {
    issues.push({ level: "warning", field: "電子郵件", message: `Email「${email}」格式可能有誤` });
  }

  const 買受人地址 = cleanField(value("買受人地址"));

  const carrier = 是B2B
    ? {
        載具類別: "",
        載具編號: "",
        捐贈碼: "",
        受贈單位: "",
        索取紙本發票: "Y" as const, // 規格：發票種類為 B2B 時此欄必填 Y
      }
    : resolveCarrier(value, email, issues, override.forcePaper === true);

  if (carrier.載具類別 === "2" && !email) {
    issues.push({
      level: "error",
      field: "電子郵件",
      message: "使用 ezPay 電子發票載具時，買受人電子信箱為必填",
    });
  }

  const nameSource = 是B2B ? 公司名稱 : cleanField(value("B2C買受人名稱"));
  const maxName = 是B2B ? MAX.B2B買受人名稱 : MAX.B2C買受人名稱;
  const 買受人名稱 = truncate(nameSource, maxName);
  if (!買受人名稱) {
    issues.push({ level: "error", field: "買受人名稱", message: "買受人名稱不可為空" });
  } else if (charLength(nameSource) > maxName) {
    issues.push({
      level: "warning",
      field: "買受人名稱",
      message: `買受人名稱超過 ${maxName} 字元，已截斷為「${買受人名稱}」`,
    });
  } else if (byteLength(買受人名稱) > maxName) {
    // 部分平台以位元組計算長度（中文以 2 計），提醒使用者留意
    issues.push({
      level: "warning",
      field: "買受人名稱",
      message: `買受人名稱以位元組計為 ${byteLength(買受人名稱)}，可能超過 ${maxName} 上限`,
    });
  }

  if (買受人地址 && charLength(買受人地址) > MAX.買受人地址) {
    issues.push({
      level: "warning",
      field: "買受人地址",
      message: `買受人地址 ${charLength(買受人地址)} 字元偏長，請確認平台可接受`,
    });
  }

  const 發票金額 = parseAmount(value("發票金額"));
  const 合法金額 = Number.isFinite(發票金額) && 發票金額 > 0;
  if (!合法金額) {
    issues.push({
      level: "error",
      field: "發票金額",
      message: `發票金額「${value("發票金額")}」無法解析或不大於 0`,
    });
  } else if (!Number.isInteger(發票金額)) {
    issues.push({
      level: "warning",
      field: "發票金額",
      message: `發票金額 ${發票金額} 非整數，已四捨五入為 ${Math.round(發票金額)}`,
    });
  }
  const 總額 = 合法金額 ? Math.round(發票金額) : 0;

  const 稅率 = config.稅別 === "2" || config.稅別 === "3" ? 0 : config.稅率;
  const { 銷售額合計, 稅額 } = splitAmount(總額, config.稅別, 稅率);

  // 稅別與稅率必須一致，否則平台回報 INV10006
  if (config.稅別 === "1" && 稅率 !== 5) {
    issues.push({
      level: "error",
      field: "稅率",
      message: `稅別為應稅時一般稅率應為 5，目前為 ${稅率}`,
    });
  }
  if (config.稅別 === "4" && !(稅率 > 0)) {
    issues.push({
      level: "error",
      field: "稅率",
      message: "稅別為應稅（特種稅率）時，稅率必須大於 0",
    });
  }

  if (config.稅別 === "2" && !config.報關標記) {
    issues.push({
      level: "error",
      field: "報關標記",
      message: "稅別為零稅率時，報關標記為必填（1 = 非經海關出口、2 = 經海關出口）",
    });
  }

  const 商品名稱來源 = cleanField(value("商品名稱")) || config.預設商品名稱;
  const 數量來源 = mapping.商品數量 === UNMAPPED
    ? config.預設商品數量
    : parseAmount(value("商品數量")) || config.預設商品數量;

  const items = [
    buildItem(
      發票種類,
      銷售額合計,
      總額,
      商品名稱來源,
      config.預設商品單位,
      數量來源,
      config.稅別,
      issues,
    ),
  ];

  const 備註來源 = cleanField(value("備註")) || cleanField(config.預設備註);
  const 備註 = truncate(備註來源, MAX.備註);
  if (charLength(備註來源) > MAX.備註) {
    issues.push({ level: "warning", field: "備註", message: "備註超過 200 字，已截斷" });
  }

  return {
    sourceRow,
    原始訂單編號,
    商店自訂編號,
    發票種類,
    買受人統一編號: 是B2B ? 統一編號 : "",
    買受人名稱,
    買受人電子信箱: email,
    買受人地址,
    ...carrier,
    稅別: config.稅別,
    稅率,
    報關標記: config.稅別 === "2" ? config.報關標記 : "",
    銷售額合計,
    稅額,
    發票金額: 總額,
    備註,
    items,
    issues,
  };
}

/** 將來源表格依設定轉換為發票資料，並附上驗證結果 */
export function buildInvoices(
  rows: string[][],
  config: InvoiceConfig,
  options: { now?: Date; headers?: string[]; overrides?: RowOverrides } = {},
): BuildResult {
  const { now = new Date(), headers = [], overrides = {} } = options;
  const appliedSalt = generateSalt(config.salt, now);
  const invoices: Invoice[] = [];
  const skipped: SkippedRow[] = [];

  rows.forEach((row, index) => {
    const sourceRow = index + 2; // +1 轉 1-based、+1 跳過標題列

    if (isBlankRow(row)) return;

    const override = overrides[sourceRow] ?? {};

    // 人工指定跳過，優先於其他判斷
    if (override.skip) {
      skipped.push({
        sourceRow,
        reason: override.skipReason || "人工略過",
        preview: rowPreview(row),
        row,
      });
      return;
    }

    const failed = config.filters.find((rule) => !matchesFilter(row, rule));
    if (failed) {
      skipped.push({
        sourceRow,
        reason: `不符合條件：${describeRule(failed, headers)}`,
        preview: rowPreview(row),
        row,
      });
      return;
    }

    if (config.略過零元訂單 && isZeroAmountRow(row, config.mapping, override)) {
      skipped.push({ sourceRow, reason: "發票金額為 0 元", preview: rowPreview(row), row });
      return;
    }

    invoices.push(buildInvoice(row, sourceRow, config, appliedSalt, override));
  });

  // 自訂編號在同一商店不可重覆（錯誤代碼 LIB10003）
  const seen = new Map<string, number>();
  for (const invoice of invoices) {
    const first = seen.get(invoice.商店自訂編號);
    if (first !== undefined) {
      invoice.issues.push({
        level: "error",
        field: "訂單編號",
        message: `自訂編號「${invoice.商店自訂編號}」與第 ${first} 列重覆`,
      });
    } else {
      seen.set(invoice.商店自訂編號, invoice.sourceRow);
    }
  }

  const totals: BuildTotals = {
    發票筆數: invoices.length,
    B2B筆數: invoices.filter((i) => i.發票種類 === "B2B").length,
    B2C筆數: invoices.filter((i) => i.發票種類 === "B2C").length,
    銷售額合計: invoices.reduce((sum, i) => sum + i.銷售額合計, 0),
    稅額合計: invoices.reduce((sum, i) => sum + i.稅額, 0),
    發票金額合計: invoices.reduce((sum, i) => sum + i.發票金額, 0),
    錯誤筆數: invoices.filter((i) => i.issues.some((issue) => issue.level === "error")).length,
    警告筆數: invoices.filter(
      (i) =>
        i.issues.some((issue) => issue.level === "warning") &&
        !i.issues.some((issue) => issue.level === "error"),
    ).length,
  };

  return {
    header: ["H", "INVO", config.會員編號, config.商店代號, config.開立日期],
    invoices,
    skipped,
    totals,
    appliedSalt,
  };
}

export function hasErrors(result: BuildResult): boolean {
  return result.totals.錯誤筆數 > 0;
}
