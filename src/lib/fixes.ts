import type { Fix, Invoice, Issue, RowOverride } from "./types";

/**
 * 針對每一種問題提供可行的修正方式。
 *
 * 設計原則：
 * 1. 修正的是「來源資料的解讀方式」（RowOverride），不是產生好的發票，
 *    因此改設定、換篩選條件後重新建置仍會套用同一組修正。
 * 2. 每個錯誤至少提供一條可以走下去的路；真的救不了的就「跳過此筆」，
 *    讓它進入未開立清單由人工處理。
 * 3. 全批次共用的設定（稅率、報關標記、商品單位）不做逐列修正，改給提示。
 */

/** 把兩組修正合併，values 以淺層合併 */
export function mergeOverride(prev: RowOverride = {}, patch: RowOverride): RowOverride {
  return {
    ...prev,
    ...patch,
    values: { ...prev.values, ...patch.values },
  };
}

const skipFix = (reason: string): Fix => ({ kind: "skip", label: "跳過此筆", reason });

/** 改開 B2C：清掉統編與公司名稱，並把原本的抬頭轉為買受人姓名 */
function switchToB2C(invoice: Invoice): Fix {
  return {
    kind: "patch",
    label: "改開 B2C 發票",
    hint: "清除統一編號，以個人名義開立",
    override: {
      values: {
        B2B統一編號: "",
        B2B公司名稱: "",
        B2C買受人名稱: invoice.買受人名稱,
      },
    },
  };
}

/** 清掉載具欄位；有 Email 時會自動落到 ezPay 電子發票載具，否則變成索取紙本 */
function dropCarrier(invoice: Invoice): Fix {
  const hasEmail = Boolean(invoice.買受人電子信箱);
  return {
    kind: "patch",
    label: hasEmail ? "改用 ezPay 會員載具" : "清除載具",
    hint: hasEmail
      ? `以 ${invoice.買受人電子信箱} 作為載具編號`
      : "沒有 Email，將改為索取紙本發票",
    override: { values: { 手機條碼載具: "", 自然人憑證載具: "" } },
  };
}

const paperFix: Fix = {
  kind: "patch",
  label: "改為索取紙本",
  hint: "清除載具與捐贈碼，索取紙本填 Y",
  override: { forcePaper: true },
};

const dropDonateFix: Fix = {
  kind: "patch",
  label: "清除捐贈碼",
  hint: "改開一般發票（依載具或紙本規則）",
  override: { values: { 捐贈碼: "" } },
};

