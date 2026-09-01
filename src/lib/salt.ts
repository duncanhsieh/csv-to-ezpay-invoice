import type { SaltConfig } from "./types";
import { cleanOrderNo } from "./text";

/** 商店自訂編號長度上限（明細錄 S 第 2 項） */
export const ORDER_NO_MAX = 20;

const RANDOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混淆的 I O 0 1

function randomSalt(length = 4): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => RANDOM_ALPHABET[b % RANDOM_ALPHABET.length]).join("");
}

/**
 * 依設定產生本批次要附加的鹽。
 * 同一批次共用一組鹽，重開的整批發票才能一眼辨識來自哪一次作業。
 */
export function generateSalt(config: SaltConfig, now: Date = new Date()): string {
  switch (config.mode) {
    case "none":
      return "";
    case "custom":
      return cleanOrderNo(config.custom);
    case "date":
      return (
        now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, "0") +
        now.getDate().toString().padStart(2, "0")
      );
    case "time":
      return (
        now.getHours().toString().padStart(2, "0") +
        now.getMinutes().toString().padStart(2, "0") +
        now.getSeconds().toString().padStart(2, "0")
      );
    case "random":
      return randomSalt();
    default:
      return "";
  }
}

/**
 * 將鹽附加到訂單編號後方。
 *
 * 規格限制自訂編號最長 20 字元且僅限英數字與底線，因此超長時「保留鹽、截斷原編號」
 * ——鹽是用來區分重開批次的關鍵，被截掉就失去意義。
 */
export function applySalt(orderNo: string, salt: string, separator: string): string {
  const base = cleanOrderNo(orderNo);
  const cleanedSalt = cleanOrderNo(salt);
  if (!cleanedSalt) return base.slice(0, ORDER_NO_MAX);

  const sep = separator.replace(/[^A-Za-z0-9_]/g, "");
  const suffix = `${sep}${cleanedSalt}`;
  const room = ORDER_NO_MAX - suffix.length;
  if (room <= 0) return suffix.slice(-ORDER_NO_MAX).replace(/^_+/, "");
  return `${base.slice(0, room)}${suffix}`;
}

/** 產生一段範例，讓使用者在設定畫面即時看到加鹽後的樣子 */
export function previewSalt(sample: string, salt: string, separator: string): string {
  return applySalt(sample || "20240101001", salt, separator);
}
