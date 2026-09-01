import { useState } from "react";
import type {
  BuildResult,
  FileCheck,
  Invoice,
  InvoiceConfig,
  OverridableField,
  RowOverride,
  RowOverrides,
} from "../lib/types";
import FixPanel from "./FixPanel";
import { toRecords } from "../lib/serialize";
import { Badge } from "./ui";

const currency = new Intl.NumberFormat("zh-TW");

function money(value: number): string {
  return currency.format(value);
}

function 收付方式(invoice: Invoice): string {
  if (invoice.捐贈碼) return `捐贈 ${invoice.捐贈碼}${invoice.受贈單位 ? `（${invoice.受贈單位}）` : ""}`;
  switch (invoice.載具類別) {
    case "0":
      return `手機條碼 ${invoice.載具編號}`;
    case "1":
      return `自然人憑證 ${invoice.載具編號}`;
    case "2":
      return `ezPay 載具 ${invoice.載具編號}`;
    default:
      return invoice.索取紙本發票 === "Y" ? "索取紙本" : "—";
  }
}

function rowTone(invoice: Invoice): string {
  if (invoice.issues.some((i) => i.level === "error")) return "bg-rose-50/70";
  if (invoice.issues.some((i) => i.level === "warning")) return "bg-amber-50/60";
  return "";
}

function SummaryCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "indigo" | "rose" | "amber";
}) {
  const tones = {
    slate: "text-slate-900",
    indigo: "text-indigo-600",
    rose: "text-rose-600",
    amber: "text-amber-600",
  } as const;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-2xs font-medium text-slate-500">{label}</p>
      <p className={`tabular mt-1 text-xl font-semibold ${tones[tone]}`}>{value}</p>
    </div>
  );
}

interface FixHandlers {
  overrides: RowOverrides;
  sourceValue: (sourceRow: number, field: OverridableField) => string;
  onPatch: (sourceRow: number, override: RowOverride) => void;
  onSkip: (sourceRow: number, reason: string) => void;
  onReset: (sourceRow: number) => void;
}

