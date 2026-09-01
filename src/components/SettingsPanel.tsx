import type { ColumnMapping, FilterOperator, FilterRule, InvoiceConfig, SaltMode } from "../lib/types";
import { UNMAPPED } from "../lib/types";
import { OPERATOR_LABEL, operatorNeedsValue } from "../lib/invoice";
import { validateAccountCode } from "../lib/config";
import { fromDateInput, sanitizeAccountCode, toDateInput } from "../lib/text";
import { Card, Checkbox, Field, NumberField, SelectField, TextField } from "./ui";

type Update = (patch: Partial<InvoiceConfig>) => void;

/** 來源檔欄位下拉：值為欄索引，-1 代表未使用 */
function ColumnSelect({
  headers,
  value,
  onChange,
  unmappedLabel = "— 未使用 —",
}: {
  headers: string[];
  value: number;
  onChange: (index: number) => void;
  /** 未選欄位時要顯示的文字，用來說明「不逐筆處理」會怎麼開立 */
  unmappedLabel?: string;
}) {
  return (
    <SelectField
      value={value}
      onChange={onChange}
      options={[
        { value: UNMAPPED, label: unmappedLabel },
        ...headers.map((header, index) => ({
          value: index,
          label: `${index + 1}. ${header}`,
        })),
      ]}
    />
  );
}

const MAPPING_FIELDS: { key: keyof ColumnMapping; label: string; hint?: string }[] = [
  { key: "訂單編號", label: "訂單編號", hint: "作為商店自訂編號，同一商店不可重覆" },
  { key: "發票金額", label: "發票金額（含稅）" },
  { key: "B2C買受人名稱", label: "B2C 買受人姓名" },
  { key: "B2B統一編號", label: "B2B 統一編號", hint: "統編與公司名稱皆有值時開立 B2B" },
  { key: "B2B公司名稱", label: "B2B 公司名稱" },
  { key: "電子郵件", label: "買受人電子信箱", hint: "無載具、無捐贈碼時作為 ezPay 電子發票載具" },
  { key: "手機條碼載具", label: "手機條碼載具" },
  { key: "自然人憑證載具", label: "自然人憑證載具" },
  { key: "捐贈碼", label: "捐贈碼" },
  { key: "買受人地址", label: "買受人地址" },
  { key: "商品名稱", label: "商品名稱（逐筆）", hint: "留空則使用下方的預設商品名稱" },
  { key: "商品數量", label: "商品數量（逐筆）" },
  { key: "備註", label: "備註（逐筆）" },
];

/**
 * 未選欄位時的說明文字。
 * 商品名稱與數量沒選欄位不代表「不使用」，而是整批套用固定值，
 * 因此顯示實際會用到的值，避免以為沒設定。
 */
const UNMAPPED_LABELS: Partial<Record<keyof ColumnMapping, (config: InvoiceConfig) => string>> = {
  商品數量: (config) => `固定 ${config.預設商品數量 || 1}`,
  商品名稱: (config) => `固定：${config.預設商品名稱 || "（未填）"}`,
};

const FILTER_OPERATORS = (Object.keys(OPERATOR_LABEL) as FilterOperator[]).map((value) => ({
  value,
  label: OPERATOR_LABEL[value],
}));

const SALT_MODES: { value: SaltMode; label: string }[] = [
  { value: "none", label: "不加鹽（沿用原訂單編號）" },
  { value: "custom", label: "自訂文字（例：R2）" },
  { value: "date", label: "開立日期（yyyymmdd）" },
  { value: "time", label: "開立時間（hhmmss）" },
  { value: "random", label: "隨機 4 碼" },
];

