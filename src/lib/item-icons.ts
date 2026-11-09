/**
 * 道具圖有沒有：public/assets/items 的檔名清單讀一次（伺服器端／建置時用，不要從 client 元件 import）。
 * 逐個 existsSync 拼路徑會讓 Turbopack 把 1.7 萬張圖都當成相依，所以整個資料夾讀一次。
 */
import fs from "node:fs";
import path from "node:path";

const itemDir = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "assets", "items");
let icons: Set<string> | null = null;

export function hasItemIcon(id: number): boolean {
  icons ??= new Set(fs.existsSync(itemDir) ? fs.readdirSync(itemDir) : []);
  return icons.has(`${id}.png`);
}
