/**
 * 對照 ezPay 批次檔檢查工具的規則清單，確認產生端都已涵蓋。
 */
import { describe, expect, it } from "vitest";
import { buildInvoices } from "./invoice";
import { buildFileChecks } from "./fileChecks";
import { serialize } from "./serialize";
import { createDefaultConfig, guessMapping } from "./config";
import { byteLength, isValidDateString, isValidTaxId } from "./text";
import type { Invoice, InvoiceConfig } from "./types";

const headers = [
  "訂單編號",
  "姓名",
  "統一編號",
  "公司名稱",
  "電子信箱",
  "手機條碼",
  "自然人憑證",
  "捐贈碼",
  "地址",
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

/** 建一列資料，欄位順序同 headers */
function row(values: Partial<Record<(typeof headers)[number], string>>): string[] {
  return headers.map((h) => values[h] ?? "");
}

function build(values: Parameters<typeof row>[0], overrides: Partial<InvoiceConfig> = {}): Invoice {
  return buildInvoices([row(values)], configFor(overrides)).invoices[0];
}

const errorsOf = (invoice: Invoice) =>
  invoice.issues.filter((i) => i.level === "error").map((i) => i.field);
const warningsOf = (invoice: Invoice) =>
  invoice.issues.filter((i) => i.level === "warning").map((i) => i.field);

describe("統一編號檢查碼", () => {
  it("接受有效的統編", () => {
    for (const id of ["04595257", "12345675", "53212539"]) {
      expect(isValidTaxId(id)).toBe(true);
    }
  });

  it("拒絕檢查碼不符或長度錯誤的統編", () => {
    expect(isValidTaxId("12345678")).toBe(false);
    expect(isValidTaxId("1234567")).toBe(false);
    expect(isValidTaxId("abcdefgh")).toBe(false);
  });

  it("B2B 統編檢查碼不符時提出警告", () => {
    const invoice = build({
      訂單編號: "A1",
      統一編號: "12345678",
      公司名稱: "測試公司",
      發票金額: "1050",
    });
    expect(warningsOf(invoice)).toContain("B2B統一編號");
  });

  it("統編有效時不提出警告", () => {
    const invoice = build({
      訂單編號: "A1",
      統一編號: "04595257",
      公司名稱: "測試公司",
      發票金額: "1050",
    });
    expect(warningsOf(invoice)).not.toContain("B2B統一編號");
  });
});

describe("日期驗證", () => {
  it("接受存在的日期", () => {
    expect(isValidDateString("20260901")).toBe(true);
    expect(isValidDateString("20240229")).toBe(true);
  });

  it("拒絕不存在或格式錯誤的日期", () => {
    expect(isValidDateString("20230229")).toBe(false);
    expect(isValidDateString("20261301")).toBe(false);
    expect(isValidDateString("2026091")).toBe(false);
  });
});

describe("買受人欄位", () => {
  it("買受人名稱為空是錯誤", () => {
    const invoice = build({ 訂單編號: "A1", 發票金額: "1000", 電子信箱: "a@b.co" });
    expect(errorsOf(invoice)).toContain("買受人名稱");
  });

  it("名稱以位元組計超過上限時提出警告", () => {
    // B2C 上限 30 字元，26 個中文字 = 52 位元組
    const invoice = build({
      訂單編號: "A1",
      姓名: "王".repeat(26),
      發票金額: "1000",
      電子信箱: "a@b.co",
    });
    expect(byteLength("王".repeat(26))).toBeGreaterThan(30);
    expect(warningsOf(invoice)).toContain("買受人名稱");
  });

  it("地址過長時提出警告", () => {
    const invoice = build({
      訂單編號: "A1",
      姓名: "王小明",
      地址: "台北市".repeat(40),
      發票金額: "1000",
      電子信箱: "a@b.co",
    });
    expect(warningsOf(invoice)).toContain("買受人地址");
  });
});

describe("稅別與稅率一致性", () => {
  it("應稅稅率不是 5 時回報錯誤", () => {
    const invoice = build({ 訂單編號: "A1", 姓名: "王", 發票金額: "1000" }, { 稅別: "1", 稅率: 10 });
    expect(errorsOf(invoice)).toContain("稅率");
  });

  it("應稅稅率為 5 時通過", () => {
    const invoice = build({ 訂單編號: "A1", 姓名: "王", 發票金額: "1000" }, { 稅別: "1", 稅率: 5 });
    expect(errorsOf(invoice)).not.toContain("稅率");
  });

  it("特種稅率必須大於 0", () => {
    const invoice = build({ 訂單編號: "A1", 姓名: "王", 發票金額: "1000" }, { 稅別: "4", 稅率: 0 });
    expect(errorsOf(invoice)).toContain("稅率");
  });

  it("零稅率與免稅的稅率固定為 0 且稅額為 0", () => {
    const invoice = build(
      { 訂單編號: "A1", 姓名: "王", 發票金額: "1000" },
      { 稅別: "3", 稅率: 5 },
    );
    expect(invoice.稅率).toBe(0);
    expect(invoice.稅額).toBe(0);
    expect(errorsOf(invoice)).not.toContain("稅率");
  });
});

describe("商品欄位", () => {
  it("商品名稱為空是錯誤", () => {
    const invoice = build(
      { 訂單編號: "A1", 姓名: "王", 發票金額: "1000" },
      { 預設商品名稱: "  " },
    );
    expect(errorsOf(invoice)).toContain("商品名稱");
  });

  it("商品單位為空是錯誤", () => {
    const invoice = build(
      { 訂單編號: "A1", 姓名: "王", 發票金額: "1000" },
      { 預設商品單位: "" },
    );
    expect(errorsOf(invoice)).toContain("商品單位");
  });

  it("商品數量超過 5 位數是錯誤", () => {
    const invoice = build(
      { 訂單編號: "A1", 姓名: "王", 發票金額: "1000000" },
      { 預設商品數量: 1000000 },
    );
    expect(errorsOf(invoice)).toContain("商品數量");
  });

  it("商品小計超過 10 位數是錯誤", () => {
    const invoice = build({ 訂單編號: "A1", 姓名: "王", 發票金額: "99999999999" });
    expect(errorsOf(invoice)).toContain("商品小計");
  });

  it("金額無法被數量整除時退回數量 1，但發票金額不變", () => {
    // 例如買 3 個、總價 2 元：單價會是 0.667，不符合規格的整數要求
    const invoice = build(
      { 訂單編號: "A1", 姓名: "王", 發票金額: "2", 電子信箱: "a@b.co" },
      { 預設商品數量: 3 },
    );
    const item = invoice.items[0];

    expect(item.商品數量).toBe(1);
    expect(item.商品單價).toBe(2);
    expect(item.商品小計).toBe(2);
    expect(invoice.發票金額).toBe(2);
    expect(invoice.銷售額合計 + invoice.稅額).toBe(invoice.發票金額);
    expect(warningsOf(invoice)).toContain("商品數量");
  });

  it("數量非整數時無條件捨去並提出警告", () => {
    const invoice = build(
      { 訂單編號: "A1", 姓名: "王", 發票金額: "1000", 電子信箱: "a@b.co" },
      { 預設商品數量: 1.5 },
    );
    expect(invoice.items[0].商品數量).toBe(1);
    expect(invoice.issues.some((i) => i.message.includes("非整數"))).toBe(true);
  });

  it("數量為 0 或負數時退回 1 並提出警告", () => {
    for (const 預設商品數量 of [0, -3]) {
      const invoice = build(
        { 訂單編號: "A1", 姓名: "王", 發票金額: "1000", 電子信箱: "a@b.co" },
        { 預設商品數量 },
      );
      expect(invoice.items[0].商品數量).toBe(1);
      expect(invoice.issues.some((i) => i.message.includes("無效"))).toBe(true);
    }
  });

  it("能整除時保留原數量", () => {
    const invoice = build(
      { 訂單編號: "A1", 姓名: "王", 發票金額: "2100", 電子信箱: "a@b.co" },
      { 預設商品數量: 3 },
    );
    expect(invoice.items[0]).toMatchObject({ 商品數量: 3, 商品單價: 700, 商品小計: 2100 });
    expect(warningsOf(invoice)).not.toContain("商品數量");
  });

  it("任何數量與金額組合，發票金額與品項小計都不會算錯", () => {
    for (const qty of [1, 2, 3, 7, 12]) {
      for (const amount of [1, 2, 99, 999, 1000, 1050, 2100, 12345]) {
        const invoice = build(
          { 訂單編號: "A1", 姓名: "王", 發票金額: String(amount), 電子信箱: "a@b.co" },
          { 預設商品數量: qty },
        );
        const item = invoice.items[0];
        // 規格三條硬性要求
        expect(item.商品數量 * item.商品單價).toBe(item.商品小計);
        expect(Number.isInteger(item.商品單價)).toBe(true);
        expect(invoice.銷售額合計 + invoice.稅額).toBe(invoice.發票金額);
        // 金額必須等於來源資料，不因數量而改變
        expect(invoice.發票金額).toBe(amount);
        // B2C 品項小計為含稅總額
        expect(item.商品小計).toBe(amount);
      }
    }
  });

  it("數量 × 單價 = 小計 恆成立", () => {
    for (const [金額, 數量] of [
      ["1000", 1],
      ["1000", 3],
      ["900", 3],
      ["1050", 2],
    ] as const) {
      const invoice = build(
        { 訂單編號: "A1", 姓名: "王", 發票金額: 金額 },
        { 預設商品數量: 數量 },
      );
      const item = invoice.items[0];
      expect(item.商品數量 * item.商品單價).toBe(item.商品小計);
      expect(Number.isInteger(item.商品單價)).toBe(true);
    }
  });
});

describe("載具 / 捐贈 / 紙本 三選一", () => {
  it("有載具時捐贈碼為空且索取紙本為 N", () => {
    const invoice = build({ 訂單編號: "A1", 姓名: "王", 手機條碼: "/ABC123+", 發票金額: "1000" });
    expect(invoice.捐贈碼).toBe("");
    expect(invoice.索取紙本發票).toBe("N");
  });

  it("有捐贈碼時載具為空且索取紙本為 N", () => {
    const invoice = build({ 訂單編號: "A1", 姓名: "王", 捐贈碼: "1106", 發票金額: "1000" });
    expect(invoice.載具類別).toBe("");
    expect(invoice.載具編號).toBe("");
    expect(invoice.索取紙本發票).toBe("N");
  });

  it("B2C 無載具無捐贈時索取紙本為 Y", () => {
    const invoice = build({ 訂單編號: "A1", 姓名: "王", 發票金額: "1000" });
    expect(invoice.索取紙本發票).toBe("Y");
  });

  it("B2B 索取紙本必為 Y 且不帶載具", () => {
    const invoice = build({
      訂單編號: "A1",
      統一編號: "04595257",
      公司名稱: "測試公司",
      手機條碼: "/ABC123+",
      捐贈碼: "1106",
      發票金額: "1050",
    });
    expect(invoice.索取紙本發票).toBe("Y");
    expect(invoice.載具類別).toBe("");
    expect(invoice.捐贈碼).toBe("");
  });

  it("自然人憑證格式錯誤時回報錯誤", () => {
    const invoice = build({ 訂單編號: "A1", 姓名: "王", 自然人憑證: "AB123", 發票金額: "1000" });
    expect(errorsOf(invoice)).toContain("自然人憑證載具");
  });

  it("B2C 不帶買受人統一編號", () => {
    const invoice = build({ 訂單編號: "A1", 姓名: "王", 統一編號: "04595257", 發票金額: "1000" });
    expect(invoice.發票種類).toBe("B2C");
    expect(invoice.買受人統一編號).toBe("");
  });
});

describe("檔案層級檢查", () => {
  const rows = [
    row({ 訂單編號: "A1", 姓名: "王小明", 電子信箱: "a@example.com", 發票金額: "1000" }),
  ];

  function checksFor(config: InvoiceConfig, now = new Date("2026-09-01T10:00:00")) {
    const result = buildInvoices(rows, config);
    return buildFileChecks(result, config, serialize(result, config), now);
  }

  const find = (checks: ReturnType<typeof checksFor>, keyword: string) =>
    checks.find((c) => c.message.includes(keyword));

  it("正常檔案全部通過", () => {
    const checks = checksFor(configFor());
    expect(checks.every((c) => c.level === "pass")).toBe(true);
  });

  it("開立日期非今天時提出警告", () => {
    const checks = checksFor(configFor({ 開立日期: "20260830" }));
    expect(find(checks, "並非今天")?.level).toBe("warning");
  });

  it("開立日期無效時回報錯誤", () => {
    const checks = checksFor(configFor({ 開立日期: "20260230" }));
    expect(find(checks, "不是有效的")?.level).toBe("error");
  });

  it("超過 800KB 時回報錯誤並建議拆檔數", () => {
    const many = Array.from({ length: 8000 }, (_, i) =>
      row({
        訂單編號: `A${i}`,
        姓名: "王小明",
        電子信箱: "someone@example.com",
        地址: "台北市南港區南港路二段 97 號 8 樓",
        發票金額: "1000",
      }),
    );
    const config = configFor();
    const result = buildInvoices(many, config);
    const checks = buildFileChecks(result, config, serialize(result, config));
    const size = checks.find((c) => c.message.includes("800KB"));
    expect(size?.level).toBe("error");
    expect(size?.message).toMatch(/拆成約 \d+ 個檔案/);
  });

  it("沒有明細錄 S 時回報錯誤", () => {
    const config = configFor();
    const result = buildInvoices([], config);
    const checks = buildFileChecks(result, config, serialize(result, config));
    expect(find(checks, "沒有任何明細錄")?.level).toBe("error");
  });

  it("自訂編號重覆時回報 LIB10003", () => {
    const config = configFor();
    const dup = [rows[0], rows[0]];
    const result = buildInvoices(dup, config);
    const checks = buildFileChecks(result, config, serialize(result, config));
    expect(find(checks, "重覆")?.code).toBe("LIB10003");
  });

  it("每一列的欄位數都正確", () => {
    const config = configFor();
    const result = buildInvoices(rows, config);
    const lines = serialize(result, { ...config, withBom: false }).split("\r\n");
    expect(lines.filter((l) => l.startsWith("H,"))[0].split(",")).toHaveLength(5);
    expect(lines.filter((l) => l.startsWith("S,"))[0].split(",")).toHaveLength(18);
    expect(lines.filter((l) => l.startsWith("I,"))[0].split(",")).toHaveLength(8);
  });
});
