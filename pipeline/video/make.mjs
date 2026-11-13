/**
 * 一則官網公告 → 快報片（正片 1920×1080＋Shorts 1080×1920）。
 * 用法：node pipeline/video/make.mjs <公告id> [--out 資料夾]
 * 產物（out 資料夾）：main.mp4、shorts.mp4、cover.png（正片第 1.5 秒）、youtube.txt（標題、空行、說明欄）；
 *   中間檔在 out/work（官方圖、稿子 script.json、配音、HyperFrames 專案）。
 * 環境變數：AZURE_OPENAI_KEY、INWORLD_API_KEY；要有 ffmpeg／ffprobe、npx（render 用 hyperframes@0.9.40）。
 * 流程：抓內文 → 官方圖下載＋讀圖抄字 → 對站內頁 → 寫稿 → 國字數字換阿拉伯數字 → 數字日期對不到來源整句拿掉 → 配音驗音 → 組專案 → render → 封面。
 * 不夠做片（只有標題、稿子剩太少）會丟錯，訊息就是原因；「只有標題」的錯帶 permanent（run.mjs 不再重試）。
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fetchDetail, extractContent } from "./lib/detail.mjs";
import { filterScript, isUsable, trimExtras } from "./lib/facts.mjs";
import { sitePages, matchSitePage, utmUrl, withCta } from "./lib/site.mjs";
import { ocrImage, writeScript, transcribe } from "./lib/llm.mjs";
import { voiceLines, spokenDates } from "./lib/voice.mjs";
import { composeProject } from "./lib/compose.mjs";
import { arabicNumerals, arabicScript, screenScript } from "./lib/numerals.mjs";

const execFileP = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const AVATAR_DIR = resolve(HERE, "../../public/avatar-showcase");
const HYPERFRAMES = "hyperframes@0.9.40";
const RENDER_TIMEOUT = 15 * 60 * 1000;
export const HASHTAGS = "#楓之谷經典版 #楓谷幫手";

/** "2026/11/12" → "11/12" */
export function mmdd(startDate) {
  const [, m, d] = String(startDate).split(/[/\-]/);
  if (!m || !d) return "";
  return `${m.padStart(2, "0")}/${d.padStart(2, "0")}`;
}

/** 依公告 id 固定挑兩張角色圖（同一則每次一樣） */
export function pickAvatars(files, id) {
  const list = [...files].filter((f) => /\.png$/i.test(f)).sort();
  if (!list.length) return [];
  const k = Number(id) % list.length;
  return list.length === 1 ? [list[0]] : [list[k], list[(k + 1) % list.length]];
}

export function youtubeText(script) {
  return `${script.ytTitle}\n\n${script.description.trim()}\n\n${HASHTAGS}\n`;
}

function imgExt(url) {
  const e = extname(new URL(url).pathname).toLowerCase();
  return /^\.(png|jpe?g|gif|webp)$/.test(e) ? e : ".jpg";
}

async function download(url, file) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

