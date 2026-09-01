import { useRef, useState } from "react";
import type { DragEvent } from "react";
import type { SheetData } from "../lib/sheet";
import { Button } from "./ui";

export default function FileDrop({
  sheet,
  error,
  onFile,
  onClear,
}: {
  sheet: SheetData | null;
  error: string;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  if (sheet) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
              <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900">{sheet.fileName}</p>
            <p className="text-xs text-slate-500">
              共 {sheet.rows.length} 列資料、{sheet.headers.length} 個欄位
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={onClear}>
          更換檔案
        </Button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`rounded-2xl border-2 border-dashed p-10 text-center transition ${
        dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-white"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="mx-auto size-10 text-slate-400"
      >
        <path
          d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="mt-3 text-sm font-medium text-slate-900">拖曳檔案到這裡，或選擇檔案</p>
      <p className="mt-1 text-xs text-slate-500">支援 .csv、.xls、.xlsx，第一列須為欄位標題</p>
      <div className="mt-4">
        <Button onClick={() => inputRef.current?.click()}>選擇檔案</Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".csv,.xls,.xlsx"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
