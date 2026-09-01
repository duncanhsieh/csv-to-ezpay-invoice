import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const VIRTUAL_ID = "virtual:donate-codes";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

interface RawDonateCode {
  受捐贈機關或團體名稱: string;
  捐贈碼: string;
}

/**
 * 受贈單位清單原始檔有 1660 筆 x 6 個欄位（約 650KB），但程式只用到
 * 「捐贈碼 → 單位名稱」。此處在打包時壓成單純的對照表，原始資料仍保留在
 * src/data/donateCodes.json 供日後更新或查閱其他欄位。
 */
function donateCodesPlugin(): Plugin {
  const sourcePath = fileURLToPath(new URL("./src/data/donateCodes.json", import.meta.url));

  return {
    name: "donate-codes",
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : null),
    load(id) {
      if (id !== RESOLVED_ID) return null;
      this.addWatchFile(sourcePath);
      const entries = JSON.parse(readFileSync(sourcePath, "utf8")) as RawDonateCode[];
      const map: Record<string, string> = {};
      for (const entry of entries) {
        const code = String(entry.捐贈碼 ?? "").trim();
        if (code) map[code] = entry.受捐贈機關或團體名稱;
      }
      return `export default ${JSON.stringify(map)};`;
    },
  };
}

/**
 * GitHub Pages 的專案站台位於 https://<帳號>.github.io/<repo>/ 這種子路徑，
 * 資源網址必須帶上該前綴。由 CI 以 BASE_PATH 傳入（actions/configure-pages 會提供），
 * 本機開發與 Firebase Hosting 則維持根路徑 "/"。
 */
const base = process.env.BASE_PATH ? `${process.env.BASE_PATH.replace(/\/+$/, "")}/` : "/";

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), donateCodesPlugin()],
  // Firebase Hosting 已設定 public: "build"，維持相同輸出目錄
  build: { outDir: "build" },
});
