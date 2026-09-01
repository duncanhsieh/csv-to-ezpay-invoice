import { useCallback, useEffect, useMemo, useState } from "react";
import FileDrop from "./components/FileDrop";
import Preview from "./components/Preview";
import SettingsPanel from "./components/SettingsPanel";
import { Button, Checkbox } from "./components/ui";
import {
  clearSaved,
  createDefaultConfig,
  loadConfig,
  loadRememberedColumns,
  rememberColumns,
  resolveColumns,
  saveConfig,
  validateAccountCode,
} from "./lib/config";
import { buildInvoices } from "./lib/invoice";
import { mergeOverride } from "./lib/fixes";
import { buildUnissuedCsv, unissuedFileName } from "./lib/unissued";
import { buildFileChecks } from "./lib/fileChecks";
import { generateSalt, previewSalt } from "./lib/salt";
import { readSheetFile, type SheetData } from "./lib/sheet";
import { buildFileName, downloadText, serialize } from "./lib/serialize";
import {
  UNMAPPED,
  type InvoiceConfig,
  type OverridableField,
  type RowOverride,
  type RowOverrides,
} from "./lib/types";

/**
 * 隨機鹽必須在「按下下載」時才定案，否則每次重繪都會換一組編號。
 * 這裡以 seed 觸發重新產生，讓預覽與實際下載的內容一致。
 */
function useSalt(config: InvoiceConfig) {
  const [seed, setSeed] = useState(0);
  const { mode, custom } = config.salt;
  // 只在加鹽方式或自訂內容改變時重算；分隔符號改變不需要換一組鹽
  const salt = useMemo(() => generateSalt({ mode, custom, separator: "_" }), [mode, custom, seed]);
  return { salt, reroll: () => setSeed((s) => s + 1) };
}

