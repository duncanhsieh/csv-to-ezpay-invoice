import { useState } from "react";
import type { Fix, Invoice, Issue, OverridableField, RowOverride } from "../lib/types";
import { describeOverride, hasOverride, suggestFixes } from "../lib/fixes";

const chipClass =
  "rounded-md px-2 py-1 text-[11px] font-medium transition ring-1 ring-inset disabled:opacity-50";

function FixChips({
  invoice,
  issue,
  onPatch,
  onSkip,
  onEdit,
}: {
  invoice: Invoice;
  issue: Issue;
  onPatch: (override: RowOverride) => void;
  onSkip: (reason: string) => void;
  onEdit: (field: OverridableField) => void;
}) {
  const fixes = suggestFixes(invoice, issue);
  if (fixes.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {fixes.map((fix: Fix, i) => {
        if (fix.kind === "hint") {
          return (
            <span key={i} className="text-[11px] text-slate-500">
              {fix.label}
            </span>
          );
        }
        if (fix.kind === "skip") {
          return (
            <button
              key={i}
              type="button"
              title="不開立此筆，改列入未開立清單"
              onClick={() => onSkip(fix.reason)}
              className={`${chipClass} bg-white text-slate-600 ring-slate-300 hover:bg-slate-100`}
            >
              {fix.label}
            </button>
          );
        }
        if (fix.kind === "edit") {
          return (
            <button
              key={i}
              type="button"
              title={fix.hint}
              onClick={() => onEdit(fix.field)}
              className={`${chipClass} bg-white text-slate-700 ring-slate-300 hover:bg-slate-100`}
            >
              {fix.label}
            </button>
          );
        }
        return (
          <button
            key={i}
            type="button"
            title={fix.hint}
            onClick={() => onPatch(fix.override)}
            className={`${chipClass} bg-indigo-50 text-indigo-700 ring-indigo-200 hover:bg-indigo-100`}
          >
            {fix.label}
          </button>
        );
      })}
    </div>
  );
}

/** 單一欄位的即時編輯框 */
function EditField({
  field,
  initial,
  onCommit,
  onCancel,
}: {
  field: OverridableField;
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-medium text-slate-600">{field}</span>
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(draft);
          if (e.key === "Escape") onCancel();
        }}
        className="w-56 rounded-md border border-indigo-300 px-2 py-1 text-[11px] outline-none focus:ring-2 focus:ring-indigo-500/30"
      />
      <button
        type="button"
        onClick={() => onCommit(draft)}
        className={`${chipClass} bg-indigo-600 text-white ring-indigo-600 hover:bg-indigo-500`}
      >
        套用
      </button>
      <button
        type="button"
        onClick={onCancel}
        className={`${chipClass} bg-white text-slate-600 ring-slate-300 hover:bg-slate-100`}
      >
        取消
      </button>
    </div>
  );
}

export default function FixPanel({
  invoice,
  override,
  sourceValue,
  onPatch,
  onSkip,
  onReset,
}: {
  invoice: Invoice;
  override: RowOverride | undefined;
  /** 取得某欄位目前的值，作為編輯框的預設內容 */
  sourceValue: (field: OverridableField) => string;
  onPatch: (override: RowOverride) => void;
  onSkip: (reason: string) => void;
  onReset: () => void;
}) {
  const [editing, setEditing] = useState<OverridableField | null>(null);
  const changed = hasOverride(override);

  if (invoice.issues.length === 0 && !changed) return null;

  return (
    <div className="mt-1 space-y-1.5">
      {invoice.issues.map((issue, i) => (
        <div key={i}>
          <p
            className={
              issue.level === "error"
                ? "text-[11px] text-rose-600"
                : "text-[11px] text-amber-600"
            }
          >
            {issue.level === "error" ? "✕" : "!"} {issue.message}
          </p>
          <FixChips
            invoice={invoice}
            issue={issue}
            onPatch={onPatch}
            onSkip={onSkip}
            onEdit={setEditing}
          />
        </div>
      ))}

      {editing && (
        <EditField
          field={editing}
          initial={sourceValue(editing)}
          onCommit={(value) => {
            onPatch({ values: { [editing]: value } });
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {changed && override && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-indigo-50/70 px-2 py-1">
          <span className="text-[11px] text-indigo-800">
            已修正：{describeOverride(override).join("、")}
          </span>
          <button
            type="button"
            onClick={onReset}
            className="text-[11px] font-medium text-indigo-600 underline-offset-2 hover:underline"
          >
            還原
          </button>
        </div>
      )}
    </div>
  );
}
