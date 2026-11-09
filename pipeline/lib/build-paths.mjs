/**
 * 建置（pipeline/build.mjs）的輸入／輸出位置。
 *
 * 改版比對要把舊版上游資料重建到暫存資料夾，所以允許用環境變數換掉兩個位置：
 *   MAPLE_ARTALE_FILE  artale.json 的路徑（預設 data/raw/artale.json）
 *   MAPLE_DATA_OUT     輸出資料夾（預設 public/data）
 * 有設 MAPLE_DATA_OUT 時 writeAssets 為 false：不准往 public/assets 寫圖（只讀）。
 * v83-maps.json、msio-maps.json 等其他來源照舊從 rawDir 讀。
 */
import path from "node:path";

export function buildPaths(env, root) {
  const rawDir = path.join(root, "data", "raw");
  const artaleFile = env.MAPLE_ARTALE_FILE ? path.resolve(env.MAPLE_ARTALE_FILE) : path.join(rawDir, "artale.json");
  const customOut = Boolean(env.MAPLE_DATA_OUT);
  const outDir = customOut ? path.resolve(env.MAPLE_DATA_OUT) : path.join(root, "public", "data");
  return { artaleFile, rawDir, outDir, writeAssets: !customOut };
}
