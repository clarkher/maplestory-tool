/**
 * 每日影片（v2.35，11/17 使用者「一天至少 2 長片 6 短片」照推薦）：做隔天要公開的一批，排程公開，加進官網影片區。
 * 一天：「在哪打」1 集＋「怎麼去」1 集（各有正片＋短影音），另外各 2 個題目只做短影音 → 2 長 6 短。
 * 題目照 series/topics.mjs 的順序挑還沒做過的；做過的從頻道上傳過的片說明欄 utm_campaign 認，不另外存狀態。
 * 上傳失敗（額度用完）就停：沒傳上去的題目下一班會再挑到。
 * 用法：node pipeline/video/daily.mjs [--date 2026-11-18] [--dry-run] [--no-site]
 *   --date：哪一天公開（台灣時間，預設明天）；--dry-run：只印要做哪幾個；--no-site：不開官網影片區的 PR。
 * 環境變數：YT_CLIENT_ID／YT_CLIENT_SECRET／YT_REFRESH_TOKEN、AZURE_OPENAI_KEY、INWORLD_API_KEY、
 *   GH_TOKEN（開 PR 到 dev 用；沒有就不開）、VIDEO_OUT（產物資料夾）。要有 Chrome、ffmpeg、npx、git、gh。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getAccessToken, uploadVideo, setThumbnail, parseYoutubeTxt, shortsTitle, youtubeFromEnv } from "./lib/youtube.mjs";
import { mobTopics, goTopics, nextTopics, MADE_BY_HAND } from "./series/topics.mjs";
import { makeTopic } from "./series/make.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const SERIES_TAGS = ["楓之谷經典版", "楓谷幫手", "新楓之谷", "楓之谷攻略"];

/** 公開時間（台灣時間）：正片跟它的短影音一起出；只有短影音的錯開 */
export const SLOTS = { full: ["12:00", "19:00"], shorts: ["09:00", "15:00", "17:00", "21:00"] };
export const twIso = (date, hhmm) => new Date(`${date}T${hhmm}:00+08:00`).toISOString();

/** 台灣時間的明天（YYYY-MM-DD） */
export function tomorrowTw(now = Date.now()) {
  return new Date(now + 8 * 3600_000 + 86400_000).toISOString().slice(0, 10);
}

/**
 * 這一班要做哪一天：照理 21:30 跑、做明天；但 GitHub 排程曾晚 8 小時（11/18 晚上的班 11/19 05:30 才跑），
 * 用「現在」算明天會整天跳過 → 往回推 12 小時再算（中午以前跑都算今天）
 */
export function targetDateTw(now = Date.now()) {
  return tomorrowTw(now - 12 * 3600_000);
}

/** 公開時間已經過了（或 20 分鐘內）就不排程、傳好直接公開；YouTube 不收過去的排程時間 */
export function publishTime(at, now = Date.now()) {
  return Date.parse(at) > now + 20 * 60_000 ? at : null;
}

/** 配音點數／額度用完：換題目也沒用，整班停下來 */
export const isOutOfCredit = (msg) => /\b(402|429)\b|no credits|quota/i.test(String(msg));

/** 說明欄裡的 utm_campaign=mob-123 / go-456 → 做過的題目 */
export function doneFromDescriptions(descs) {
  const done = new Set(MADE_BY_HAND);
  for (const d of descs) for (const m of String(d).matchAll(/utm_campaign=((?:mob|go)-\d+)/g)) done.add(m[1]);
  return done;
}

/** 這一天要做什麼：full＝正片＋短影音、shorts＝只有短影音，各配好公開時間 */
export function planDay(date, done, { mobs = mobTopics(), gos = goTopics(), pool = 6 } = {}) {
  // 每種多挑幾個備用：題目不適合做（段數太多之類）時往後遞補
  const m = nextTopics(mobs, done, pool);
  const g = nextTopics(gos, done, pool);
  return {
    full: [
      { cands: g, at: twIso(date, SLOTS.full[0]) },
      { cands: m, at: twIso(date, SLOTS.full[1]) },
    ],
    shorts: [
      { cands: m, at: twIso(date, SLOTS.shorts[0]) },
      { cands: g, at: twIso(date, SLOTS.shorts[1]) },
      { cands: m, at: twIso(date, SLOTS.shorts[2]) },
      { cands: g, at: twIso(date, SLOTS.shorts[3]) },
    ],
  };
}