function InvoiceTable({ invoices, fix }: { invoices: Invoice[]; fix: FixHandlers }) {
  if (invoices.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-slate-500">
        沒有符合條件的資料，請確認篩選條件與欄位對應。
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] border-collapse text-left text-xs">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2 font-medium whitespace-nowrap">列</th>
            <th className="w-[26rem] px-3 py-2 font-medium">商店自訂編號 / 問題與修正</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">種類</th>
            <th className="px-3 py-2 font-medium">買受人</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">載具 / 捐贈</th>
            <th className="px-3 py-2 text-right font-medium whitespace-nowrap">銷售額</th>
            <th className="px-3 py-2 text-right font-medium whitespace-nowrap">稅額</th>
            <th className="px-3 py-2 text-right font-medium whitespace-nowrap">發票金額</th>
            <th className="px-3 py-2 font-medium">商品</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {invoices.map((invoice) => (
            <tr key={`${invoice.sourceRow}-${invoice.商店自訂編號}`} className={rowTone(invoice)}>
              <td className="px-3 py-2 text-slate-400">{invoice.sourceRow}</td>
              <td className="px-3 py-2">
                <span className="font-mono text-slate-900">{invoice.商店自訂編號}</span>
                {invoice.商店自訂編號 !== invoice.原始訂單編號 && (
                  <span className="block text-2xs text-slate-400">
                    原：{invoice.原始訂單編號}
                  </span>
                )}
                <FixPanel
                  invoice={invoice}
                  override={fix.overrides[invoice.sourceRow]}
                  sourceValue={(field) => fix.sourceValue(invoice.sourceRow, field)}
                  onPatch={(override) => fix.onPatch(invoice.sourceRow, override)}
                  onSkip={(reason) => fix.onSkip(invoice.sourceRow, reason)}
                  onReset={() => fix.onReset(invoice.sourceRow)}
                />
              </td>
              <td className="px-3 py-2">
                <Badge tone={invoice.發票種類 === "B2B" ? "info" : "neutral"}>
                  {invoice.發票種類}
                </Badge>
              </td>
              <td className="px-3 py-2">
                <span className="text-slate-900">{invoice.買受人名稱 || "—"}</span>
                {invoice.買受人統一編號 && (
                  <span className="ml-1 font-mono text-slate-500">({invoice.買受人統一編號})</span>
                )}
                {invoice.買受人電子信箱 && (
                  <span className="block text-2xs text-slate-500">{invoice.買受人電子信箱}</span>
                )}
              </td>
              <td className="px-3 py-2 text-slate-600">{收付方式(invoice)}</td>
              <td className="tabular px-3 py-2 text-right whitespace-nowrap text-slate-700">
                {money(invoice.銷售額合計)}
              </td>
              <td className="tabular px-3 py-2 text-right whitespace-nowrap text-slate-700">
                {money(invoice.稅額)}
              </td>
              <td className="tabular px-3 py-2 text-right font-semibold whitespace-nowrap text-slate-900">
                {money(invoice.發票金額)}
              </td>
              <td className="px-3 py-2 text-slate-600">
                {invoice.items.map((item, i) => (
                  <span key={i} className="block">
                    {item.商品名稱} × {item.商品數量} {item.商品單位}
                    <span className="tabular ml-1 text-slate-400">@{money(item.商品單價)}</span>
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CHECK_STYLE = {
  pass: { mark: "✓", row: "", text: "text-slate-700", icon: "text-emerald-600" },
  warning: { mark: "!", row: "bg-amber-50/60", text: "text-amber-800", icon: "text-amber-600" },
  error: { mark: "✕", row: "bg-rose-50/70", text: "text-rose-800", icon: "text-rose-600" },
} as const;

/**
 * 檔案層級檢查。
 *
 * 全部通過時整塊不顯示，避免一排「✓」佔掉版面；有問題時只列出有問題的項目，
 * 通過的項目收斂成一行說明，讓需要處理的內容一眼就看得到。
 */
function FileChecks({ checks }: { checks: FileCheck[] }) {
  const problems = checks.filter((check) => check.level !== "pass");
  if (problems.length === 0) return null;

  const passed = checks.length - problems.length;
  const 錯誤數 = problems.filter((check) => check.level === "error").length;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <h3 className="text-xs font-semibold text-slate-900">
          檔案層級檢查
          <span className={`ml-2 font-normal ${錯誤數 > 0 ? "text-rose-600" : "text-amber-600"}`}>
            {錯誤數 > 0 ? `${錯誤數} 項錯誤` : `${problems.length} 項提醒`}
          </span>
        </h3>
      </div>
      <ul className="divide-y divide-slate-100">
        {problems.map((check, index) => {
          const style = CHECK_STYLE[check.level];
          return (
            <li key={index} className={`flex gap-3 px-4 py-2.5 text-xs ${style.row}`}>
              <span className={`w-4 shrink-0 text-center font-bold ${style.icon}`}>
                {style.mark}
              </span>
              <span className={style.text}>
                {check.message}
                {check.code && (
                  <span className="ml-2 font-mono text-2xs text-slate-400">{check.code}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {passed > 0 && (
        <p className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-2xs text-slate-500">
          其餘 {passed} 項檔案層級檢查皆通過。
        </p>
      )}
    </div>
  );
}

export default function Preview({
  result,
  config,
  fileContent,
  fileChecks,
  fix,
  onSkipAllErrors,
  onDownloadUnissued,
}: {
  result: BuildResult;
  config: InvoiceConfig;
  fileContent: string;
  fileChecks: FileCheck[];
  fix: FixHandlers;
  onSkipAllErrors: () => void;
  onDownloadUnissued: () => void;
}) {
  const [tab, setTab] = useState<"invoices" | "raw" | "skipped">("invoices");
  const { totals } = result;
  const records = toRecords(result, config.specVersion);

  const tabs = [
    { key: "invoices" as const, label: `發票明細 (${result.invoices.length})` },
    { key: "raw" as const, label: `檔案內容 (${records.length} 列)` },
    { key: "skipped" as const, label: `略過的資料 (${result.skipped.length})` },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <SummaryCard label="發票筆數" value={money(totals.發票筆數)} tone="indigo" />
        <SummaryCard label="B2B / B2C" value={`${totals.B2B筆數} / ${totals.B2C筆數}`} />
        <SummaryCard label="銷售額合計" value={money(totals.銷售額合計)} />
        <SummaryCard label="稅額合計" value={money(totals.稅額合計)} />
        <SummaryCard label="發票金額合計" value={money(totals.發票金額合計)} tone="indigo" />
        <SummaryCard
          label="錯誤 / 警告"
          value={`${totals.錯誤筆數} / ${totals.警告筆數}`}
          tone={totals.錯誤筆數 > 0 ? "rose" : totals.警告筆數 > 0 ? "amber" : "slate"}
        />
      </div>

      <FileChecks checks={fileChecks} />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex gap-1 border-b border-slate-200 bg-slate-50 px-3 pt-3">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`rounded-t-lg px-4 py-2 text-xs font-medium transition ${
                tab === item.key
                  ? "bg-white text-indigo-600 shadow-[0_-1px_0_0_#e2e8f0_inset]"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "invoices" && (
          <>
            {totals.錯誤筆數 > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-rose-50/60 px-4 py-2.5">
                <span className="text-xs text-rose-800">
                  有 {totals.錯誤筆數} 筆資料含錯誤。可逐筆套用下方的建議修正，或整批跳過後以未開立清單人工處理。
                </span>
                <button
                  type="button"
                  onClick={onSkipAllErrors}
                  className="rounded-md bg-white px-2.5 py-1 text-2xs font-medium text-rose-700 ring-1 ring-rose-300 transition ring-inset hover:bg-rose-100"
                >
                  跳過全部 {totals.錯誤筆數} 筆錯誤資料
                </button>
              </div>
            )}
            <InvoiceTable invoices={result.invoices} fix={fix} />
          </>
        )}

        {tab === "raw" && (
          <div className="max-h-[28rem] overflow-auto bg-slate-900 p-4">
            <pre className="font-mono text-2xs leading-relaxed whitespace-pre text-slate-100">
              {fileContent || "（無資料）"}
            </pre>
          </div>
        )}

        {tab === "skipped" && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <span className="text-xs text-slate-600">
                這些資料列不會開立發票，可下載清單改以人工處理。
              </span>
              <button
                type="button"
                onClick={onDownloadUnissued}
                disabled={result.skipped.length === 0}
                className="rounded-md bg-white px-2.5 py-1 text-2xs font-medium text-slate-700 ring-1 ring-slate-300 transition ring-inset hover:bg-slate-100 disabled:opacity-50"
              >
                下載未開立清單（{result.skipped.length} 筆）
              </button>
            </div>
            <div className="overflow-x-auto">
            {result.skipped.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">沒有被略過的資料列。</p>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">列</th>
                    <th className="px-3 py-2 font-medium">原因</th>
                    <th className="px-3 py-2 font-medium">內容摘要</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.skipped.map((row) => (
                    <tr key={row.sourceRow}>
                      <td className="px-3 py-2 text-slate-400">{row.sourceRow}</td>
                      <td className="px-3 py-2 text-slate-700">{row.reason}</td>
                      <td className="px-3 py-2 text-slate-500">{row.preview}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
