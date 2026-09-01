import type { BuildResult, FileCheck, InvoiceConfig } from "./types";
import { buildFileName, byteSize, MAX_FILE_BYTES } from "./serialize";
import { formatDate, isValidDateString } from "./text";

/**
 * 檔案層級檢查 —— 對應手冊第二章第(一)~(三)的檔案規定，
 * 這些問題不屬於任何一筆發票，但同樣會讓整個批次被平台退回。
 */
export function buildFileChecks(
  result: BuildResult,
  config: InvoiceConfig,
  content: string,
  now: Date = new Date(),
): FileCheck[] {
  const checks: FileCheck[] = [];
  const 品項筆數 = result.invoices.reduce((n, invoice) => n + invoice.items.length, 0);

  // 檔案大小：超過 800KB 平台不收，必須拆檔
  const bytes = byteSize(content);
  const kb = (bytes / 1024).toFixed(1);
  if (bytes > MAX_FILE_BYTES) {
    const 建議批數 = Math.ceil(bytes / MAX_FILE_BYTES);
    checks.push({
      level: "error",
      message: `檔案 ${kb} KB 超過 800KB 上限，請將資料拆成約 ${建議批數} 個檔案分批開立`,
    });
  } else {
    checks.push({ level: "pass", message: `檔案 ${kb} KB，未超過 800KB 上限` });
  }

  // 檔名：商店代號_當日西元年月日
  checks.push({
    level: "pass",
    message: `檔名 ${buildFileName(config)}，符合「商店代號_西元年月日」格式`,
  });

  // 執行開立日期
  if (!isValidDateString(config.開立日期)) {
    checks.push({
      level: "error",
      message: `執行開立日期「${config.開立日期}」不是有效的 yyyymmdd 日期`,
      code: "INV70001",
    });
  } else if (config.開立日期 !== formatDate(now)) {
    checks.push({
      level: "warning",
      message: `執行開立日期為 ${config.開立日期}，並非今天（${formatDate(now)}）；批次開立為即時開立，通常應填上傳當日`,
    });
  } else {
    checks.push({ level: "pass", message: `執行開立日期 ${config.開立日期} 為今日` });
  }

  // 記錄結構
  checks.push({ level: "pass", message: "首錄(H) 共 1 筆，位於檔案第一列" });

  if (result.invoices.length === 0) {
    checks.push({ level: "error", message: "檔案沒有任何明細錄(S)", code: "KEY10004" });
  } else {
    checks.push({
      level: "pass",
      message: `明細錄(S) 共 ${result.invoices.length} 筆、明細錄(I) 共 ${品項筆數} 筆，每筆發票皆有對應品項`,
    });
  }

  // 自訂編號重覆（LIB10003）
  const 重覆 = result.invoices.filter((invoice) =>
    invoice.issues.some((issue) => issue.message.includes("重覆")),
  ).length;
  if (重覆 > 0) {
    checks.push({
      level: "error",
      message: `有 ${重覆} 筆商店自訂編號重覆，同一商店中此編號不可重覆`,
      code: "LIB10003",
    });
  } else if (result.invoices.length > 0) {
    checks.push({ level: "pass", message: "商店自訂編號皆未重覆" });
  }

  // 逗號造成的欄位錯位（清理階段已把半形逗號轉全形，這裡再做一次保險）
  const S欄數 = config.specVersion === "v1.0.5" ? 18 : 17;
  const I欄數 = config.specVersion === "v1.0.5" ? 8 : 7;
  const lines = content.split("\r\n");
  const S錯位 = lines.filter((l) => l.startsWith("S,") && l.split(",").length !== S欄數).length;
  const I錯位 = lines.filter((l) => l.startsWith("I,") && l.split(",").length !== I欄數).length;
  if (S錯位 > 0 || I錯位 > 0) {
    if (S錯位 > 0) {
      checks.push({
        level: "error",
        message: `有 ${S錯位} 列明細錄(S) 的欄位數不是 ${S欄數} 欄`,
        code: "INV70007",
      });
    }
    if (I錯位 > 0) {
      checks.push({
        level: "error",
        message: `有 ${I錯位} 列明細錄(I) 的欄位數不是 ${I欄數} 欄`,
        code: "INV70008",
      });
    }
  } else if (result.invoices.length > 0) {
    checks.push({
      level: "pass",
      message: `明細錄(S) 皆為 ${S欄數} 欄、明細錄(I) 皆為 ${I欄數} 欄（規格 ${config.specVersion === "v1.0.5" ? "V1.0.5" : "V1.0.4 以前"}）`,
    });
  }

  return checks;
}

export function fileCheckErrors(checks: FileCheck[]): FileCheck[] {
  return checks.filter((check) => check.level === "error");
}