async function channelDescriptions(token) {
  const get = async (url) => {
    const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`YouTube 讀頻道 ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.json();
  };
  const ch = await get("https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true");
  const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error("讀不到頻道的上傳清單");
  const out = [];
  let page = "";
  do {
    const j = await get(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${uploads}${page ? `&pageToken=${page}` : ""}`);
    for (const it of j.items ?? []) out.push(it.snippet?.description ?? "");
    page = j.nextPageToken ?? "";
  } while (page);
  return out;
}

/** 一堆 commit／PR 標題裡最大的 vX.YY 再加 1 */
export function nextVersion(text) {
  let best = null;
  for (const m of String(text).matchAll(/^v(\d+)\.(\d+):/gm)) {
    const v = [Number(m[1]), Number(m[2])];
    if (!best || v[0] > best[0] || (v[0] === best[0] && v[1] > best[1])) best = v;
  }
  return best ? `v${best[0]}.${String(best[1] + 1).padStart(2, "0")}` : "v0.00";
}

/** 影片區封面：成片 1.5 秒那格存 webp（跟 scripts/video-covers.mjs 同規格） */
const cover = (mp4, out, size) =>
  execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", "1.5", "-i", mp4, "-frames:v", "1", "-vf", `scale=${size}`, "-c:v", "libwebp", "-quality", "80", out]);

const filesOf = (out) => ({ main: join(out, "main.mp4"), shorts: join(out, "shorts.mp4"), site: join(out, "site.json") });

/** 官網影片區：videos.ts 加這批（made 每筆要有 out＝產物資料夾；另開 git worktree 從 origin/dev 開分支、產封面、開 PR 到 dev，不合併；不動目前的工作樹） */
export function addToSite(made, { date, log = console.log } = {}) {
  if (!made.length) return null;
  const br = `feat/daily-videos-${date}`;
  const wt = join(tmpdir(), `maplehelper-site-${date}-${Date.now()}`);
  execFileSync("git", ["fetch", "-q", "origin", "dev"], { cwd: REPO });
  execFileSync("git", ["worktree", "add", "-q", "-B", br, wt, "origin/dev"], { cwd: REPO });
  const git = (...a) => execFileSync("git", a, { cwd: wt, encoding: "utf8" });
  try {
    const f = join(wt, "src/lib/videos.ts");
    let s = readFileSync(f, "utf8");
    const entries = [];
    for (const v of made) {
      if (!v.shorts || s.includes(v.shorts)) continue;
      const files = filesOf(v.out);
      const site = JSON.parse(readFileSync(files.site, "utf8"));
      const lines = [
        "  {",
        `    title: ${JSON.stringify(site.title)},`,
        `    summary: ${JSON.stringify(site.summary)},`,
        `    publishAt: ${JSON.stringify(v.at)},`,
        ...(v.main ? [`    main: ${JSON.stringify(v.main)},`] : []),
        `    shorts: ${JSON.stringify(v.shorts)},`,
        `    tool: { href: ${JSON.stringify(site.tool.href)}, text: ${JSON.stringify(site.tool.text)} },`,
        "  },",
      ];
      entries.push(lines.join("\n") + "\n");
      if (v.main) cover(files.main, join(wt, "public/videos", `${v.main}.webp`), "640:360");
      cover(files.shorts, join(wt, "public/videos", `${v.shorts}.webp`), "360:640");
    }
    if (!entries.length) return null;
    const end = s.indexOf("\n];", s.indexOf("export const EPISODES"));
    s = s.slice(0, end + 1) + entries.join("") + s.slice(end + 1);
    writeFileSync(f, s);
    // 版號：dev 最近的 commit 跟還開著的 PR 標題裡最大的再加 1（開著的 PR 已經佔走的號碼不能重複）
    let open = "";
    try { open = execFileSync("gh", ["pr", "list", "--state", "open", "--json", "title", "--jq", ".[].title"], { cwd: wt, encoding: "utf8" }); } catch {}
    const tag = nextVersion(`${git("log", "origin/dev", "--format=%s", "-60")}\n${open}`);
    git("add", "src/lib/videos.ts", "public/videos");
    git("commit", "-q", "-m", `${tag}: 影片區加 ${date} 的每日影片 ${entries.length} 筆（自動）\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`);
    git("push", "-q", "-f", "-u", "origin", br); // 同一天重跑會重開這條分支（只有這支程式在用）
    const body = `每日影片（pipeline/video/daily.mjs）傳好後自動加進 /videos：${made.map((v) => `「${v.title}」`).join("、")}。公開時間到了頁面才會顯示。\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)`;
    const url = execFileSync("gh", ["pr", "create", "--base", "dev", "--head", br, "--title", `${tag}: 影片區加 ${date} 每日影片`, "--body", body], { cwd: wt, encoding: "utf8" }).trim();
    log(`官網影片區 PR：${url}`);
    return url;
  } finally {
    execFileSync("git", ["worktree", "remove", "--force", wt], { cwd: REPO });
  }
}