function runCmd(cmd, args, timeout) {
  // Windows 的 npx 是 .cmd，要經過 shell
  const shell = process.platform === "win32";
  return execFileP(cmd, args, { timeout, shell, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
}

async function render(projectDir, outFile, log) {
  const t = Date.now();
  await runCmd("npx", ["--yes", HYPERFRAMES, "render", projectDir, "-o", outFile, "-f", "30", "--quiet"], RENDER_TIMEOUT);
  log(`render ${outFile}（${Math.round((Date.now() - t) / 1000)} 秒）`);
}

export async function make(id, { out = join(tmpdir(), "maplehelper-video-out", String(id)), log = console.log } = {}) {
  const outDir = resolve(out);
  const work = join(outDir, "work");
  await mkdir(join(work, "images"), { recursive: true });

  const detail = await fetchDetail(id);
  const { text, images } = extractContent(detail.html);
  log(`公告 ${id}：${detail.title}（${detail.startDate}），內文 ${text.length} 字、圖 ${images.length} 張`);

  // 官方圖：下載（給畫面用）＋讀圖抄字（當來源），失敗的跳過
  const local = new Map();
  const ocrs = [];
  for (let i = 0; i < images.length; i++) {
    const url = images[i];
    const file = join(work, "images", `img-${i + 1}${imgExt(url)}`);
    try {
      await download(url, file);
      local.set(url, file);
    } catch (err) {
      log(`圖 ${i + 1} 下載失敗，跳過：${err.message}`);
    }
    try {
      const t = String(await ocrImage(url)).trim();
      if (t) ocrs.push(t);
    } catch (err) {
      log(`圖 ${i + 1} 讀圖失敗，跳過：${err.message}`);
    }
  }
  if (!text.trim() && !ocrs.length) {
    // 公告本來就沒字沒圖才是永久的；有圖但下載或讀圖失敗可能只是一時的，照 3 次重試
    const e = new Error(images.length ? "官方圖讀不到字（下載或讀圖失敗），內文也是空的" : "只有標題，沒有內文可以做片");
    if (!images.length) e.permanent = true;
    throw e;
  }

  const page = matchSitePage(detail.title, text, sitePages());
  // 來源（給寫稿跟比對的）跟稿子都換成阿拉伯數字，兩邊一樣才比得準；畫面上一律 11月19日
  const base = arabicNumerals([text, ...ocrs].filter(Boolean).join("\n"));
  const source = arabicNumerals([base, page?.summary].filter(Boolean).join("\n"));

  const raw = await writeScript({ title: detail.title, startDate: detail.startDate, sourceText: base, site: page, images: [...local.keys()] });
  const filtered = filterScript(arabicScript(raw), source);
  const dropped = filtered.dropped;
  // 比對過後才拿年份、換用語（11/05 跟 2026/11/05 比對時一樣，不影響有沒有據）
  let script = screenScript(filtered.script, String(detail.startDate).slice(0, 4));
  await writeFile(join(work, "script.json"), JSON.stringify({ raw, script, dropped, source, page: page?.path ?? null }, null, 2));
  if (dropped.length) log(`對不到來源、拿掉 ${dropped.length} 句：${dropped.join("／")}`);
  if (!isUsable(script)) {
    throw new Error(`稿子能用的太少（卡片 ${script.cards.length} 張、旁白 ${script.narration.length} 句；對不到來源拿掉 ${dropped.length} 句）`);
  }
  script.description = script.description.replace("{{LINK}}", utmUrl(page?.path ?? "/", id));
  if (!script.description.includes("maplehelper.tw")) script.description = `${utmUrl(page?.path ?? "/", id)}\n${script.description}`;
  // 卡片後的補充句只留有數字日期的、最多 2 句（沒事實的多是空話）；都拿掉時結尾那句的畫面自然換成官方圖
  const trimmed = trimExtras(script);
  script = trimmed.script;
  if (trimmed.dropped.length) log(`補充句沒有事實、拿掉 ${trimmed.dropped.length} 句：${trimmed.dropped.join("／")}`);
  // 結尾那句（正片、Shorts、說明欄）由程式加這頁的 cta，模型不准自己寫網站有什麼
  script = withCta(script, page);
  await writeFile(join(work, "script-final.json"), JSON.stringify(script, null, 2));

  const voice = await voiceLines(script.narration, join(work, "vo-main"), { transcribe, spoken: spokenDates });
  const shortsLines = script.shortsNarration.length ? script.shortsNarration : script.narration.slice(0, 5);
  const shortsVoice = await voiceLines(shortsLines, join(work, "vo-shorts"), { transcribe, spoken: spokenDates });

  const chosen = script.images.map((u) => local.get(u)).filter(Boolean);
  const imgFiles = chosen.length ? chosen : [...local.values()];
  const avatars = pickAvatars(await readdir(AVATAR_DIR), id).map((f) => join(AVATAR_DIR, f));
  const input = { script, voice, shortsVoice, images: imgFiles, avatars, date: mmdd(detail.startDate) };
  const main = await composeProject(input, join(work, "main"), "main");
  const shorts = await composeProject(input, join(work, "shorts"), "shorts");
  log(`專案組好：正片 ${main.durationSec} 秒、Shorts ${shorts.durationSec} 秒`);

  const files = {
    main: join(outDir, "main.mp4"),
    shorts: join(outDir, "shorts.mp4"),
    cover: join(outDir, "cover.png"),
    youtube: join(outDir, "youtube.txt"),
  };
  await render(main.dir, files.main, log);
  await render(shorts.dir, files.shorts, log);
  await runCmd("ffmpeg", ["-y", "-v", "error", "-ss", "1.5", "-i", files.main, "-frames:v", "1", files.cover], 60_000);
  await writeFile(files.youtube, youtubeText(script));

  return { id: String(id), title: script.title, ytTitle: script.ytTitle, outDir, files: Object.values(files), dropped };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const id = args.find((a) => /^\d+$/.test(a));
  const oi = args.indexOf("--out");
  if (!id) {
    console.error("用法：node pipeline/video/make.mjs <公告id> [--out 資料夾]");
    process.exit(2);
  }
  const t = Date.now();
  const res = await make(id, oi >= 0 ? { out: args[oi + 1] } : {});
  console.log(`完成（${Math.round((Date.now() - t) / 1000)} 秒）：${res.outDir}`);
  for (const f of res.files) console.log(`  ${f}`);
}
