import { describe, expect, it } from "vitest";
import { buildInvoices } from "./invoice";
import { mergeOverride, suggestFixes, describeOverride, hasOverride } from "./fixes";
import { buildUnissuedCsv, unissuedFileName } from "./unissued";
import { createDefaultConfig, guessMapping } from "./config";
import type { Fix, InvoiceConfig, RowOverrides } from "./types";

const headers = [
  "訂單編號",
  "姓名",
  "統一編號",
  "公司名稱",
  "電子信箱",
  "手機條碼",
  "捐贈碼",
  "發票金額",
];

function configFor(overrides: Partial<InvoiceConfig> = {}): InvoiceConfig {
  const base = createDefaultConfig(new Date("2026-09-01T10:00:00"));
  return {
    ...base,
    會員編號: "C123456789",
    商店代號: "36191",
    mapping: { ...base.mapping, ...guessMapping(headers) },
    filters: [],
    ...overrides,
  };
}

const rows = [
  // 0: 統編格式錯誤的 B2B（9 碼，非 8 碼；4 碼以下會被視為 Excel 去掉前導零而補滿）
  ["A1", "王小明", "123456789", "大華股份有限公司", "wang@example.com", "", "", "1050"],
  // 1: 手機條碼格式錯誤
  ["A2", "李大華", "", "", "lee@example.com", "/BAD", "", "1000"],
  // 2: 沒有 Email 也沒有名字
  ["A3", "", "", "", "", "", "", "500"],
  // 3: 正常
  ["A4", "張三", "", "", "chang@example.com", "", "", "2100"],
];

const build = (overrides: RowOverrides = {}, config = configFor()) =>
  buildInvoices(rows, config, { headers, overrides });

const firstErrorOf = (sourceRow: number, overrides: RowOverrides = {}) => {
  const invoice = build(overrides).invoices.find((i) => i.sourceRow === sourceRow)!;
  return { invoice, issue: invoice.issues.find((i) => i.level === "error")! };
};

const labels = (fixes: Fix[]) => fixes.map((f) => f.label);
const patchNamed = (fixes: Fix[], label: string) => {
  const fix = fixes.find((f) => f.label === label);
  if (!fix || fix.kind !== "patch") throw new Error(`找不到修正選項：${label}`);
  return fix.override;
};

