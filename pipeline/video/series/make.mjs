/**
 * 每日影片（v2.35）：一個題目 → 片。稿子跟畫面都來自正式站那一頁（頁面的字當事實、截那頁的卡片當畫面），不寫 LLM 稿。
 * 用法：node pipeline/video/series/make.mjs <mob-<id>|go-<id>> [--shorts-only] [--out 資料夾]
 * 產物：shorts.mp4（＋正片時 main.mp4、cover.png）、youtube.txt、site.json（官網影片區那一筆的標題、摘要、工具連結）。
 * 環境變數：AZURE_OPENAI_KEY、INWORLD_API_KEY；要有 Chrome（CHROME_PATH）、ffmpeg、npx。
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { voiceLines, spokenDates } from "../lib/voice.mjs";
import { makeCover } from "../lib/cover.mjs";
import { transcribe } from "../lib/llm.mjs";
import { composeProject } from "../lib/compose.mjs";
import { buildDescription, capTitle, pickAvatars, youtubeText } from "../make.mjs";
import { browser, pickSel, SITE } from "./shoot.mjs";
import { parseMob, parseGo, mobScript, goScript, spokenFix } from "./facts.mjs";
import { mobTopics, goTopics } from "./topics.mjs";

const execFileP = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const AVATAR_DIR = resolve(HERE, "../cast"); // v2.40 挑過的整套穿搭
const RENDER_TIMEOUT = 20 * 60 * 1000;
const BAR = { mob: { red: "在哪打", yel: "楓谷幫手" }, go: { red: "怎麼去", yel: "楓谷幫手" } };
const run = (cmd, args, timeout) =>
  execFileP(cmd, args, { timeout, shell: process.platform === "win32", maxBuffer: 64 << 20, windowsHide: true });

export const utm = (path, key) => `${SITE}${path}${path.includes("?") ? "&" : "?"}utm_source=youtube&utm_medium=video&utm_campaign=${key}`;

export function findTopic(key) {
  const t = [...mobTopics(), ...goTopics()].find((x) => x.key === key);
  if (!t) throw new Error(`沒有這個題目：${key}`);
  return t;
}

/** 封面的主角圖跟字：怪物圖／目的地整張地圖畫面（站上 public 裡同一份），找不到就用這集第一張截圖 */
export function coverOf(topic, script, facts) {
  const PUB = resolve(HERE, "../../../public");
  if (topic.kind === "mob") {
    const img = join(PUB, "assets/monster_frames", `${topic.id}.png`);
    return { title: `${facts.name}在哪打？`, sub: script.subtitle, tag: "在哪打", hero: existsSync(img) ? img : script.images[0], pixel: existsSync(img) };
  }
  const img = join(PUB, "assets/map_renders", `${topic.id}.webp`);
  return { title: `${facts.to}怎麼去？`, sub: script.subtitle, tag: "怎麼去", hero: existsSync(img) ? img : script.images[0], fill: existsSync(img) };
}

/** 開頁讀事實＋截圖；回傳稿子跟每句旁白配的圖 */
export async function shootTopic(topic, imgDir, { port } = {}) {
  await mkdir(imgDir, { recursive: true });
  const b = await browser({ port });
  try {
    if (topic.kind === "mob") {
      await b.open(topic.path, `document.querySelector("main")?.innerText.includes("掉落物")||document.querySelector("main")?.innerText.includes("出沒地圖")`);
      const f = parseMob(await b.text());
      const script = mobScript(f, { link: utm(topic.path, topic.key) });
      const shots = {
        maps: pickSel(["出沒地圖：哪裡最多"], { without: ["掉落物", "物理攻擊"], smallest: false }),
        stats: pickSel(["等級", "物理攻擊", "迴避"]),
        drops: pickSel(["掉落物（"], { without: ["出沒地圖"], smallest: false }),
      };
      const got = {};
      // 刷怪點只截前 5 名（整張清單 17 張圖時太長、字太小）
      const maxH = { maps: 330 };
      for (const [k, sel] of Object.entries(shots)) if (await b.clip(join(imgDir, `${k}.png`), sel, { maxH: maxH[k] })) got[k] = join(imgDir, `${k}.png`);
      if (!got.maps) throw new Error(`${f.name}：截不到出沒地圖`);
      // 每句配圖：刷怪點、刷怪點、能力、掉落物、刷怪點（cta）、刷怪點
      const per = ["maps", "maps", "stats", f.dropCount ? "drops" : null, "maps", "maps"].filter((x) => x !== null);
      script.images = per.map((k) => got[k] ?? got.maps);
      return { script, facts: f };
    }
    await b.open(topic.path, `document.querySelector("main")?.innerText.includes("到了")`);
    const f = parseGo(await b.text());
    const script = goScript(f, { link: utm(topic.path, topic.key) });
    const route = join(imgDir, "route.png");
    const steps = [];
    for (let i = 0; i < f.steps.length; i++) {
      const s = f.steps[i];
      const sentence = s.say.startsWith("跟") ? `${s.say} ${s.next}` : `${s.say}，往 ${s.next}`;
      const file = join(imgDir, `s${i + 1}.png`);
      if (!(await b.clip(file, pickSel([sentence, "角落小圖"])))) throw new Error(`${f.to}：截不到第 ${i + 1} 段`);
      steps.push(file);
    }
    const hasRoute = await b.clip(route, pickSel(["從哪裡出發", "要去哪裡"]));
    const head = hasRoute ? route : steps[0];
    // 每句配圖：開頭放出發／目的地、每段放那段的圖、結尾回到開頭那張
    script.images = [head, ...steps, head, head];
    return { script, facts: f };
  } finally {
    await b.close();
  }
}