export async function daily({ date = targetDateTw(), dryRun = false, site = true, env = process.env, log = console.log } = {}) {
  const creds = youtubeFromEnv(env);
  if (!creds) throw new Error("缺 YT_CLIENT_ID／YT_CLIENT_SECRET／YT_REFRESH_TOKEN");
  const token = await getAccessToken(creds);
  const done = doneFromDescriptions(await channelDescriptions(token));
  const plan = planDay(date, done);
  const outRoot = resolve(env.VIDEO_OUT || join(tmpdir(), "maplehelper-daily", date));
  log(`${date}：做過 ${done.size} 個題目`);
  // 同一天重跑（額度用完隔天補傳之類）：已經傳好的時段不再做
  const madeFile = join(outRoot, "made.json");
  const before = existsSync(madeFile) ? JSON.parse(readFileSync(madeFile, "utf8")) : [];
  for (const v of before) done.add(v.key);
  const used = new Set();
  const take = (cands) => cands.find((t) => !used.has(t.key) && !done.has(t.key));
  const jobs = [...plan.full.map((p) => ({ ...p, shortsOnly: false })), ...plan.shorts.map((p) => ({ ...p, shortsOnly: true }))]
    .filter((j) => !before.some((v) => v.at === j.at));
  if (dryRun) {
    for (const j of jobs) {
      const t = take(j.cands);
      if (t) used.add(t.key);
      log(`${j.at} ${j.shortsOnly ? "短影音" : "正片＋短影音"} ${t?.key ?? "（沒題目了）"} ${t?.name ?? t?.path ?? ""}`);
    }
    return [];
  }
  const made = [];
  mkdirSync(outRoot, { recursive: true });
  let stop = null;
  for (const j of jobs) {
    let res = null;
    for (let t = take(j.cands); t; t = take(j.cands)) {
      used.add(t.key);
      try {
        res = await makeTopic(t.key, { out: join(outRoot, t.key), shortsOnly: j.shortsOnly, log });
        break;
      } catch (e) {
        log(`${t.key} 跳過：${e.message.split("\n")[0]}`);
        if (isOutOfCredit(e.message)) { stop = e.message.split("\n")[0]; break; }
      }
    }
    if (stop) { log(`配音或額度用完，這班停下來：${stop}`); break; }
    if (!res) continue;
    const { title, description } = parseYoutubeTxt(readFileSync(res.files.youtube, "utf8"));
    const publishAt = publishTime(j.at);
    let main = null;
    try {
      if (!j.shortsOnly) {
        main = await uploadVideo({ file: res.files.main, title, description, tags: SERIES_TAGS, publishAt, token });
        try { await setThumbnail({ videoId: main, file: res.files.cover, token }); } catch (e) { log(`封面沒設成：${e.message}`); }
      }
      const shorts = await uploadVideo({ file: res.files.shorts, title: shortsTitle(title), description, tags: SERIES_TAGS, publishAt, token });
      made.push({ key: res.key, title: res.script.site.title, at: j.at, main, shorts, out: res.outDir });
      log(`傳好 ${res.key}：${main ? `正片 ${main}、` : ""}短影音 ${shorts}（${j.at} 公開）`);
    } catch (e) {
      log(`上傳停在 ${res.key}：${e.message}`);
      // 正片傳上去、短影音沒傳成：記下來（頻道上已經有，下一班不會再挑），官網影片區跳過它
      if (main) made.push({ key: res.key, title: res.script.site.title, at: j.at, main, shorts: null, out: res.outDir });
      break;
    }
  }
  const all = [...before, ...made];
  writeFileSync(madeFile, JSON.stringify(all, null, 2));
  if (site && env.GH_TOKEN && made.length) {
    try { addToSite(all, { date, log }); } catch (e) { log(`官網影片區 PR 沒開成：${e.message.split("\n")[0]}`); }
  }
  return made;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const a = process.argv.slice(2);
  const di = a.indexOf("--date");
  const dryRun = a.includes("--dry-run");
  const made = await daily({ date: di >= 0 ? a[di + 1] : undefined, dryRun, site: !a.includes("--no-site") });
  console.log(`完成：${made.length} 個題目`);
  // 一支都沒做出來要讓排程變紅燈（11/18、11/19 配音點數用完卻顯示成功，沒人發現）
  if (!dryRun && !made.length) {
    console.error("一支都沒做出來");
    process.exitCode = 1;
  }
}