/** 各欄位專屬的修正選項 */
function fieldFixes(invoice: Invoice, issue: Issue): Fix[] {
  const { field, message } = issue;
  const 名稱欄位 = invoice.發票種類 === "B2B" ? "B2B公司名稱" : "B2C買受人名稱";

  switch (field) {
    case "訂單編號": {
      const fixes: Fix[] = [{ kind: "edit", label: "修改訂單編號", field: "訂單編號" }];
      if (message.includes("重覆")) {
        fixes.push({
          kind: "hint",
          label: "或在「訂單編號加鹽」為整批加上識別碼，避免與先前開立的發票重號",
        });
      }
      return fixes;
    }

    case "B2B統一編號":
      return [
        switchToB2C(invoice),
        { kind: "edit", label: "修改統一編號", field: "B2B統一編號", hint: "8 碼數字" },
      ];

    case "B2B公司名稱":
      return [
        { kind: "edit", label: "補上公司名稱（改開 B2B）", field: "B2B公司名稱" },
        {
          kind: "patch",
          label: "確認開 B2C",
          hint: "清除統一編號",
          override: { values: { B2B統一編號: "" } },
        },
      ];

    case "買受人名稱":
      return [
        { kind: "edit", label: "填寫買受人名稱", field: 名稱欄位 },
      ];

    case "買受人地址":
      return [
        { kind: "edit", label: "修改地址", field: "買受人地址" },
        {
          kind: "patch",
          label: "清除地址",
          hint: "地址為非必填欄位",
          override: { values: { 買受人地址: "" } },
        },
      ];

    case "電子郵件":
      return [
        { kind: "edit", label: "修改 Email", field: "電子郵件" },
        paperFix,
      ];

    case "手機條碼載具":
      return [
        dropCarrier(invoice),
        { kind: "edit", label: "修改手機條碼", field: "手機條碼載具", hint: "／ + 7 碼" },
        paperFix,
      ];

    case "自然人憑證載具":
      return [
        dropCarrier(invoice),
        {
          kind: "edit",
          label: "修改自然人憑證",
          field: "自然人憑證載具",
          hint: "2 碼大寫英文 + 14 碼數字",
        },
        paperFix,
      ];

    case "捐贈碼": {
      const fixes: Fix[] = [
        dropDonateFix,
        { kind: "edit", label: "修改捐贈碼", field: "捐贈碼", hint: "3~7 碼數字" },
      ];
      return fixes;
    }

    case "發票金額":
      return [
        { kind: "edit", label: "修改發票金額", field: "發票金額", hint: "含稅總額" },
      ];

    case "商品名稱":
      return [
        { kind: "edit", label: "填寫商品名稱", field: "商品名稱" },
        { kind: "hint", label: "或到「發票與商品設定」填寫整批共用的預設商品名稱" },
      ];

    case "商品數量":
      return [
        { kind: "edit", label: "修改商品數量", field: "商品數量" },
        { kind: "hint", label: "或到「發票與商品設定」調整預設商品數量" },
      ];

    case "商品小計":
      return [
        { kind: "edit", label: "修改發票金額", field: "發票金額" },
      ];

    case "商品單位":
      return [{ kind: "hint", label: "請到「發票與商品設定」填寫商品單位（最長 2 字元）" }];

    case "稅率":
      return [{ kind: "hint", label: "請到「發票與商品設定」調整稅別與稅率" }];

    case "報關標記":
      return [{ kind: "hint", label: "請到「發票與商品設定」選擇報關標記" }];

    case "備註":
      return [{ kind: "edit", label: "修改備註", field: "備註" }];

    default:
      return [];
  }
}

/**
 * 這些問題來自整批共用的設定，每一列都會有同樣的狀況，
 * 逐列跳過沒有意義（也救不了其他列），因此只給提示。
 */
const BATCH_SETTING_FIELDS = new Set(["稅率", "報關標記", "商品單位"]);

/**
 * 依問題內容給出修正選項。
 *
 * 除了整批設定造成的問題外，一律附上「跳過此筆」——不論是錯誤還是提醒，
 * 都可能遇到無法在這裡處理的情況（例如統一編號檢查碼不符但確實是對方給的號碼），
 * 此時需要一條退路把它交給未開立清單人工處理。
 */
export function suggestFixes(invoice: Invoice, issue: Issue): Fix[] {
  const fixes = fieldFixes(invoice, issue);
  if (BATCH_SETTING_FIELDS.has(issue.field)) return fixes;

  // 提示排在最後，讓可點擊的動作集中在前面
  const actions = fixes.filter((fix) => fix.kind !== "hint");
  const hints = fixes.filter((fix) => fix.kind === "hint");
  const 原因 = `${issue.level === "error" ? "資料錯誤" : "資料提醒"}：${issue.message}`;
  return [...actions, skipFix(原因), ...hints];
}

/** 這一列是否被人工修改過 */
export function hasOverride(override: RowOverride | undefined): boolean {
  if (!override) return false;
  return Boolean(override.skip || override.forcePaper || Object.keys(override.values ?? {}).length);
}

/** 摘要說明這一列做了哪些修正，顯示在預覽列上 */
export function describeOverride(override: RowOverride): string[] {
  const parts: string[] = [];
  if (override.skip) parts.push(`已跳過：${override.skipReason || "人工略過"}`);
  if (override.forcePaper) parts.push("改為索取紙本");
  for (const [field, value] of Object.entries(override.values ?? {})) {
    parts.push(value === "" ? `已清除 ${field}` : `${field} 改為「${value}」`);
  }
  return parts;
}
