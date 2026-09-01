import { describe, expect, it } from "vitest";
import { buildInvoices, splitAmount } from "./invoice";
import { applySalt, generateSalt } from "./salt";
import { serialize, toDetailRecord, toItemRecords } from "./serialize";
import { createDefaultConfig, guessMapping } from "./config";
import { parseCsv } from "./sheet";
import {
  cleanCarrier,
  cleanField,
  cleanOrderNo,
  cleanTaxId,
  clean,
  parseAmount,
} from "./text";
import type { InvoiceConfig } from "./types";

const headers = [
  "訂單編號",
  "狀態",
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
    filters: [{ column: 1, operator: "equals", value: "已繳費" }],
    ...overrides,
  };
}

describe("文字清理", () => {
  it("去除前後空白、全形空白與零寬字元", () => {
    expect(clean("  王小明　")).toBe("王小明");
    expect(clean("​測試​")).toBe("測試");
    expect(clean("A\tB\nC")).toBe("A B C");
  });

  it("統一編號補滿 8 碼", () => {
    expect(cleanTaxId(12345678)).toBe("12345678");
    expect(cleanTaxId("0345678")).toBe("00345678");
    expect(cleanTaxId(" 1234-5678 ")).toBe("12345678");
  });

  it("載具轉半形大寫", () => {
    expect(cleanCarrier(" /abc123+ ")).toBe("/ABC123+");
    expect(cleanCarrier("／ＡＢ12345")).toBe("/AB12345");
  });

  it("金額容許千分位與貨幣符號", () => {
    expect(parseAmount("NT$ 1,050 元")).toBe(1050);
    expect(parseAmount("１０００")).toBe(1000);
    expect(parseAmount("")).toBeNaN();
  });

  it("文字欄位的半形逗號改為全形，避免破壞 txt 分隔", () => {
    expect(cleanField("台北市南港區,南港路")).toBe("台北市南港區，南港路");
  });

  it("自訂編號只保留英數字與底線", () => {
    expect(cleanOrderNo("2024-06-01#001")).toBe("2024_06_01_001");
  });
});

describe("加鹽", () => {
  it("不加鹽時維持原編號", () => {
    expect(applySalt("20240601001", "", "_")).toBe("20240601001");
  });

  it("附加自訂鹽", () => {
    expect(applySalt("20240601001", "R2", "_")).toBe("20240601001_R2");
  });

  it("超過 20 字元時截斷原編號、保留鹽", () => {
    const result = applySalt("A".repeat(30), "REDO", "_");
    expect(result).toHaveLength(20);
    expect(result.endsWith("_REDO")).toBe(true);
  });

  it("日期鹽依開立日產生", () => {
    const salt = generateSalt(
      { mode: "date", separator: "_", custom: "" },
      new Date("2026-09-01T10:00:00"),
    );
    expect(salt).toBe("20260901");
  });

  it("隨機鹽為 4 碼且不含易混淆字元", () => {
    const salt = generateSalt({ mode: "random", separator: "_", custom: "" });
    expect(salt).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
  });
});

describe("金額拆分", () => {
  it("應稅 5% 時銷售額 + 稅額 = 發票金額", () => {
    for (const total of [1, 99, 100, 1000, 1050, 12345, 99999]) {
      const { 銷售額合計, 稅額 } = splitAmount(total, "1", 5);
      expect(銷售額合計 + 稅額).toBe(total);
    }
  });

  it("1000 元含稅拆為 952 / 48（對應手冊範例）", () => {
    expect(splitAmount(1000, "1", 5)).toEqual({ 銷售額合計: 952, 稅額: 48 });
  });

  it("零稅率與免稅的稅額為 0", () => {
    expect(splitAmount(1000, "2", 0)).toEqual({ 銷售額合計: 1000, 稅額: 0 });
    expect(splitAmount(1000, "3", 0)).toEqual({ 銷售額合計: 1000, 稅額: 0 });
  });
});

