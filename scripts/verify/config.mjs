// 驗收腳本共用的設定：Chrome 在哪、DevTools 用哪個埠、沒給輸出資料夾時寫去哪
import os from "node:os";
import path from "node:path";

/** Chrome（或 Edge、Chromium）的路徑：環境變數 CHROME_PATH，沒設就用 Windows 的預設安裝位置 */
export const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

/** DevTools 的埠：命令列有給就用命令列的，再來是環境變數 CHROME_PORT，都沒有就用腳本自己的預設值 */
export const chromePort = (fallback, arg) => Number(arg ?? (process.env.CHROME_PORT || fallback));

/** 輸出資料夾：命令列有給就用；沒給就寫到系統暫存資料夾的 maplebook-verify-out/<腳本>-<時間>，不會掉進 repo */
export const outDir = (arg, name) =>
  path.resolve(arg ?? path.join(os.tmpdir(), "maplebook-verify-out", `${name}-${new Date().toISOString().replace(/[:.]/g, "-")}`));
