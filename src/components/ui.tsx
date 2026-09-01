import type { ReactNode } from "react";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs transition outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:bg-slate-100 disabled:text-slate-400";

const invalidClass =
  "border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:ring-rose-500/30";

export function Card({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-slate-900">{title}</h2>
          {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  /** 有值時取代 hint 顯示為紅色錯誤訊息 */
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 flex items-start gap-1 text-2xs leading-relaxed text-rose-600">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="mt-px size-3 shrink-0"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6m0 3.5v.5" strokeLinecap="round" />
          </svg>
          {error}
        </span>
      ) : (
        hint && <span className="mt-1 block text-2xs leading-relaxed text-slate-500">{hint}</span>
      )}
    </label>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  maxLength,
  type = "text",
  disabled,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  type?: "text" | "email" | "date";
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <input
      type={type}
      className={invalid ? `${inputClass} ${invalidClass}` : inputClass}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function NumberField({
  value,
  onChange,
  min = 0,
  max,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      className={inputClass}
      value={Number.isFinite(value) ? value : ""}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
    />
  );
}

export function SelectField<T extends string | number>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      className={inputClass}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        const picked = options.find((o) => String(o.value) === raw);
        if (picked) onChange(picked.value);
      }}
    >
      {options.map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        className="mt-0.5 size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-xs text-slate-700">
        {label}
        {hint && <span className="mt-0.5 block text-2xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClass: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  info: "bg-indigo-50 text-indigo-700 ring-indigo-200",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const variants = {
    primary:
      "bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none",
    secondary:
      "bg-white text-slate-700 ring-1 ring-slate-300 ring-inset hover:bg-slate-50 disabled:text-slate-400",
    ghost: "text-slate-600 hover:bg-slate-100 disabled:text-slate-400",
  } as const;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${variants[variant]}`}
    >
      {children}
    </button>
  );
}
