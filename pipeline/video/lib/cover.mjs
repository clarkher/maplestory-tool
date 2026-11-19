// 影片封面（v2.40，11/19 使用者「影片封面盡可能用這一集最重要的」）：
// 以前是正片第 1.5 秒的畫面（常常只有角色跟背景）。改成這一集最重要的那張圖放大當主角
// （公告＝官方圖、在哪打＝怪物、怎麼去＝目的地小地圖），左邊大標題，右下站一個角色。
// 用無頭 Chrome 截一張 1280×720 的 HTML（字型跟片子同一套 Noto Sans TC）。
import { spawn } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ensureFonts } from "./compose.mjs";
import { chromePath } from "../series/shoot.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * 封面的 HTML（純函式，測試用）
 * @param {{ title: string, sub?: string, tag: string, hero: string, pixel?: boolean, avatar?: string }} c
 *   title 大標（會自己換行）、sub 第二行黃字、tag 左上紅標、hero 主角圖檔名、pixel 像素圖放大不糊（怪物）、
 *   fill 主角圖填滿右邊整塊（整張地圖畫面）、avatar 角色圖檔名（站左下，不擋主角圖）
 */
export function coverHtml(c, fontDir) {
  const font = (w, f) => `@font-face{font-family:N;font-weight:${w};src:url("${pathToFileURL(join(fontDir, f)).href}")}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${font(900, "NotoSansTC-Black.otf")}${font(700, "NotoSansTC-Bold.otf")}
*{margin:0;box-sizing:border-box}
html,body{width:1280px;height:720px;overflow:hidden;background:#141821;font-family:N,sans-serif}
.bg{position:absolute;inset:-40px;background:url("${esc(c.hero)}") center/cover;filter:blur(28px) brightness(.45) saturate(1.2)}
.hero{position:absolute;right:40px;top:40px;width:640px;height:640px;display:flex;align-items:center;justify-content:center}
.hero img{max-width:100%;max-height:100%;${c.fill ? "width:100%;height:100%;object-fit:cover;" : ""}${c.pixel ? "image-rendering:pixelated;min-width:70%;min-height:70%;object-fit:contain;" : ""}border-radius:${c.pixel ? 0 : 18}px;filter:drop-shadow(0 12px 30px rgba(0,0,0,.6))}
.left{position:absolute;left:56px;top:0;bottom:${c.avatar ? 150 : 0}px;width:600px;display:flex;flex-direction:column;justify-content:center;gap:18px}
.chip{display:flex;gap:10px;font-weight:900;font-size:30px}
.chip span{padding:4px 16px;border-radius:6px}
.red{background:#e53935;color:#fff}.yel{background:#ffcf33;color:#1b1b1b}
h1{font-weight:900;font-size:${c.title.length > 8 ? 84 : 100}px;line-height:1.08;color:#fff;-webkit-text-stroke:3px #0b0d12;paint-order:stroke fill;text-shadow:0 6px 0 #0b0d12}
h2{font-weight:900;font-size:48px;line-height:1.15;color:#ffcf33;-webkit-text-stroke:2px #0b0d12;paint-order:stroke fill;text-shadow:0 4px 0 #0b0d12}
.av{position:absolute;left:60px;bottom:24px;height:190px;image-rendering:pixelated;filter:drop-shadow(0 8px 14px rgba(0,0,0,.55))}
</style></head><body>
<div class="bg"></div>
<div class="hero"><img src="${esc(c.hero)}" alt=""></div>
<div class="left"><div class="chip"><span class="red">${esc(c.tag)}</span><span class="yel">楓之谷經典版</span></div>
<h1>${esc(c.title)}</h1>${c.sub ? `<h2>${esc(c.sub)}</h2>` : ""}</div>
${c.avatar ? `<img class="av" src="${esc(c.avatar)}" alt="">` : ""}
</body></html>`;
}

/** 產封面 png：hero、avatar 是本機檔案路徑；回傳 out */
export async function makeCover({ title, sub, tag, hero, pixel = false, fill = false, avatar, out, work }) {
  const dir = resolve(work);
  await mkdir(dir, { recursive: true });
  const heroName = `hero-${basename(hero)}`;
  await copyFile(hero, join(dir, heroName));
  let avName;
  if (avatar) {
    avName = `av-${basename(avatar)}`;
    await copyFile(avatar, join(dir, avName));
  }
  const html = join(dir, "cover.html");
  await writeFile(html, coverHtml({ title, sub, tag, hero: heroName, pixel, fill, avatar: avName }, await ensureFonts()));
  await new Promise((ok, bad) => {
    const p = spawn(chromePath(), [
      "--headless=new", "--no-sandbox", "--hide-scrollbars", "--disable-gpu", "--force-device-scale-factor=1",
      "--window-size=1280,720", "--virtual-time-budget=4000", `--screenshot=${resolve(out)}`, pathToFileURL(html).href,
    ], { stdio: "ignore" });
    const t = setTimeout(() => { p.kill(); bad(new Error("封面截圖逾時")); }, 60_000);
    p.on("error", bad);
    p.on("close", (c) => { clearTimeout(t); c === 0 ? ok() : bad(new Error(`封面截圖失敗 ${c}`)); });
  });
  return out;
}
