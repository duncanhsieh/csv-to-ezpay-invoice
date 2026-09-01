import type { BuildResult, Invoice, InvoiceConfig, SpecVersion } from "./types";

/**
 * 明細錄(S)欄位順序 — 手冊第二章第(四)第 2 點
 *
 * V1.0.5 於第 14 項新增「報關標記」，其後欄位依序後移。
 * legacy 為 V1.0.4 以前的 17 欄格式，供平台尚未更新時使用。
 */
export function toDetailRecord(invoice: Invoice, spec: SpecVersion): string[] {
  const fields = [
    "S",
    invoice.商店自訂編號,
    invoice.發票種類,
    invoice.買受人統一編號,
    invoice.買受人名稱,
    invoice.買受人電子信箱,
    invoice.買受人地址,
    invoice.載具類別,
    invoice.載具編號,
    invoice.捐贈碼,
    invoice.索取紙本發票,
    invoice.稅別,
    String(invoice.稅率),
  ];
  if (spec === "v1.0.5") fields.push(invoice.報關標記);
  fields.push(
    String(invoice.銷售額合計),
    String(invoice.稅額),
    String(invoice.發票金額),
    invoice.備註,
  );
  return fields;
}

/** 明細錄(I)欄位順序 — V1.0.5 於第 8 項新增「商品課稅別」 */
export function toItemRecords(invoice: Invoice, spec: SpecVersion): string[][] {
  return invoice.items.map((item) => {
    const fields = [
      "I",
      invoice.商店自訂編號,
      item.商品名稱,
      String(item.商品數量),
      item.商品單位,
      String(item.商品單價),
      String(item.商品小計),
    ];
    if (spec === "v1.0.5") fields.push(item.商品課稅別);
    return fields;
  });
}

/** 產生整份批次檔的所有記錄（含首錄 H） */
export function toRecords(result: BuildResult, spec: SpecVersion): string[][] {
  const records: string[][] = [result.header];
  for (const invoice of result.invoices) {
    records.push(toDetailRecord(invoice, spec));
    records.push(...toItemRecords(invoice, spec));
  }
  return records;
}

/** csv 欄位跳脫；txt 格式因規格不允許逗號，資料在清理階段已先行處理 */
function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function serialize(result: BuildResult, config: InvoiceConfig): string {
  const records = toRecords(result, config.specVersion);
  const body = records
    .map((record) =>
      config.outputFormat === "csv"
        ? record.map(escapeCsv).join(",")
        : record.join(","),
    )
    .join("\r\n");
  return config.withBom ? `\uFEFF${body}` : body;
}

/** 檔案大小上限：800KB（手冊第二章第(二)） */
export const MAX_FILE_BYTES = 800 * 1024;

/** 以 UTF-8 位元組計算檔案大小 */
export function byteSize(content: string): number {
  return new TextEncoder().encode(content).length;
}

/** 檔案名稱：商店代號_當日西元年月日（手冊第二章第(三)） */
export function buildFileName(config: InvoiceConfig): string {
  const shop = config.商店代號 || "shop";
  return `${shop}_${config.開立日期}.${config.outputFormat}`;
}

export function downloadText(fileName: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 交回瀏覽器釋放記憶體
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
