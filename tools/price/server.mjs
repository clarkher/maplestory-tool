// 拍賣查價工具（本機，v0.97）：npm run price → http://localhost:9380
// 設計：docs/superpowers/specs/2026-10-13-auction-price-tool-design.md；用法：README「拍賣查價工具（本機）」
// 只綁 127.0.0.1；不碰遊戲、不切視窗、不按鍵，只盯截圖資料夾。
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { createSession } from "./session.mjs";
import { createHandler } from "./routes.mjs";
import { watchShots } from "./watch.mjs";
import { ocrImage } from "./ocr.mjs";
import { fetchFx } from "./fx.mjs";
import { ensureDataWorktree, publishData } from "./git-data.mjs";
import { DATA_REL } from "./store.mjs";
import { localDate, SERVER } from "./list.mjs";

const fail = msg => { console.error(msg); process.exit(1); };

const PORT = Number(process.env.PRICE_PORT ?? 9380);
const OCR_SCALE = Number(process.env.PRICE_OCR_SCALE ?? 1);
const DEFAULT_SHOTS = path.join(os.homedir(), "Pictures", "Screenshots");
const SHOTS_DIR = process.env.PRICE_SHOTS_DIR ?? DEFAULT_SHOTS;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) fail(`PRICE_PORT 要是 1 到 65535 的整數，現在是「${process.env.PRICE_PORT}」`);
if (!(OCR_SCALE > 0)) fail(`PRICE_OCR_SCALE 要是大於 0 的數字（放大幾倍讀），現在是「${process.env.PRICE_OCR_SCALE}」`);
// 預設的截圖資料夾還沒有時（沒按過 Win+PrtSc）watchShots 會先建起來；自己指定的路徑不存在多半是打錯，不要幫它建
if (process.env.PRICE_SHOTS_DIR && !fs.existsSync(SHOTS_DIR)) fail(`找不到截圖資料夾：${SHOTS_DIR}\n檢查 PRICE_SHOTS_DIR 有沒有打錯。`);

let dataDir;
try {
  dataDir = ensureDataWorktree(process.cwd());
} catch (e) {
  fail(`接不上 price-data 資料分支（要連得到 GitHub）：${e.message}`);
}
const dataFile = path.join(dataDir, DATA_REL);

// 匯率慢慢抓，不擋開機；抓不到頁面就寫「匯率資料累積中」。連線卡住 10 秒就放棄這一輪
let fx = null;
const refreshFx = async () => { fx = (await fetchFx(url => fetch(url, { signal: AbortSignal.timeout(10_000) }))) ?? fx; };
refreshFx();
setInterval(refreshFx, 30 * 60 * 1000).unref();

const session = createSession({ date: new Date(), dataFile, ocr: file => ocrImage(file, { scale: OCR_SCALE }) });
let watchError = null;
const stopWatch = watchShots(SHOTS_DIR, file => { session.handleShot(file); }, {
  onError: e => {
    watchError = e.message;
    console.error(`截圖資料夾監看出錯：${e.message}`);
  },
});

const handler = createHandler({
  session, dataFile, shotsDir: SHOTS_DIR, port: PORT, getFx: () => fx, getWatchError: () => watchError,
  publish: () => {
    const n = session.state().items.reduce((sum, i) => sum + i.shots.reduce((a, s) => a + (s.added ?? 0), 0), 0);
    return publishData(dataDir, `資料：${SERVER}拍賣價 ${localDate(new Date())} 新增 ${n} 筆`);
  },
});

const server = http.createServer(handler);
server.on("error", e => {
  stopWatch();
  fail(e.code === "EADDRINUSE" ? `埠 ${PORT} 已經有東西在用（是不是已經開了一個？）。換埠：PRICE_PORT=9381 npm run price` : `網頁伺服器開不起來：${e.message}`);
});
server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log(`查價清單：${url}\n截圖資料夾：${SHOTS_DIR}\n資料：${dataFile}\n按 Ctrl+C 結束（記得先在頁面按「收工」）`);
  if (process.platform === "win32" && !process.env.PRICE_NO_OPEN) spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
});

process.on("SIGINT", () => { stopWatch(); server.close(); process.exit(0); });
