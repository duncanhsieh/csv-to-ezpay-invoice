import codes from "virtual:donate-codes";

/**
 * 財政部公告的受贈單位清單（捐贈碼 → 單位名稱）。
 * 原始資料位於 src/data/donateCodes.json，打包時只保留這兩個欄位。
 */
const codeMap = new Map(Object.entries(codes));

/** 捐贈碼是否在清單中 */
export function isKnownDonateCode(code: string): boolean {
  return codeMap.has(code);
}

/** 取得受贈單位名稱，查無則回傳空字串 */
export function donateOrgName(code: string): string {
  return codeMap.get(code) ?? "";
}

export const donateCodeCount = codeMap.size;