/** 片長要多長才做：段數 2～8、怪物至少 1 張圖 */
export function worthMaking(topic, facts) {
  if (topic.kind === "go") return facts.steps.length >= 2 && facts.steps.length <= 8;
  return facts.maps.length >= 1;
}

/** 讀頁面、截圖、寫稿（還沒配音、沒 render）；不適合做的丟錯。乾跑也走這裡 */
export async function draftTopic(key, work, { port } = {}) {
  const topic = findTopic(key);
  await mkdir(work, { recursive: true });
  const { script: s, facts } = await shootTopic(topic, join(work, "images"), { port });
  if (!worthMaking(topic, facts)) {
    const e = new Error(`${key} 不適合做（${topic.kind === "go" ? `${facts.steps.length} 段` : "沒有出沒地圖"}）`);
    e.skip = true;
    throw e;
  }
  return { topic, facts, script: { ...s, ytTitle: capTitle(s.ytTitle), description: buildDescription(s.description, s.link) } };
}

export async function makeTopic(key, { out = join(tmpdir(), "maplehelper-daily", key), shortsOnly = false, log = console.log, port } = {}) {
  const outDir = resolve(out);
  const work = join(outDir, "work");
  const { topic, facts, script } = await draftTopic(key, work, { port });
  await writeFile(join(work, "script.json"), JSON.stringify(script, null, 2));
  log(`${key}：${script.title}，旁白 ${script.narration.length} 句`);

  const spoken = (t) => spokenDates(spokenFix(t));
  const shortsVoice = await voiceLines(script.shortsNarration, join(work, "vo-shorts"), { transcribe, spoken });
  const voice = shortsOnly ? shortsVoice : await voiceLines(script.narration, join(work, "vo-main"), { transcribe, spoken });
  const avatars = pickAvatars(await readdir(AVATAR_DIR), topic.id).map((f) => join(AVATAR_DIR, f));
  const input = { script, voice, shortsVoice, images: script.images, avatars, date: "" };
  const files = { youtube: join(outDir, "youtube.txt"), site: join(outDir, "site.json") };
  for (const layout of shortsOnly ? ["shorts"] : ["main", "shorts"]) {
    const p = await composeProject(input, join(work, layout), layout);
    const f = join(p.dir, "index.html");
    const bar = BAR[topic.kind];
    const html = (await readFile(f, "utf8"))
      .replaceAll('<div class="red">快報</div>', `<div class="red">${bar.red}</div>`)
      .replaceAll('<div class="yel">官方公告 </div>', `<div class="yel">${bar.yel}</div>`);
    await writeFile(f, html);
    const t = Date.now();
    files[layout] = join(outDir, `${layout}.mp4`);
    await run("npx", ["--yes", "hyperframes@0.9.40", "render", p.dir, "-o", files[layout], "-f", "30", "--quiet"], RENDER_TIMEOUT);
    log(`${key} ${layout} ${p.durationSec} 秒，render ${Math.round((Date.now() - t) / 1000)} 秒`);
  }
  if (!shortsOnly) {
    files.cover = join(outDir, "cover.png");
    // 封面：在哪打放怪物、怎麼去放目的地小地圖（站上同一份圖），放大＋標題（v2.40）；做不出來才退回正片第 1.5 秒
    try {
      await makeCover({ ...coverOf(topic, script, facts), avatar: avatars[0], out: files.cover, work: join(work, "cover") });
    } catch (e) {
      log(`${key} 封面改用影片畫面：${e.message}`);
      await run("ffmpeg", ["-y", "-v", "error", "-ss", "1.5", "-i", files.main, "-frames:v", "1", files.cover], 60_000);
    }
  }
  await writeFile(files.youtube, youtubeText(script));
  const tool = topic.kind === "mob" ? { href: topic.path, text: `${facts.name}資料` } : { href: topic.path, text: "地圖導航" };
  await writeFile(files.site, JSON.stringify({ ...script.site, tool }));
  return { key, topic, script, files, outDir };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const key = args.find((a) => /^(mob|go)-\d+$/.test(a));
  const oi = args.indexOf("--out");
  if (!key) {
    console.error("用法：node pipeline/video/series/make.mjs <mob-<id>|go-<id>> [--shorts-only] [--out 資料夾]");
    process.exit(2);
  }
  const res = await makeTopic(key, { shortsOnly: args.includes("--shorts-only"), ...(oi >= 0 ? { out: args[oi + 1] } : {}) });
  console.log("完成", res.outDir);
}