describe("修正選項", () => {
  it("統編錯誤時可改開 B2C、修改統編或跳過", () => {
    const { invoice, issue } = firstErrorOf(2);
    expect(issue.field).toBe("B2B統一編號");
    expect(labels(suggestFixes(invoice, issue))).toEqual([
      "改開 B2C 發票",
      "修改統一編號",
      "跳過此筆",
    ]);
  });

  it("改開 B2C 後統編清空、抬頭轉為買受人姓名，且不再有錯誤", () => {
    const { invoice, issue } = firstErrorOf(2);
    const override = patchNamed(suggestFixes(invoice, issue), "改開 B2C 發票");

    const fixed = build({ 2: override }).invoices.find((i) => i.sourceRow === 2)!;
    expect(fixed.發票種類).toBe("B2C");
    expect(fixed.買受人統一編號).toBe("");
    expect(fixed.買受人名稱).toBe("大華股份有限公司");
    expect(fixed.issues.filter((i) => i.level === "error")).toHaveLength(0);
  });

  it("載具格式錯誤時可改用 ezPay 會員載具", () => {
    const { invoice, issue } = firstErrorOf(3);
    expect(issue.field).toBe("手機條碼載具");
    const fixes = suggestFixes(invoice, issue);
    expect(labels(fixes)).toContain("改用 ezPay 會員載具");

    const fixed = build({ 3: patchNamed(fixes, "改用 ezPay 會員載具") }).invoices.find(
      (i) => i.sourceRow === 3,
    )!;
    expect(fixed.載具類別).toBe("2");
    expect(fixed.載具編號).toBe("lee@example.com");
    expect(fixed.issues.filter((i) => i.level === "error")).toHaveLength(0);
  });

  it("沒有 Email 時載具修正改稱「清除載具」並落回索取紙本", () => {
    const noEmail = [["A9", "王五", "", "", "", "/BAD", "", "1000"]];
    const invoice = buildInvoices(noEmail, configFor(), { headers }).invoices[0];
    const issue = invoice.issues.find((i) => i.field === "手機條碼載具")!;
    const fixes = suggestFixes(invoice, issue);
    expect(labels(fixes)).toContain("清除載具");

    const fixed = buildInvoices(noEmail, configFor(), {
      headers,
      overrides: { 2: patchNamed(fixes, "清除載具") },
    }).invoices[0];
    expect(fixed.索取紙本發票).toBe("Y");
    expect(fixed.載具類別).toBe("");
  });

  it("改為索取紙本會清掉載具與捐贈碼", () => {
    const withBoth = [["A9", "王五", "", "", "a@b.co", "/ABC1234", "1106", "1000"]];
    const fixed = buildInvoices(withBoth, configFor(), {
      headers,
      overrides: { 2: { forcePaper: true } },
    }).invoices[0];
    expect(fixed.索取紙本發票).toBe("Y");
    expect(fixed.載具類別).toBe("");
    expect(fixed.捐贈碼).toBe("");
  });

  it("買受人名稱為空時可直接填寫", () => {
    const { invoice, issue } = firstErrorOf(4);
    expect(issue.field).toBe("買受人名稱");
    const edit = suggestFixes(invoice, issue).find((f) => f.kind === "edit");
    expect(edit).toMatchObject({ field: "B2C買受人名稱" });

    const fixed = build({ 4: { values: { B2C買受人名稱: "陳小美" } } }).invoices.find(
      (i) => i.sourceRow === 4,
    )!;
    expect(fixed.買受人名稱).toBe("陳小美");
  });

  it("統編檢查碼不符（提醒）也能跳過此筆", () => {
    // 00000010 為 8 碼但檢查碼不符，只會產生提醒
    const oddTaxId = [["A9", "王五", "00000010", "某某公司", "a@b.co", "", "", "1050"]];
    const invoice = buildInvoices(oddTaxId, configFor(), { headers }).invoices[0];
    const issue = invoice.issues.find((i) => i.field === "B2B統一編號")!;

    expect(issue.level).toBe("warning");
    expect(issue.message).toContain("檢查碼不符");
    expect(labels(suggestFixes(invoice, issue))).toEqual([
      "改開 B2C 發票",
      "修改統一編號",
      "跳過此筆",
    ]);
  });

  it("跳過的原因會帶上原始訊息，方便在未開立清單辨識", () => {
    const oddTaxId = [["A9", "王五", "00000010", "某某公司", "a@b.co", "", "", "1050"]];
    const invoice = buildInvoices(oddTaxId, configFor(), { headers }).invoices[0];
    const issue = invoice.issues.find((i) => i.field === "B2B統一編號")!;
    const skip = suggestFixes(invoice, issue).find((f) => f.kind === "skip");

    expect(skip).toMatchObject({
      reason: "資料提醒：統一編號「00000010」檢查碼不符，請再確認",
    });
  });

  it("每一種問題都提供跳過此筆（整批設定除外）", () => {
    const invoice = build().invoices[0];
    const fields = [
      "訂單編號",
      "B2B統一編號",
      "B2B公司名稱",
      "買受人名稱",
      "買受人地址",
      "電子郵件",
      "手機條碼載具",
      "自然人憑證載具",
      "捐贈碼",
      "發票金額",
      "商品名稱",
      "商品數量",
      "商品小計",
      "備註",
    ];
    for (const field of fields) {
      for (const level of ["error", "warning"] as const) {
        const fixes = suggestFixes(invoice, { level, field, message: "測試訊息" });
        expect(fixes.some((f) => f.kind === "skip"), `${field} / ${level}`).toBe(true);
      }
    }
  });

  it("提示排在可點擊的動作之後", () => {
    const invoice = build().invoices[0];
    const fixes = suggestFixes(invoice, {
      level: "error",
      field: "商品名稱",
      message: "商品名稱為必填",
    });
    const hintIndex = fixes.findIndex((f) => f.kind === "hint");
    expect(hintIndex).toBe(fixes.length - 1);
  });

  it("全批次設定的問題只給提示，不做逐列修正", () => {
    const invoice = build().invoices[0];
    const fixes = suggestFixes(invoice, {
      level: "error",
      field: "稅率",
      message: "稅別為應稅時一般稅率應為 5",
    });
    expect(fixes).toHaveLength(1);
    expect(fixes[0].kind).toBe("hint");
  });

  it("編號重覆時提示可用加鹽整批處理", () => {
    const invoice = build().invoices[0];
    const fixes = suggestFixes(invoice, {
      level: "error",
      field: "訂單編號",
      message: "自訂編號「A1」與第 2 列重覆",
    });
    expect(fixes.some((f) => f.kind === "hint" && f.label.includes("加鹽"))).toBe(true);
  });
});

