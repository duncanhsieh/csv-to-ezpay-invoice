import type { ColumnMapping, FilterOperator, FilterRule, InvoiceConfig } from "./types";
import { UNMAPPED } from "./types";
import { formatDate, illegalAccountChars } from "./text";

export const defaultMapping: ColumnMapping = {
  訂單編號: UNMAPPED,
  B2C買受人名稱: UNMAPPED,
  B2B統一編號: UNMAPPED,
  B2B公司名稱: UNMAPPED,
  電子郵件: UNMAPPED,
  買受人地址: UNMAPPED,
  手機條碼載具: UNMAPPED,
  自然人憑證載具: UNMAPPED,
  捐贈碼: UNMAPPED,
  發票金額: UNMAPPED,
  商品名稱: UNMAPPED,
  商品數量: UNMAPPED,
  備註: UNMAPPED,
};

export function createDefaultConfig(now: Date = new Date()): InvoiceConfig {
  return {
    會員編號: "",
    商店代號: "",
    開立日期: formatDate(now),
    filters: [],
    略過零元訂單: true,
    mapping: { ...defaultMapping },
    預設商品名稱: "教育訓練課程",
    預設商品單位: "次",
    預設商品數量: 1,
    稅別: "1",
    稅率: 5,
    報關標記: "",
    預設備註: "",
    salt: { mode: "none", separator: "_", custom: "" },
    specVersion: "v1.0.5",
    outputFormat: "txt",
    withBom: true,
  };
}

/** 各對應欄位的標題關鍵字，用於上傳後自動猜測欄位 */
const HEADER_HINTS: Record<keyof ColumnMapping, RegExp[]> = {
  訂單編號: [/訂單編號/, /訂單號/, /單號/, /order.?(no|id|number)/i, /編號/],
  B2C買受人名稱: [/買受人姓名/, /購買人/, /姓名/, /聯絡人/, /name/i],
  B2B統一編號: [/統一編號/, /統編/, /公司統編/, /tax.?id/i, /vat/i],
  B2B公司名稱: [/公司名稱/, /發票抬頭/, /抬頭/, /公司/, /company/i],
  電子郵件: [/電子信箱/, /電子郵件/, /信箱/, /郵件/, /e-?mail/i],
  買受人地址: [/地址/, /address/i],
  手機條碼載具: [/手機條碼/, /手機載具/, /共通性載具/, /載具/, /carrier/i],
  自然人憑證載具: [/自然人憑證/, /憑證條碼/],
  捐贈碼: [/捐贈碼/, /愛心碼/, /捐贈/, /donat/i],
  發票金額: [/發票金額/, /應繳金額/, /實收金額/, /總金額/, /金額/, /費用/, /價格/, /amount/i, /total/i],
  商品名稱: [/商品名稱/, /品名/, /課程名稱/, /項目/, /product/i, /item/i],
  商品數量: [/數量/, /件數/, /qty/i, /quantity/i],
  備註: [/備註/, /註記/, /remark/i, /note/i],
};

/**
 * 依標題列自動猜測欄位對應。
 * 依 HEADER_HINTS 的順序比對（越前面越精確），同一欄不會被指派給兩個用途。
 */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = { ...defaultMapping };
  const used = new Set<number>();
  const keys = Object.keys(HEADER_HINTS) as (keyof ColumnMapping)[];

  // 先跑第一輪最精確的關鍵字，再逐步放寬，避免「金額」搶走「發票金額」
  const maxHints = Math.max(...keys.map((k) => HEADER_HINTS[k].length));
  for (let round = 0; round < maxHints; round += 1) {
    for (const key of keys) {
      if (mapping[key] !== UNMAPPED) continue;
      const pattern = HEADER_HINTS[key][round];
      if (!pattern) continue;
      const index = headers.findIndex((h, i) => !used.has(i) && pattern.test(h));
      if (index >= 0) {
        mapping[key] = index;
        used.add(index);
      }
    }
  }

  return mapping;
}

/**
 * 檢查會員編號 / 商店代號，回傳錯誤訊息（合法時為空字串）。
 * 空白由「必填」提示負責，這裡只檢查字元是否合法。
 */