describe("批次轉換", () => {
  const rows = [
    ["20240601001", "已繳費", "王小明", "", "", "wang@example.com", "", "", "1000"],
    ["20240601002", "已繳費", "李大華", "12345678", "大華股份有限公司", "lee@example.com", "", "", "1050"],
    ["20240601003", "未繳費", "陳小美", "", "", "chen@example.com", "", "", "500"],
    ["20240601004", "已繳費", "張三", "", "", "", "/ABC123+", "", "2100"],
    ["20240601005", "已繳費", "李四", "", "", "", "", "1106", "630"],
  ];

  it("依篩選條件排除未繳費的資料", () => {
    const result = buildInvoices(rows, configFor());
    expect(result.invoices).toHaveLength(4);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].sourceRow).toBe(4);
  });

  it("有統編與公司名稱時開立 B2B，索取紙本為 Y", () => {
    const invoice = buildInvoices(rows, configFor()).invoices[1];
    expect(invoice.發票種類).toBe("B2B");
    expect(invoice.買受人統一編號).toBe("12345678");
    expect(invoice.索取紙本發票).toBe("Y");
    expect(invoice.載具類別).toBe("");
    expect(invoice.銷售額合計).toBe(1000);
    expect(invoice.稅額).toBe(50);
  });

  it("B2C 有 Email 時使用 ezPay 電子發票載具", () => {
    const invoice = buildInvoices(rows, configFor()).invoices[0];
    expect(invoice.發票種類).toBe("B2C");
    expect(invoice.載具類別).toBe("2");
    expect(invoice.載具編號).toBe("wang@example.com");
    expect(invoice.索取紙本發票).toBe("N");
  });

  it("手機條碼載具優先於 ezPay 載具", () => {
    const invoice = buildInvoices(rows, configFor()).invoices[2];
    expect(invoice.載具類別).toBe("0");
    expect(invoice.載具編號).toBe("/ABC123+");
  });

  it("捐贈碼有效時清空載具並帶出受贈單位", () => {
    const invoice = buildInvoices(rows, configFor()).invoices[3];
    expect(invoice.捐贈碼).toBe("1106");
    expect(invoice.載具類別).toBe("");
    expect(invoice.索取紙本發票).toBe("N");
    expect(invoice.受贈單位).not.toBe("");
    expect(invoice.issues.filter((i) => i.level === "error")).toHaveLength(0);
  });

  it("B2C 商品單價含稅、B2B 商品單價未稅", () => {
    const [b2c, b2b] = buildInvoices(rows, configFor()).invoices;
    expect(b2c.items[0].商品小計).toBe(b2c.發票金額);
    expect(b2b.items[0].商品小計).toBe(b2b.銷售額合計);
  });

  it("自訂編號重覆時回報錯誤", () => {
    const dup = [rows[0], rows[0]];
    const result = buildInvoices(dup, configFor());
    expect(result.totals.錯誤筆數).toBe(1);
    expect(result.invoices[1].issues[0].message).toContain("重覆");
  });

  it("加鹽後可重開同一批發票而不重號", () => {
    const result = buildInvoices(
      rows,
      configFor({ salt: { mode: "custom", separator: "_", custom: "R2" } }),
    );
    expect(result.appliedSalt).toBe("R2");
    expect(result.invoices[0].商店自訂編號).toBe("20240601001_R2");
    expect(result.totals.錯誤筆數).toBe(0);
  });

  it("金額無法解析時回報錯誤", () => {
    const bad = [["X1", "已繳費", "王小明", "", "", "a@b.co", "", "", "免費"]];
    const result = buildInvoices(bad, configFor());
    expect(result.invoices[0].issues.some((i) => i.field === "發票金額")).toBe(true);
    expect(result.totals.錯誤筆數).toBe(1);
  });

  it("零稅率未填報關標記時回報錯誤", () => {
    const result = buildInvoices(rows, configFor({ 稅別: "2", 稅率: 0, 報關標記: "" }));
    expect(result.invoices[0].issues.some((i) => i.field === "報關標記")).toBe(true);
  });

  it("略過的原因會說明是哪個條件不符", () => {
    const result = buildInvoices(rows, configFor(), { headers });
    expect(result.skipped[0].reason).toBe("不符合條件：狀態 等於「已繳費」");
  });

  it("合計數字正確", () => {
    const totals = buildInvoices(rows, configFor()).totals;
    expect(totals.發票筆數).toBe(4);
    expect(totals.B2B筆數).toBe(1);
    expect(totals.B2C筆數).toBe(3);
    expect(totals.發票金額合計).toBe(1000 + 1050 + 2100 + 630);
    expect(totals.銷售額合計 + totals.稅額合計).toBe(totals.發票金額合計);
  });
});