describe("修正的合併與描述", () => {
  it("多次修正會累積而不互相覆蓋", () => {
    const merged = mergeOverride(
      { values: { B2B統一編號: "" } },
      { values: { B2C買受人名稱: "王小明" } },
    );
    expect(merged.values).toEqual({ B2B統一編號: "", B2C買受人名稱: "王小明" });
  });

  it("能判斷是否有修正並產生摘要", () => {
    expect(hasOverride(undefined)).toBe(false);
    expect(hasOverride({})).toBe(false);
    expect(hasOverride({ values: { 捐贈碼: "" } })).toBe(true);
    expect(describeOverride({ skip: true, skipReason: "統編錯誤" })).toEqual(["已跳過：統編錯誤"]);
    expect(describeOverride({ values: { 捐贈碼: "" } })).toEqual(["已清除 捐贈碼"]);
    expect(describeOverride({ values: { 電子郵件: "a@b.co" } })).toEqual([
      "電子郵件 改為「a@b.co」",
    ]);
  });
});

describe("跳過與未開立清單", () => {
  it("跳過的資料列不會開立，並帶著原因進入未開立清單", () => {
    const result = build({ 2: { skip: true, skipReason: "統一編號錯誤" } });
    expect(result.invoices.map((i) => i.原始訂單編號)).toEqual(["A2", "A3", "A4"]);
    const skipped = result.skipped.find((s) => s.sourceRow === 2)!;
    expect(skipped.reason).toBe("統一編號錯誤");
    expect(skipped.row).toEqual(rows[0]);
  });

  it("跳過的資料列不列入合計", () => {
    const before = build().totals.發票金額合計;
    const after = build({ 2: { skip: true, skipReason: "x" } }).totals.發票金額合計;
    expect(before - after).toBe(1050);
  });

  it("未開立清單包含原因與完整的原始欄位", () => {
    const result = build({ 2: { skip: true, skipReason: "統一編號錯誤" } });
    const csv = buildUnissuedCsv(result, headers);
    const lines = csv.replace(/^﻿/, "").split("\r\n");

    expect(lines[0]).toBe(`來源列號,未開立原因,${headers.join(",")}`);
    expect(lines[1]).toBe(
      "2,統一編號錯誤,A1,王小明,123456789,大華股份有限公司,wang@example.com,,,1050",
    );
  });

  it("被篩選條件與 0 元略過的資料也會列入", () => {
    const withZero = [...rows, ["A5", "趙六", "", "", "z@example.com", "", "", "0"]];
    const result = buildInvoices(
      withZero,
      configFor({ filters: [{ column: 1, operator: "notEmpty", value: "" }] }),
      { headers },
    );
    const csv = buildUnissuedCsv(result, headers);
    expect(csv).toContain("發票金額為 0 元");
    expect(csv).toContain("不符合條件：姓名 不為空白");
  });

  it("含逗號的欄位會被正確跳脫", () => {
    const withComma = [["A9", "王, 五", "", "", "a@b.co", "", "", "0"]];
    const result = buildInvoices(withComma, configFor(), { headers });
    const csv = buildUnissuedCsv(result, headers);
    expect(csv).toContain('"王, 五"');
  });

  it("沒有未開立資料時仍輸出標題列", () => {
    const csv = buildUnissuedCsv(build(), headers);
    expect(csv.replace(/^﻿/, "").split("\r\n")).toHaveLength(1);
  });

  it("檔名帶商店代號與開立日期", () => {
    expect(unissuedFileName(configFor())).toBe("未開立清單_36191_20260901.csv");
  });
});
