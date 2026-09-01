import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSaved,
  createDefaultConfig,
  loadConfig,
  loadRememberedColumns,
  rememberColumns,
  resolveColumns,
  saveConfig,
  validateAccountCode,
} from "./config";
import { sanitizeAccountCode } from "./text";
import { UNMAPPED } from "./types";

/** 以最小實作模擬 localStorage，讓儲存邏輯能在 node 環境測試 */
function installLocalStorage() {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

const headers = ["訂單編號", "繳費狀態", "姓名", "統一編號", "公司名稱", "電子信箱", "發票金額"];

describe("會員編號 / 商店代號", () => {
  it("自動移除空白、Tab、全形空白與零寬字元", () => {
    expect(sanitizeAccountCode("  C123456789  ")).toBe("C123456789");
    expect(sanitizeAccountCode("C123\t456789")).toBe("C123456789");
    expect(sanitizeAccountCode("36 191")).toBe("36191");
    expect(sanitizeAccountCode("　3430112　")).toBe("3430112");
    expect(sanitizeAccountCode("361​91")).toBe("36191");
  });

  it("全形英數字轉為半形", () => {
    expect(sanitizeAccountCode("Ｃ１２３４５")).toBe("C12345");
  });

  it("合法的編號沒有錯誤訊息", () => {
    expect(validateAccountCode("會員編號", "C123456789")).toBe("");
    expect(validateAccountCode("商店代號", "36191")).toBe("");
    expect(validateAccountCode("商店代號", "SHOP_01-A")).toBe("");
  });

  it("空值不報錯，交由必填提示處理", () => {
    expect(validateAccountCode("商店代號", "")).toBe("");
  });

  it("列出不合法的字元", () => {
    expect(validateAccountCode("商店代號", "36191,")).toContain("「,」");
    expect(validateAccountCode("會員編號", "C123@45")).toContain("「@」");
    expect(validateAccountCode("商店代號", "商店36191")).toContain("「商」");
  });

  it("重複的不合法字元只列出一次", () => {
    const message = validateAccountCode("商店代號", "3,6,1,9,1");
    expect(message.match(/「,」/g)).toHaveLength(1);
  });
});

describe("設定儲存", () => {
  beforeEach(() => {
    installLocalStorage();
    clearSaved();
  });

  it("記住商店資料與發票設定", () => {
    const config = createDefaultConfig();
    saveConfig({ ...config, 會員編號: "C123456789", 商店代號: "36191", 預設商品單位: "堂" });

    const loaded = loadConfig();
    expect(loaded?.會員編號).toBe("C123456789");
    expect(loaded?.商店代號).toBe("36191");
    expect(loaded?.預設商品單位).toBe("堂");
  });

  it("開立日期不沿用上次的舊日期", () => {
    saveConfig({ ...createDefaultConfig(), 開立日期: "20200101" });
    expect(loadConfig()?.開立日期).toBe(createDefaultConfig().開立日期);
  });

  it("以欄位名稱而非索引記住欄位對應", () => {
    const config = createDefaultConfig();
    rememberColumns(headers, {
      ...config,
      mapping: { ...config.mapping, 訂單編號: 0, 發票金額: 6 },
      filters: [{ column: 1, operator: "equals", value: "已繳費" }],
    });

    const remembered = loadRememberedColumns();
    expect(remembered?.mapping.訂單編號).toBe("訂單編號");
    expect(remembered?.mapping.發票金額).toBe("發票金額");
    expect(remembered?.filters).toEqual([
      { column: "繳費狀態", operator: "equals", value: "已繳費" },
    ]);
  });

  it("欄位順序改變時仍能正確還原", () => {
    const config = createDefaultConfig();
    rememberColumns(headers, {
      ...config,
      mapping: { ...config.mapping, 訂單編號: 0, 發票金額: 6 },
      filters: [{ column: 1, operator: "equals", value: "已繳費" }],
    });

    // 下次匯出的報表把發票金額移到最前面
    const reordered = ["發票金額", "訂單編號", "繳費狀態", "姓名"];
    const { mapping, filters } = resolveColumns(reordered, loadRememberedColumns());
    expect(mapping.發票金額).toBe(0);
    expect(mapping.訂單編號).toBe(1);
    expect(filters[0].column).toBe(2);
  });

  it("記住多個篩選條件並依名稱還原", () => {
    const config = createDefaultConfig();
    rememberColumns(headers, {
      ...config,
      filters: [
        { column: 1, operator: "equals", value: "已繳費" },
        { column: 5, operator: "notEmpty", value: "" },
      ],
    });

    const reordered = ["姓名", "電子信箱", "繳費狀態"];
    const { filters } = resolveColumns(reordered, loadRememberedColumns());
    expect(filters).toEqual([
      { column: 2, operator: "equals", value: "已繳費" },
      { column: 1, operator: "notEmpty", value: "" },
    ]);
  });

  it("條件的欄位在新檔案中不存在時保留條件但標為未使用", () => {
    const config = createDefaultConfig();
    rememberColumns(headers, {
      ...config,
      filters: [{ column: 1, operator: "equals", value: "已繳費" }],
    });

    const { filters } = resolveColumns(["姓名", "金額"], loadRememberedColumns());
    expect(filters).toEqual([{ column: UNMAPPED, operator: "equals", value: "已繳費" }]);
  });

  it("找不到同名欄位時退回自動猜測", () => {
    const { mapping, restored } = resolveColumns(headers, {
      mapping: { 訂單編號: "不存在的欄位" },
      filters: [],
    });
    expect(restored).toBe(0);
    expect(mapping.訂單編號).toBe(0); // 由關鍵字猜出
  });

  it("清除後不再帶出舊設定", () => {
    saveConfig({ ...createDefaultConfig(), 會員編號: "C123456789" });
    rememberColumns(headers, { ...createDefaultConfig(), mapping: { ...createDefaultConfig().mapping, 訂單編號: 0 } });
    clearSaved();
    expect(loadConfig()).toBeNull();
    expect(loadRememberedColumns()).toBeNull();
  });

  it("載入的設定不帶欄位索引，避免對到上一份檔案的欄位", () => {
    const config = createDefaultConfig();
    saveConfig({ ...config, mapping: { ...config.mapping, 訂單編號: 5 } });
    expect(loadConfig()?.mapping.訂單編號).toBe(UNMAPPED);
  });
});
