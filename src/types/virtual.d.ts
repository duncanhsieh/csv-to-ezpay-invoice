/** 由 vite.config.ts 的 donate-codes plugin 產生：捐贈碼 → 受贈單位名稱 */
declare module "virtual:donate-codes" {
  const codes: Record<string, string>;
  export default codes;
}