export default function App() {
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [fileError, setFileError] = useState("");
  const [config, setConfig] = useState<InvoiceConfig>(() => loadConfig() ?? createDefaultConfig());
  const [acknowledgeErrors, setAcknowledgeErrors] = useState(false);
  const [restoredColumns, setRestoredColumns] = useState(0);
  const [overrides, setOverrides] = useState<RowOverrides>({});

  const { salt, reroll } = useSalt(config);

  // 商店資料、發票設定隨時保存；欄位對應另以「欄位名稱」保存
  useEffect(() => {
    saveConfig(config);
  }, [config]);

  useEffect(() => {
    if (sheet) rememberColumns(sheet.headers, config);
  }, [sheet, config]);

  const update = useCallback(
    (patch: Partial<InvoiceConfig>) => setConfig((prev) => ({ ...prev, ...patch })),
    [],
  );

  /** 逐列的人工修正，以來源列號為 key */
  const fix = useMemo(
    () => ({
      overrides,
      sourceValue: (sourceRow: number, field: OverridableField) => {
        const overridden = overrides[sourceRow]?.values?.[field];
        if (overridden !== undefined) return overridden;
        const column = config.mapping[field];
        const row = sheet?.rows[sourceRow - 2];
        return column === UNMAPPED || !row ? "" : (row[column] ?? "");
      },
      onPatch: (sourceRow: number, override: RowOverride) =>
        setOverrides((prev) => ({
          ...prev,
          [sourceRow]: mergeOverride(prev[sourceRow], override),
        })),
      onSkip: (sourceRow: number, reason: string) =>
        setOverrides((prev) => ({
          ...prev,
          [sourceRow]: mergeOverride(prev[sourceRow], { skip: true, skipReason: reason }),
        })),
      onReset: (sourceRow: number) =>
        setOverrides((prev) => {
          const next = { ...prev };
          delete next[sourceRow];
          return next;
        }),
    }),
    [overrides, config.mapping, sheet],
  );

  const handleFile = useCallback(async (file: File) => {
    setFileError("");
    try {
      const data = await readSheetFile(file);
      setSheet(data);
      // 先套用上次記住的欄位名稱，其餘再依標題自動猜測
      const { mapping, filters, restored } = resolveColumns(data.headers, loadRememberedColumns());
      setRestoredColumns(restored);
      setOverrides({});
      setConfig((prev) => ({ ...prev, mapping, filters }));
    } catch (error) {
      setSheet(null);
      setFileError(error instanceof Error ? error.message : "檔案讀取失敗");
    }
  }, []);

  const result = useMemo(() => {
    if (!sheet) return null;
    // 以固定的鹽建立，確保預覽即為下載內容
    return buildInvoices(
      sheet.rows,
      { ...config, salt: { ...config.salt, mode: "custom", custom: salt } },
      { headers: sheet.headers, overrides },
    );
  }, [sheet, config, salt, overrides]);

  const fileContent = useMemo(
    () => (result ? serialize(result, { ...config, withBom: false }) : ""),
    [result, config],
  );

  // 檔案層級檢查以實際下載的內容為準（含 BOM 會影響大小）
  const fileChecks = useMemo(
    () => (result ? buildFileChecks(result, config, serialize(result, config)) : []),
    [result, config],
  );
  const 檔案錯誤 = fileChecks.filter((check) => check.level === "error");

  const 缺少必填 = !config.會員編號.trim() || !config.商店代號.trim();
  const 帳號錯誤 = [
    validateAccountCode("會員編號", config.會員編號),
    validateAccountCode("商店代號", config.商店代號),
  ].filter(Boolean);
  const 缺少對應 =
    config.mapping.訂單編號 === UNMAPPED || config.mapping.發票金額 === UNMAPPED;
  const 有錯誤 = (result?.totals.錯誤筆數 ?? 0) > 0;
  const 無資料 = (result?.invoices.length ?? 0) === 0;
  const 可下載 =
    Boolean(result) &&
    !缺少必填 &&
    帳號錯誤.length === 0 &&
    檔案錯誤.length === 0 &&
    !缺少對應 &&
    !無資料 &&
    (!有錯誤 || acknowledgeErrors);

  const blockers = [
    缺少必填 && "請填寫 ezPay 會員編號與商店代號",
    ...帳號錯誤,
    缺少對應 && "請完成「訂單編號」與「發票金額」的欄位對應",
    ...(無資料 ? [] : 檔案錯誤.map((check) => check.message)),
    無資料 && !缺少對應 && "目前沒有符合條件的發票資料",
    有錯誤 && `有 ${result?.totals.錯誤筆數} 筆資料含錯誤，修正後才建議上傳`,
  ].filter(Boolean) as string[];

  /** 把所有含錯誤的資料列一次標為跳過，讓乾淨的部分先開立 */
  const handleSkipAllErrors = () => {
    if (!result) return;
    setOverrides((prev) => {
      const next = { ...prev };
      for (const invoice of result.invoices) {
        const error = invoice.issues.find((issue) => issue.level === "error");
        if (!error) continue;
        next[invoice.sourceRow] = mergeOverride(next[invoice.sourceRow], {
          skip: true,
          skipReason: `資料錯誤：${error.message}`,
        });
      }
      return next;
    });
  };

  const handleDownloadUnissued = () => {
    if (!result || !sheet) return;
    downloadText(unissuedFileName(config), buildUnissuedCsv(result, sheet.headers));
  };

  const handleDownload = () => {
    if (!result || !可下載) return;
    downloadText(buildFileName(config), serialize(result, config));
    // 隨機鹽在下載後換一組，避免不小心重覆送出同一批編號
    if (config.salt.mode === "random") reroll();
  };

  const sampleOrderNo = result?.invoices[0]?.原始訂單編號 ?? "";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div>
            <h1 className="text-lg font-semibold text-white">CSV 轉 ezPay 電子發票批次開立檔</h1>
            <p className="mt-0.5 text-xs text-slate-400">
              依《電子發票批次開立操作手冊》V1.0.5 產生首錄(H)、明細錄(S)、明細錄(I)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 ring-1 ring-slate-700 ring-inset">
              所有處理皆在瀏覽器完成，資料不會上傳
            </span>
            <button
              type="button"
              onClick={() => {
                clearSaved();
                setConfig(createDefaultConfig());
                setRestoredColumns(0);
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              清除已儲存的設定
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <FileDrop
          sheet={sheet}
          error={fileError}
          onFile={handleFile}
          onClear={() => {
            setSheet(null);
            setFileError("");
          }}
        />

        {sheet && (
          <>
            {restoredColumns > 0 && (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">
                已依欄位名稱還原上次的 {restoredColumns} 項欄位對應
                {config.filters.length > 0 && ` 與 ${config.filters.length} 個篩選條件`}
                ，請確認後直接產生檔案。
              </p>
            )}

            <SettingsPanel
              config={config}
              headers={sheet.headers}
              sampleOrderNo={sampleOrderNo}
              saltPreview={previewSalt(sampleOrderNo, salt, config.salt.separator)}
              onChange={update}
            />

            {result && (
              <Preview
                result={result}
                config={config}
                fileContent={fileContent}
                fileChecks={fileChecks}
                fix={fix}
                onSkipAllErrors={handleSkipAllErrors}
                onDownloadUnissued={handleDownloadUnissued}
              />
            )}
          </>
        )}
      </main>

      {sheet && result && (
        <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
            <div className="min-w-0">
              {blockers.length > 0 ? (
                <ul className="space-y-0.5 text-xs text-rose-600">
                  {blockers.map((message) => (
                    <li key={message}>• {message}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-600">
                  將產生{" "}
                  <span className="font-semibold text-slate-900">
                    {result.invoices.length}
                  </span>{" "}
                  張發票、合計{" "}
                  <span className="tabular font-semibold text-slate-900">
                    {new Intl.NumberFormat("zh-TW").format(result.totals.發票金額合計)}
                  </span>{" "}
                  元，檔名{" "}
                  <span className="font-mono text-slate-900">{buildFileName(config)}</span>
                </p>
              )}
              {有錯誤 && (
                <div className="mt-2">
                  <Checkbox
                    checked={acknowledgeErrors}
                    onChange={setAcknowledgeErrors}
                    label="我已確認，仍要下載含錯誤的檔案"
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* 未開立清單不受批次檔的錯誤阻擋——有錯誤時反而更需要它 */}
              <Button
                variant="secondary"
                onClick={handleDownloadUnissued}
                disabled={result.skipped.length === 0}
              >
                下載未開立清單（{result.skipped.length}）
              </Button>
              <Button onClick={handleDownload} disabled={!可下載}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="size-4"
                >
                  <path
                    d="M12 4v12m0 0 4-4m-4 4-4-4M4 20h16"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                下載批次開立檔
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
