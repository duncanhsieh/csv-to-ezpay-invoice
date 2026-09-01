/**
 * 文字正規化工具
 *
 * 來源資料（Excel / CSV / 人工填寫）常挾帶多餘字元：前後空白、全形空白、
 * 零寬字元、換行、逗號等。ezPay 批次檔以半形逗號分隔且「前後不可為空白」，
 * 因此所有欄位在輸出前都必須先過濾。
 */

/** 零寬字元、方向控制、軟連字號、BOM */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00AD]/g;
/** 控制字元（含換行、Tab） */
const CONTROL = /[\u0000-\u001F\u007F]/g;
/** 各式空白（含全形空白 U+3000、不斷行空白 U+00A0） */
const SPACES = /[\s\u3000\u00A0]+/g;

/** 任意值轉字串，null / undefined / NaN 一律視為空字串 */
export function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/**
 * 基本清理：去除不可見字元與控制字元、將連續空白收斂為單一半形空白、前後 trim。
 * 中文字元不做轉換，以免人名、公司名被誤改。
 */
export function clean(value: unknown): string {
  return toText(value)
    .replace(INVISIBLE, "")
    .replace(CONTROL, " ")
    .replace(SPACES, " ")
    .trim();
}

/**
 * 清理並將全形英數字、全形符號轉為半形（NFKC），另去除所有空白。
 * 適用於統一編號、載具編號、捐贈碼、Email 等不應含空白的識別性欄位。
 */
export function cleanCompact(value: unknown): string {
  return clean(value).normalize("NFKC").replace(SPACES, "");
}

/** 只保留數字 */
export function digitsOnly(value: unknown): string {
  return cleanCompact(value).replace(/\D/g, "");
}

/** Email：轉半形、去空白、轉小寫 */
export function cleanEmail(value: unknown): string {
  return cleanCompact(value).toLowerCase();
}

/** 載具編號：轉半形、去空白、轉大寫（手機條碼與自然人憑證皆限大寫） */
export function cleanCarrier(value: unknown): string {
  return cleanCompact(value).toUpperCase();
}

/**
 * 文字欄位（買受人名稱、商品名稱、備註）：清理後把半形逗號換成全形，
 * 避免破壞以逗號分隔的 txt 檔格式（規格明訂備註不得含半形逗號）。
 */
export function cleanField(value: unknown): string {
  return clean(value).replace(/,/g, "，");
}

/** 依「字元數」截斷（規格的長度限制以字元計） */
export function truncate(value: string, max: number): string {
  const chars = [...value];
  return chars.length <= max ? value : chars.slice(0, max).join("");
}

/** 字元長度（避免 emoji / 罕用字被算成 2） */
export function charLength(value: string): number {
  return [...value].length;
}

/** 統一編號：取數字後補滿 8 碼（Excel 會把 0 開頭的統編吃成數字） */
export function cleanTaxId(value: unknown): string {
  const d = digitsOnly(value);
  return d && d.length < 8 ? d.padStart(8, "0") : d;
}

/**
 * 金額解析：容許 "1,000"、"NT$1,000"、" 1000 元 "、全形數字等寫法。
 * 無法解析時回傳 NaN，交由呼叫端判斷。
 */
export function parseAmount(value: unknown): number {
  const text = cleanCompact(value).replace(/[^\d.-]/g, "");
  if (!text) return NaN;
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * 會員編號、商店代號允許的字元。
 * 這兩個值會直接寫進首錄(H)並用於檔名，出現逗號或中文都會讓平台無法解析。
 */
export const ACCOUNT_PATTERN = /^[A-Za-z0-9_-]+$/;
const ACCOUNT_CHAR = /[A-Za-z0-9_-]/;

/**
 * 帳號欄位的即時清理：轉半形、去除空白與 Tab、去除不可見字元。
 * 只清理「一定不合法」的空白類字元，其餘可疑字元保留下來讓使用者看到錯誤訊息，
 * 而不是被無聲改掉。
 */
export function sanitizeAccountCode(value: unknown): string {
  return cleanCompact(value);
}

/** 找出不合法的字元（去除重複，保留出現順序） */
export function illegalAccountChars(value: string): string[] {
  return [...new Set([...value].filter((char) => !ACCOUNT_CHAR.test(char)))];
}

/** 商店自訂編號僅允許英、數字與底線 */
export const ORDER_NO_PATTERN = /^[A-Za-z0-9_]+$/;

/** 過濾出合法的自訂編號字元（其餘字元以底線取代後收斂） */
export function cleanOrderNo(value: unknown): string {
  return cleanCompact(value)
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * 統一編號檢查碼驗證（財政部規則）。
 *
 * 各位數乘以權數 1,2,1,2,1,2,4,1 後，將每個乘積的十位與個位相加求總和；
 * 總和能被 5 整除即為有效。第 7 碼為 7 時，總和 +1 亦可被 5 整除也算有效。
 */
export function isValidTaxId(id: string): boolean {
  if (!/^\d{8}$/.test(id)) return false;
  const weights = [1, 2, 1, 2, 1, 2, 4, 1];
  const digits = [...id].map(Number);
  let sum = 0;
  for (let i = 0; i < 8; i += 1) {
    const product = digits[i] * weights[i];
    sum += Math.floor(product / 10) + (product % 10);
  }
  if (sum % 5 === 0) return true;
  return digits[6] === 7 && (sum + 1) % 5 === 0;
}

/** yyyymmdd 是否為存在的日期 */
export function isValidDateString(value: string): boolean {
  if (!/^\d{8}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(year, month, 0).getDate();
}

/** 以位元組估算長度（中文以 2 計），部分平台的長度上限以位元組計算 */
export function byteLength(value: string): number {
  return [...value].reduce((n, char) => n + ((char.codePointAt(0) ?? 0) < 128 ? 1 : 2), 0);
}

/** yyyymmdd */
export function formatDate(date: Date): string {
  const y = date.getFullYear().toString();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}${m}${d}`;
}

/** yyyy-mm-dd（給 <input type="date"> 用） */
export function toDateInput(yyyymmdd: string): string {
  return /^\d{8}$/.test(yyyymmdd)
    ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
    : "";
}

/** yyyy-mm-dd -> yyyymmdd */
export function fromDateInput(value: string): string {
  return value.replace(/-/g, "");
}
