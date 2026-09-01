/**
 * ezPay 電子發票批次開立 — 型別定義
 * 依《電子發票批次開立操作手冊》V1.0.5（2026/5/6）
 */

/** 表格欄位對應：值為來源檔的欄索引，-1 代表未使用 */
export interface ColumnMapping {
  訂單編號: number;
  B2C買受人名稱: number;
  B2B統一編號: number;
  B2B公司名稱: number;
  電子郵件: number;
  買受人地址: number;
  手機條碼載具: number;
  自然人憑證載具: number;
  捐贈碼: number;
  發票金額: number;
  商品名稱: number;
  商品數量: number;
  備註: number;
}

export const UNMAPPED = -1;

/** 篩選條件：決定來源檔哪些列要開立 */
export type FilterOperator =
  | "equals"
  | "notEquals"
  | "contains"
  | "notContains"
  | "notEmpty"
  | "isEmpty";

export interface FilterRule {
  column: number;
  operator: FilterOperator;
  value: string;
}

/**
 * 訂單編號加鹽設定
 * 發票作廢後重開時，商店自訂編號不可與先前重覆（錯誤代碼 LIB10003），
 * 因此提供在原編號後附加識別碼的機制。
 */
export type SaltMode = "none" | "custom" | "date" | "time" | "random";

export interface SaltConfig {
  mode: SaltMode;
  /** 分隔符號，僅允許英數字與底線，通常為 "_" */
  separator: string;
  /** mode = custom 時使用的字串 */
  custom: string;
}

/** 稅別（規格第二章第(四)第 2 點第 12 項） */
export type TaxType = "1" | "2" | "3" | "4";

/** 報關標記（V1.0.5 新增，稅別為零稅率時必填） */
export type CustomsMark = "" | "1" | "2";

/** 輸出規格版本 */
export type SpecVersion = "v1.0.5" | "legacy";

export type OutputFormat = "txt" | "csv";

export interface InvoiceConfig {
  會員編號: string;
  商店代號: string;
  /** 執行開立日期 yyyymmdd */
  開立日期: string;
  /** 多個篩選條件為交集（AND），全部符合的資料列才會開立；空陣列代表全部轉換 */
  filters: FilterRule[];
  /** 略過發票金額為 0（或空白）的訂單，不開立也不視為錯誤 */
  略過零元訂單: boolean;
  mapping: ColumnMapping;
  預設商品名稱: string;
  預設商品單位: string;
  預設商品數量: number;
  稅別: TaxType;
  稅率: number;
  報關標記: CustomsMark;
  預設備註: string;
  salt: SaltConfig;
  specVersion: SpecVersion;
  outputFormat: OutputFormat;
  /** 檔案開頭加上 BOM（Excel 開啟中文較友善，部分平台需關閉） */
  withBom: boolean;
}

export type IssueLevel = "error" | "warning";

export interface Issue {
  level: IssueLevel;
  field: string;
  message: string;
}

/** 明細錄(I) */
export interface InvoiceItem {
  商品名稱: string;
  商品數量: number;
  商品單位: string;
  商品單價: number;
  商品小計: number;
  /** 僅在稅別 = 9 時提供 */
  商品課稅別: string;
}

/** 明細錄(S) + 其下的明細錄(I) */
export interface Invoice {
  /** 來源檔列號（1-based，含標題列） */
  sourceRow: number;
  原始訂單編號: string;
  商店自訂編號: string;
  發票種類: "B2B" | "B2C";
  買受人統一編號: string;
  買受人名稱: string;
  買受人電子信箱: string;
  買受人地址: string;
  載具類別: string;
  載具編號: string;
  捐贈碼: string;
  /** 捐贈碼對應的受贈單位，供預覽顯示 */
  受贈單位: string;
  索取紙本發票: "Y" | "N";
  稅別: TaxType;
  稅率: number;
  報關標記: CustomsMark;
  銷售額合計: number;
  稅額: number;
  發票金額: number;
  備註: string;
  items: InvoiceItem[];
  issues: Issue[];
}

export interface SkippedRow {
  sourceRow: number;
  reason: string;
  preview: string;
  /** 原始資料列，供「未開立發票清單」輸出 */
  row: string[];
}

export interface BuildTotals {
  發票筆數: number;
  B2B筆數: number;
  B2C筆數: number;
  銷售額合計: number;
  稅額合計: number;
  發票金額合計: number;
  錯誤筆數: number;
  警告筆數: number;
}

export interface BuildResult {
  header: string[];
  invoices: Invoice[];
  skipped: SkippedRow[];
  totals: BuildTotals;
  /** 本次實際套用的鹽（空字串代表未加鹽） */
  appliedSalt: string;
}

/** 檔案層級檢查結果（不屬於單一發票，但會影響整批上傳） */
export interface FileCheck {
  level: "pass" | "warning" | "error";
  message: string;
  /** 對應的 ezPay 錯誤代碼 */
  code?: string;
}

/** 可在預覽區逐列覆寫的欄位 */
export type OverridableField = keyof ColumnMapping;

/**
 * 單列的人工修正。
 *
 * 以「來源列號」為 key 保存，因此調整設定或重新篩選後仍會套用到同一列。
 * 修正的是「來源資料的解讀方式」而非產生出來的發票，重新建置時才能一致重現。
 */
export interface RowOverride {
  /** 不開立此筆，改列入未開立清單 */
  skip?: boolean;
  /** 略過原因（供未開立清單顯示） */
  skipReason?: string;
  /** 以此值取代來源欄位的內容 */
  values?: Partial<Record<OverridableField, string>>;
  /** 強制索取紙本：忽略載具與捐贈碼，索取紙本填 Y */
  forcePaper?: boolean;
}

export type RowOverrides = Record<number, RowOverride>;

/** 針對某個問題所提供的修正選項 */
export type Fix =
  /** 一鍵套用的覆寫 */
  | { kind: "patch"; label: string; hint?: string; override: RowOverride }
  /** 開啟輸入框直接修改某個欄位 */
  | { kind: "edit"; label: string; field: OverridableField; hint?: string }
  /** 不開立此筆 */
  | { kind: "skip"; label: string; reason: string }
  /** 需要到設定區調整（全批次共用的設定） */
  | { kind: "hint"; label: string };