export function validateAccountCode(label: string, value: string): string {
  if (!value) return "";
  const illegal = illegalAccountChars(value);
  if (illegal.length === 0) return "";
  const shown = illegal.map((char) => `「${char}」`).join("、");
  return `${label}含不合法字元${shown}，僅允許英文、數字、底線與連字號`;
}

const STORAGE_KEY = "csv-to-ezpay-invoice/config";
const COLUMNS_KEY = "csv-to-ezpay-invoice/columns";

/** 設定存在 localStorage，讓每月開立時不必重填會員編號、稅別、加鹽等設定 */
export function loadConfig(): InvoiceConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<InvoiceConfig>;
    const base = createDefaultConfig();
    return {
      ...base,
      ...parsed,
      // 開立日期固定用今天，避免載入到上次的舊日期
      開立日期: base.開立日期,
      // 欄位對應與篩選條件改由 rememberedColumns 以「欄位名稱」還原，避免換檔後對錯欄
      mapping: { ...base.mapping },
      filters: [],
      salt: { ...base.salt, ...parsed.salt },
    };
  } catch {
    return null;
  }
}

export function saveConfig(config: InvoiceConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // 隱私模式下 localStorage 可能不可用，忽略即可
  }
}

/**
 * 記住的欄位對應。
 *
 * 儲存「欄位名稱」而非欄索引：同一份報表每次匯出的欄位順序未必相同，
 * 存名稱才能在下次上傳時正確還原，欄位順序有變也不會對錯欄。
 */
export interface RememberedFilter {
  column: string;
  operator: FilterOperator;
  value: string;
}

export interface RememberedColumns {
  mapping: Partial<Record<keyof ColumnMapping, string>>;
  filters: RememberedFilter[];
}

/** 把目前的欄位對應與篩選條件換算成欄位名稱後存起來 */
export function rememberColumns(headers: string[], config: InvoiceConfig): void {
  const nameOf = (index: number) => (index >= 0 && index < headers.length ? headers[index] : "");
  const mapping: RememberedColumns["mapping"] = {};
  for (const key of Object.keys(config.mapping) as (keyof ColumnMapping)[]) {
    const name = nameOf(config.mapping[key]);
    if (name) mapping[key] = name;
  }
  const filters = config.filters.map((rule) => ({
    column: nameOf(rule.column),
    operator: rule.operator,
    value: rule.value,
  }));
  try {
    localStorage.setItem(COLUMNS_KEY, JSON.stringify({ mapping, filters }));
  } catch {
    // 同上
  }
}

export function loadRememberedColumns(): RememberedColumns | null {
  try {
    const raw = localStorage.getItem(COLUMNS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedColumns>;
    return { mapping: parsed.mapping ?? {}, filters: parsed.filters ?? [] };
  } catch {
    return null;
  }
}

/** 依欄位名稱找出欄索引，先精確比對再忽略大小寫與空白 */
export function findColumn(headers: string[], name: string): number {
  if (!name) return UNMAPPED;
  const exact = headers.indexOf(name);
  if (exact >= 0) return exact;
  const loose = name.trim().toLowerCase();
  return headers.findIndex((h) => h.trim().toLowerCase() === loose);
}

/**
 * 決定上傳新檔後的欄位對應：優先沿用上次記住的欄位名稱，
 * 找不到同名欄位才退回依標題關鍵字自動猜測。
 */
export function resolveColumns(
  headers: string[],
  remembered: RememberedColumns | null,
): { mapping: ColumnMapping; filters: FilterRule[]; restored: number } {
  const guessed = guessMapping(headers);
  const mapping: ColumnMapping = { ...defaultMapping };
  let restored = 0;

  for (const key of Object.keys(mapping) as (keyof ColumnMapping)[]) {
    const index = findColumn(headers, remembered?.mapping[key] ?? "");
    if (index !== UNMAPPED) {
      mapping[key] = index;
      restored += 1;
    } else {
      mapping[key] = guessed[key];
    }
  }

  // 找不到同名欄位的條件仍保留，讓使用者看得到並自行改掉，而不是無聲消失
  const filters: FilterRule[] = (remembered?.filters ?? []).map((rule) => ({
    column: findColumn(headers, rule.column),
    operator: rule.operator,
    value: rule.value,
  }));

  return { mapping, filters, restored };
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(COLUMNS_KEY);
  } catch {
    // 同上
  }
}
