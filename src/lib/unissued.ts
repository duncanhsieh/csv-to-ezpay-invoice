import type { BuildResult, InvoiceConfig } from "./types";

function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * 未開立發票清單。
 *
 * 被篩選條件排除、0 元、或人工跳過的資料列都會列在這裡，並完整保留原始欄位，
 * 讓使用者可以直接拿這份檔案人工處理剩下的發票。
 */
export function buildUnissuedCsv(result: BuildResult, headers: string[]): string {
  const head = ["來源列號", "未開立原因", ...headers];
  const rows = result.skipped.map((skipped) => [
    String(skipped.sourceRow),
    skipped.reason,
    // 補齊欄數，避免來源列比標題短時欄位錯位
    ...headers.map((_, i) => skipped.row[i] ?? ""),
  ]);

  const body = [head, ...rows]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\r\n");

  // 加 BOM 讓 Excel 直接開啟不會亂碼
  return `\uFEFF${body}`;
}

export function unissuedFileName(config: InvoiceConfig): string {
  const shop = config.商店代號 || "shop";
  return `未開立清單_${shop}_${config.開立日期}.csv`;
}
