import { clean } from "./text";

export interface SheetData {
  fileName: string;
  headers: string[];
  rows: string[][];
}

/**
 * RFC 4180 CSV 解析。
 *
 * 不使用 XLSX 解析 CSV 的原因：它會把 "0912345678"、"00123456" 這類欄位
 * 當成數字，導致手機條碼載具與統一編號的前導零遺失。此處一律以字串處理。
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // 去掉 BOM
  const src = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];

    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // 交給 \n 處理，單獨的 \r 也視為換行
      if (src[i + 1] !== "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      }
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * 解碼文字檔。台灣的匯出檔常見 Big5，先以嚴格模式試 UTF-8，失敗才退回 Big5。
 */
export function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    try {
      return new TextDecoder("big5").decode(buffer);
    } catch {
      return new TextDecoder("utf-8").decode(buffer);
    }
  }
}

/** 補齊每列長度，並移除整列皆空的資料列 */
function normalizeRows(rows: string[][]): { headers: string[]; rows: string[][] } {
  const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const padded = rows.map((r) => {
    const next = r.slice(0, width).map((cell) => clean(cell));
    while (next.length < width) next.push("");
    return next;
  });

  const [headerRow = [], ...body] = padded;
  const headers = headerRow.map((h, i) => h || `第 ${i + 1} 欄`);
  return { headers, rows: body };
}

/** 讀取 csv / xls / xlsx，回傳統一的字串表格 */
export async function readSheetFile(file: File): Promise<SheetData> {
  const buffer = await file.arrayBuffer();
  const isCsv = /\.(csv|txt)$/i.test(file.name) || file.type === "text/csv";

  let raw: string[][];
  if (isCsv) {
    raw = parseCsv(decodeText(buffer));
  } else {
    // xlsx 體積龐大，只有真的讀 Excel 檔時才載入
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("檔案中找不到任何工作表");
    const sheet = workbook.Sheets[sheetName];
    // raw: false 讓數值依儲存格格式輸出為文字，避免日期、金額被轉成序號
    raw = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
      raw: false,
    });
  }

  if (raw.length === 0) throw new Error("檔案沒有任何資料");

  const { headers, rows } = normalizeRows(raw);
  return { fileName: file.name, headers, rows };
}

/** 某一列是否整列為空 */
export function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell === "");
}