export default function SettingsPanel({
  config,
  headers,
  sampleOrderNo,
  saltPreview,
  onChange,
}: {
  config: InvoiceConfig;
  headers: string[];
  sampleOrderNo: string;
  saltPreview: string;
  onChange: Update;
}) {
  const updateMapping = (key: keyof ColumnMapping, index: number) =>
    onChange({ mapping: { ...config.mapping, [key]: index } });

  const updateFilter = (index: number, patch: Partial<FilterRule>) =>
    onChange({
      filters: config.filters.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
    });

  const addFilter = () =>
    onChange({
      filters: [...config.filters, { column: UNMAPPED, operator: "equals", value: "" }],
    });

  const removeFilter = (index: number) =>
    onChange({ filters: config.filters.filter((_, i) => i !== index) });

  const 會員編號錯誤 = validateAccountCode("會員編號", config.會員編號);
  const 商店代號錯誤 = validateAccountCode("商店代號", config.商店代號);

  // 商品名稱與數量可以「逐筆」由來源欄位提供，或「固定」套用整批設定
  const 商品名稱逐筆 = config.mapping.商品名稱 !== UNMAPPED;
  const 商品數量逐筆 = config.mapping.商品數量 !== UNMAPPED;
  const 欄位名 = (index: number) => headers[index] ?? "";

  const 零稅率 = config.稅別 === "2";
  const 免稅或零稅率 = config.稅別 === "2" || config.稅別 === "3";

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="商店資料" description="填寫 ezPay 電子發票加值服務平台的會員與商店資訊">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="ezPay 會員編號"
            required
            error={會員編號錯誤}
            hint="空白與 Tab 會自動移除"
          >
            <TextField
              value={config.會員編號}
              onChange={(v) => onChange({ 會員編號: sanitizeAccountCode(v) })}
              placeholder="例：C123456789"
              invalid={Boolean(會員編號錯誤)}
            />
          </Field>
          <Field
            label="商店代號"
            required
            error={商店代號錯誤}
            hint="同時作為檔名前綴，空白與 Tab 會自動移除"
          >
            <TextField
              value={config.商店代號}
              onChange={(v) => onChange({ 商店代號: sanitizeAccountCode(v) })}
              placeholder="例：36191"
              invalid={Boolean(商店代號錯誤)}
            />
          </Field>
          <Field label="執行開立日期" hint="批次開立為即時開立，通常為上傳當日">
            <TextField
              type="date"
              value={toDateInput(config.開立日期)}
              onChange={(v) => onChange({ 開立日期: fromDateInput(v) })}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="篩選條件"
        description="多個條件為交集，全部符合的資料列才會開立；未符合的列會列在「略過的資料」"
        action={
          <button
            type="button"
            onClick={addFilter}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50"
          >
            + 新增條件
          </button>
        }
      >
        {config.filters.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
            未設定條件，將轉換全部資料列。
          </p>
        ) : (
          <div className="space-y-3">
            <div className="hidden gap-3 px-1 text-2xs font-medium text-slate-500 sm:grid sm:grid-cols-[1fr_1fr_1fr_auto]">
              <span>判斷欄位</span>
              <span>條件</span>
              <span>比對值</span>
              <span className="w-8" />
            </div>
            {config.filters.map((rule, index) => (
              <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <ColumnSelect
                  headers={headers}
                  value={rule.column}
                  onChange={(column) => updateFilter(index, { column })}
                />
                <SelectField
                  value={rule.operator}
                  onChange={(operator) => updateFilter(index, { operator })}
                  options={FILTER_OPERATORS}
                />
                <TextField
                  value={rule.value}
                  onChange={(value) => updateFilter(index, { value })}
                  placeholder="例：已繳費"
                  disabled={!operatorNeedsValue(rule.operator)}
                />
                <button
                  type="button"
                  onClick={() => removeFilter(index)}
                  aria-label={`移除第 ${index + 1} 個條件`}
                  className="justify-self-start rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 sm:justify-self-auto"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="size-4"
                  >
                    <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}
            {config.filters.some((rule) => rule.column === UNMAPPED) && (
              <p className="text-2xs text-amber-600">
                未指定判斷欄位的條件不會生效，請選擇欄位或移除該條件。
              </p>
            )}
          </div>
        )}

        <div className="mt-4 border-t border-slate-100 pt-4">
          <Checkbox
            checked={config.略過零元訂單}
            onChange={(略過零元訂單) => onChange({ 略過零元訂單 })}
            label="略過發票金額為 0 元的訂單"
            hint="金額為 0 或空白的資料列不開立，也不會被視為錯誤；取消勾選則會標記為錯誤"
          />
        </div>
      </Card>

      <Card
        title="欄位對應"
        description="上傳後已依標題自動猜測，請確認後再調整"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {MAPPING_FIELDS.map(({ key, label, hint }) => (
            <Field key={key} label={label} hint={hint} required={key === "訂單編號" || key === "發票金額"}>
              <ColumnSelect
                headers={headers}
                value={config.mapping[key]}
                onChange={(index) => updateMapping(key, index)}
                unmappedLabel={UNMAPPED_LABELS[key]?.(config)}
              />
            </Field>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 self-start">
        <Card title="發票與商品設定" description="套用到本批次所有發票">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="稅別">
              <SelectField
                value={config.稅別}
                onChange={(稅別) =>
                  onChange({
                    稅別,
                    稅率: 稅別 === "2" || 稅別 === "3" ? 0 : config.稅率 || 5,
                    報關標記: 稅別 === "2" ? config.報關標記 || "1" : "",
                  })
                }
                options={[
                  { value: "1", label: "1 = 應稅" },
                  { value: "2", label: "2 = 零稅率" },
                  { value: "3", label: "3 = 免稅" },
                  { value: "4", label: "4 = 應稅（特種稅率）" },
                ]}
              />
            </Field>
            <Field label="稅率 (%)" hint={免稅或零稅率 ? "零稅率、免稅固定為 0" : "一般稅率為 5"}>
              <NumberField
                value={config.稅率}
                onChange={(稅率) => onChange({ 稅率 })}
                max={100}
                disabled={免稅或零稅率}
              />
            </Field>
            <Field
              label="報關標記"
              hint="V1.0.5 新增，稅別為零稅率時必填"
              required={零稅率}
            >
              <SelectField
                value={config.報關標記}
                onChange={(報關標記) => onChange({ 報關標記 })}
                disabled={!零稅率}
                options={[
                  { value: "", label: "— 不適用 —" },
                  { value: "1", label: "1 = 非經海關出口" },
                  { value: "2", label: "2 = 經海關出口" },
                ]}
              />
            </Field>
            <Field
              label="預設商品名稱"
              hint={
                商品名稱逐筆
                  ? `已選逐筆處理，改由「${欄位名(config.mapping.商品名稱)}」提供`
                  : "最長 30 字元"
              }
            >
              <TextField
                value={config.預設商品名稱}
                onChange={(v) => onChange({ 預設商品名稱: v })}
                maxLength={30}
                disabled={商品名稱逐筆}
              />
            </Field>
            <Field label="商品單位" hint="最長 2 字元">
              <TextField
                value={config.預設商品單位}
                onChange={(v) => onChange({ 預設商品單位: v })}
                maxLength={2}
              />
            </Field>
            <Field
              label="預設商品數量"
              hint={
                商品數量逐筆
                  ? `已選逐筆處理，改由「${欄位名(config.mapping.商品數量)}」提供`
                  : "每張發票的商品數量，預設為 1"
              }
            >
              <NumberField
                value={config.預設商品數量}
                onChange={(v) => onChange({ 預設商品數量: v })}
                min={1}
                disabled={商品數量逐筆}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="預設備註" hint="最長 200 字，半形逗號會自動轉為全形">
                <TextField
                  value={config.預設備註}
                  onChange={(v) => onChange({ 預設備註: v })}
                  maxLength={200}
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card
          title="訂單編號加鹽"
          description="發票作廢後重開時，自訂編號不可與先前重覆（LIB10003），可在原編號後附加識別碼"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="加鹽方式">
              <SelectField
                value={config.salt.mode}
                onChange={(mode) => onChange({ salt: { ...config.salt, mode } })}
                options={SALT_MODES}
              />
            </Field>
            <Field label="分隔符號" hint="僅允許英數字與底線">
              <TextField
                value={config.salt.separator}
                onChange={(separator) => onChange({ salt: { ...config.salt, separator } })}
                maxLength={3}
                disabled={config.salt.mode === "none"}
              />
            </Field>
            {config.salt.mode === "custom" && (
              <div className="sm:col-span-2">
                <Field label="自訂鹽" hint="僅保留英數字與底線">
                  <TextField
                    value={config.salt.custom}
                    onChange={(custom) => onChange({ salt: { ...config.salt, custom } })}
                    maxLength={12}
                    placeholder="例：R2"
                  />
                </Field>
              </div>
            )}
          </div>
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            範例：
            <span className="mx-1 font-mono text-slate-500">{sampleOrderNo || "20240101001"}</span>
            →
            <span className="ml-1 font-mono font-semibold text-indigo-600">{saltPreview}</span>
            {config.salt.mode === "random" && (
              <span className="ml-2 text-slate-500">（每次重新產生）</span>
            )}
          </p>
        </Card>

        <Card title="輸出設定" description="依平台規格產生批次檔">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="規格版本">
              <SelectField
                value={config.specVersion}
                onChange={(specVersion) => onChange({ specVersion })}
                options={[
                  { value: "v1.0.5", label: "V1.0.5（S 18 欄 / I 8 欄）" },
                  { value: "legacy", label: "V1.0.4 以前（S 17 欄 / I 7 欄）" },
                ]}
              />
            </Field>
            <Field label="檔案格式">
              <SelectField
                value={config.outputFormat}
                onChange={(outputFormat) => onChange({ outputFormat })}
                options={[
                  { value: "txt", label: "txt" },
                  { value: "csv", label: "csv" },
                ]}
              />
            </Field>
            <div className="sm:col-span-2">
              <Checkbox
                checked={config.withBom}
                onChange={(withBom) => onChange({ withBom })}
                label="檔案開頭加上 BOM"
                hint="以 Excel 開啟中文較不會亂碼；若平台回報首錄格式錯誤請取消勾選"
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