describe("多條件篩選（交集）", () => {
  const rows = [
    ["A1", "已繳費", "王小明", "", "", "a@example.com", "", "", "1000"],
    ["A2", "已繳費", "李大華", "", "", "b@example.com", "", "", "2000"],
    ["A3", "未繳費", "陳小美", "", "", "c@example.com", "", "", "3000"],
    ["A4", "已取消", "張三", "", "", "", "", "", "4000"],
  ];

  it("多個條件必須全部符合", () => {
    const result = buildInvoices(
      rows,
      configFor({
        filters: [
          { column: 1, operator: "equals", value: "已繳費" },
          { column: 5, operator: "contains", value: "a@" },
        ],
      }),
    );
    expect(result.invoices.map((i) => i.原始訂單編號)).toEqual(["A1"]);
    expect(result.skipped).toHaveLength(3);
  });

  it("沒有條件時全部轉換", () => {
    const result = buildInvoices(rows, configFor({ filters: [] }));
    expect(result.invoices).toHaveLength(4);
    expect(result.skipped).toHaveLength(0);
  });

  it("支援不等於、不包含、為空白、不為空白", () => {
    const pick = (filters: InvoiceConfig["filters"]) =>
      buildInvoices(rows, configFor({ filters })).invoices.map((i) => i.原始訂單編號);

    expect(pick([{ column: 1, operator: "notEquals", value: "已繳費" }])).toEqual(["A3", "A4"]);
    expect(pick([{ column: 1, operator: "notContains", value: "已" }])).toEqual(["A3"]);
    expect(pick([{ column: 5, operator: "isEmpty", value: "" }])).toEqual(["A4"]);
    expect(pick([{ column: 5, operator: "notEmpty", value: "" }])).toEqual(["A1", "A2", "A3"]);
  });

  it("未指定欄位的條件視為不設限", () => {
    const result = buildInvoices(
      rows,
      configFor({ filters: [{ column: -1, operator: "equals", value: "無關緊要" }] }),
    );
    expect(result.invoices).toHaveLength(4);
  });
});

describe("略過 0 元訂單", () => {
  const rows = [
    ["B1", "已繳費", "王小明", "", "", "a@example.com", "", "", "1000"],
    ["B2", "已繳費", "李大華", "", "", "b@example.com", "", "", "0"],
    ["B3", "已繳費", "陳小美", "", "", "c@example.com", "", "", ""],
    ["B4", "已繳費", "張三", "", "", "d@example.com", "", "", "-100"],
    ["B5", "已繳費", "李四", "", "", "e@example.com", "", "", "免費"],
  ];

  it("預設略過 0 元、空白與負數金額，且不算錯誤", () => {
    const result = buildInvoices(rows, configFor());
    expect(result.invoices.map((i) => i.原始訂單編號)).toEqual(["B1", "B5"]);
    expect(result.skipped.map((s) => s.sourceRow)).toEqual([3, 4, 5]);
    expect(result.skipped[0].reason).toBe("發票金額為 0 元");
  });

  it("無法解析的金額仍視為錯誤，不會被當成 0 元靜靜略過", () => {
    const result = buildInvoices(rows, configFor());
    const 免費 = result.invoices.find((i) => i.原始訂單編號 === "B5");
    expect(免費?.issues.some((issue) => issue.field === "發票金額")).toBe(true);
  });

  it("取消勾選時 0 元訂單會被標記為錯誤", () => {
    const result = buildInvoices(rows, configFor({ 略過零元訂單: false }));
    expect(result.invoices).toHaveLength(5);
    expect(result.totals.錯誤筆數).toBe(4);
  });

  it("尚未對應發票金額欄位時不啟用略過，避免整批無聲消失", () => {
    const config = configFor();
    const result = buildInvoices(rows, {
      ...config,
      mapping: { ...config.mapping, 發票金額: -1 },
    });
    expect(result.invoices).toHaveLength(5);
    expect(result.skipped).toHaveLength(0);
  });

  it("0 元訂單不列入合計", () => {
    const totals = buildInvoices(rows, configFor()).totals;
    expect(totals.發票金額合計).toBe(1000);
  });
});

describe("輸出格式", () => {
  const rows = [["20240601001", "已繳費", "王小明", "", "", "wang@example.com", "", "", "1000"]];

  it("V1.0.5 的明細錄 S 為 18 欄、I 為 8 欄", () => {
    const result = buildInvoices(rows, configFor());
    expect(toDetailRecord(result.invoices[0], "v1.0.5")).toHaveLength(18);
    expect(toItemRecords(result.invoices[0], "v1.0.5")[0]).toHaveLength(8);
  });

  it("舊版格式為 17 欄 / 7 欄", () => {
    const result = buildInvoices(rows, configFor());
    expect(toDetailRecord(result.invoices[0], "legacy")).toHaveLength(17);
    expect(toItemRecords(result.invoices[0], "legacy")[0]).toHaveLength(7);
  });

  it("報關標記位於第 14 欄", () => {
    const result = buildInvoices(rows, configFor({ 稅別: "2", 稅率: 0, 報關標記: "2" }));
    expect(toDetailRecord(result.invoices[0], "v1.0.5")[13]).toBe("2");
  });

  it("首錄為 H,INVO,會員編號,商店代號,開立日期", () => {
    const config = configFor();
    const result = buildInvoices(rows, config);
    const [first] = serialize(result, { ...config, withBom: false }).split("\r\n");
    expect(first).toBe("H,INVO,C123456789,36191,20260901");
  });

  it("每張發票輸出一列 S 與其後的 I", () => {
    const config = configFor({ withBom: false });
    const lines = serialize(buildInvoices(rows, config), config).split("\r\n");
    expect(lines.map((l) => l[0])).toEqual(["H", "S", "I"]);
  });

  it("輸出不含半形逗號造成的欄位錯位", () => {
    const withComma = [
      ["20240601001", "已繳費", "王, 小明", "", "", "wang@example.com", "", "", "1000"],
    ];
    const config = configFor({ withBom: false });
    const lines = serialize(buildInvoices(withComma, config), config).split("\r\n");
    expect(lines[1].split(",")).toHaveLength(18);
  });
});

describe("CSV 解析", () => {
  it("保留前導零", () => {
    expect(parseCsv("a,b\n0912345678,00123")).toEqual([
      ["a", "b"],
      ["0912345678", "00123"],
    ]);
  });

  it("處理引號內的逗號與換行", () => {
    expect(parseCsv('a,b\n"台北市,南港區","第一行\n第二行"')).toEqual([
      ["a", "b"],
      ["台北市,南港區", "第一行\n第二行"],
    ]);
  });

  it("處理跳脫的雙引號與 CRLF", () => {
    expect(parseCsv('a\r\n"他說""你好"""')).toEqual([["a"], ['他說"你好"']]);
  });
});

describe("欄位自動對應", () => {
  it("依標題猜出欄位", () => {
    const mapping = guessMapping(headers);
    expect(mapping.訂單編號).toBe(0);
    expect(mapping.B2C買受人名稱).toBe(2);
    expect(mapping.B2B統一編號).toBe(3);
    expect(mapping.B2B公司名稱).toBe(4);
    expect(mapping.電子郵件).toBe(5);
    expect(mapping.手機條碼載具).toBe(6);
    expect(mapping.捐贈碼).toBe(7);
    expect(mapping.發票金額).toBe(8);
  });

  it("找不到對應時維持未使用", () => {
    const mapping = guessMapping(["甲", "乙"]);
    expect(mapping.訂單編號).toBe(-1);
    expect(mapping.發票金額).toBe(-1);
  });
});
