/**
 * 每日影片（v2.35，11/17 使用者「一天至少 2 長片 6 短片」照推薦）：做隔天要公開的一批，排程公開，加進官網影片區。
 * 一天：「在哪打」1 集＋「怎麼去」1 集（各有正片＋短影音），另外各 1 個題目只做短影音 → 2 長 4 短（6 支）。
 * v2.42（11/19 使用者「公告優先，每日縮量」）：YouTube 一天大約只給傳 10 支（11/19 撞到 uploadLimitExceeded），縮成 2 長 4 短（一天 6 支），留 4 支給官網公告片（一則 2 支）。
 * 題目照 series/topics.mjs 的順序挑還沒做過的；做過的從頻道上傳過的片說明欄 utm_campaign 認，不另外存狀態。
 * 上傳失敗：額度用完、連不上就整班停，沒傳上去的題目下一班會再挑到；只是這支的標題或說明被退（v2.64）就換同一時段的下一個題目、後面照做。兩種都讓排程變紅燈。
 * 同一晚會跑兩班（Cloudflare 21:30＋GitHub 備援）：第二班從頻道認出那天哪些時段已經有片，只補缺的（v2.65）。
 * 用法：node pipeline/video/daily.mjs [--date 2026-11-18] [--dry-run] [--no-site]
 *   --date：哪一天公開（台灣時間，預設明天）；--dry-run：讀頁面、寫稿、檢查標題跟說明合不合 YouTube 規定，不配音不上傳；--no-site：不開官網影片區的 PR。
 * 環境變數：YT_CLIENT_ID／YT_CLIENT_SECRET／YT_REFRESH_TOKEN、AZURE_OPENAI_KEY、INWORLD_API_KEY、
 *   GH_TOKEN（開 PR 到 dev 用；沒有就不開）、VIDEO_OUT（產物資料夾）。要有 Chrome、ffmpeg、npx、git、gh。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getAccessToken, uploadVideo, setThumbnail, parseYoutubeTxt, shortsTitle, youtubeFromEnv, youtubeProblems, isVideoRejected } from "./lib/youtube.mjs";
import { mobTopics, goTopics, nextTopics, MADE_BY_HAND } from "./series/topics.mjs";
import { draftTopic, makeTopic } from "./series/make.mjs";
import { youtubeText } from "./make.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const SERIES_TAGS = ["楓之谷經典版", "楓谷幫手", "新楓之谷", "楓之谷攻略"];

/** 公開時間（台灣時間）：正片跟它的短影音一起出；只有短影音的錯開 */
export const SLOTS = { full: ["12:00", "19:00"], shorts: ["09:00", "21:00"] };
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

/** 官網影片區（src/lib/videos.ts）已經有的題目：頻道上傳清單會漏，多一個來源，漏了也不會重做 */
export function doneFromSite(src) {
  const done = new Set();
  for (const m of String(src).matchAll(/href: "\/(go\?to=|db\/monsters\/)(\d+)/g)) done.add(`${m[1].startsWith("go") ? "go" : "mob"}-${m[2]}`);
  return done;
}

/** 這一天要做什麼：full＝正片＋短影音、shorts＝只有短影音，各配好公開時間 */
export function planDay(date, done, { mobs = mobTopics(), gos = goTopics() } = {}) {
  // 還沒做過的全部當候選：題目不適合做時一路往後找（v2.65 以前只拿前 6 個，全不適合時段就空著）
  const m = nextTopics(mobs, done);
  const g = nextTopics(gos, done);
  return {
    full: [
      { cands: g, at: twIso(date, SLOTS.full[0]) },
      { cands: m, at: twIso(date, SLOTS.full[1]) },
    ],
    shorts: [
      { cands: m, at: twIso(date, SLOTS.shorts[0]) },
      { cands: g, at: twIso(date, SLOTS.shorts[1]) },
    ],
  };
}

/** 頻道上傳過的每一支（id、snippet、status；排程中還沒公開的也有） */
export async function channelVideos(token, fetcher = fetch) {
  const get = async (path) => {
    const r = await fetcher(`https://www.googleapis.com/youtube/v3/${path}`, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`YouTube 讀頻道 ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.json();
  };
  const ch = await get("channels?part=contentDetails&mine=true");
  const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error("讀不到頻道的上傳清單");
  // YouTube 的上傳清單換頁會重疊、擠掉幾支（11/25：共 73 支，兩頁 73 列裡 5 支重複、5 支不見，黑木妖等被當沒做過）→
  // 拿到的不重複支數不到總數，就換一頁幾支再讀一輪，邊界錯開補齊
  const found = new Set();
  let total = 0;
  for (const size of [50, 37, 23, 11]) {
    let page = "";
    do {
      const j = await get(`playlistItems?part=contentDetails&maxResults=${size}&playlistId=${uploads}${page ? `&pageToken=${page}` : ""}`);
      for (const it of j.items ?? []) if (it.contentDetails?.videoId) found.add(it.contentDetails.videoId);
      total = j.pageInfo?.totalResults ?? total;
      page = j.nextPageToken ?? "";
    } while (page);
    if (found.size >= total) break;
  }
  if (found.size < total) console.warn(`頻道共 ${total} 支，只讀到 ${found.size} 支`);
  const ids = [...found];
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const j = await get(`videos?part=snippet,status&maxResults=50&id=${ids.slice(i, i + 50).join(",")}`);
    out.push(...(j.items ?? []));
  }
  return out;
}

/**
 * 這一天哪些時段已經有片了（回傳 at 的集合）。同一晚會跑兩班（Cloudflare 21:30、GitHub 備援晚幾小時），
 * 第二班的機器上沒有第一班的 made.json，只能從頻道認：那天（台灣時間）要公開或已經公開的每日影片，
 * 題目種類（mob／go）加上「有正片／只有短影音」剛好對到一個時段。
 * 不比幾點幾分：時段過了才傳的會直接公開，時間對不上。
 */
export function filledSlots(date, videos) {
  const topics = new Map();
  for (const v of videos) {
    const key = String(v.snippet?.description ?? "").match(/utm_campaign=((?:mob|go)-\d+)/)?.[1];
    if (!key) continue;
    const time = v.status?.publishAt ?? (v.status?.privacyStatus === "private" ? null : v.snippet?.publishedAt);
    const day = time ? new Date(Date.parse(time) + 8 * 3600_000).toISOString().slice(0, 10) : null;
    const t = topics.get(key) ?? { kind: key.split("-")[0], main: false, days: { main: [], shorts: [] } };
    const isShorts = /#Shorts\s*$/i.test(v.snippet?.title ?? "");
    if (!isShorts) t.main = true;
    t.days[isShorts ? "shorts" : "main"].push(day);
    topics.set(key, t);
  }
  const slot = { go: { full: SLOTS.full[0], shorts: SLOTS.shorts[1] }, mob: { full: SLOTS.full[1], shorts: SLOTS.shorts[0] } };
  const filled = new Set();
  for (const t of topics.values()) {
    if (t.days.main.includes(date)) filled.add(twIso(date, slot[t.kind].full));
    else if (!t.main && t.days.shorts.includes(date)) filled.add(twIso(date, slot[t.kind].shorts));
  }
  return filled;
}

/** 這一天還缺的時段 */
export function missingJobs(plan, filled) {
  return [...plan.full.map((p) => ({ ...p, shortsOnly: false })), ...plan.shorts.map((p) => ({ ...p, shortsOnly: true }))]
    .filter((j) => !filled.has(j.at));
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
const videoCover = (mp4, out, size) =>
  execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", "1.5", "-i", mp4, "-frames:v", "1", "-vf", `scale=${size}`, "-c:v", "libwebp", "-quality", "80", out]);

const filesOf = (out) => ({ main: join(out, "main.mp4"), shorts: join(out, "shorts.mp4"), site: join(out, "site.json") });

/**
 * 官網影片區：videos.ts 加這批（made 每筆要有 out＝產物資料夾；另開 git worktree、產封面、開 PR 到 dev，不合併；不動目前的工作樹）。
 * 同一天第二班：分支已經在遠端、還沒合進 dev 就接著加，不蓋掉第一班的；PR 開著就只補說明。
 */
export function addToSite(made, {
  date, log = console.log, repo = REPO, cover = videoCover,
  gh = (args) => execFileSync("gh", args, { cwd: repo, encoding: "utf8" }),
} = {}) {
  if (!made.length) return null;
  const br = `feat/daily-videos-${date}`;
  const wt = join(tmpdir(), `maplehelper-site-${date}-${Date.now()}`);
  const root = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  root("fetch", "-q", "origin", "dev");
  let base = "origin/dev";
  if (root("ls-remote", "--heads", "origin", br).trim()) {
    root("fetch", "-q", "origin", `+refs/heads/${br}:refs/remotes/origin/${br}`);
    // 已經合進 dev 的舊分支就從 dev 開（推上去還是往前走，不用 -f）
    if (root("rev-list", "--count", `origin/dev..origin/${br}`).trim() !== "0") base = `origin/${br}`;
  }
  root("worktree", "add", "-q", "-B", br, wt, base);
  const git = (...a) => execFileSync("git", a, { cwd: wt, encoding: "utf8" });
  try {
    const f = join(wt, "src/lib/videos.ts");
    let s = readFileSync(f, "utf8");
    const entries = [];
    const added = [];
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
      added.push(v);
      if (v.main) cover(files.main, join(wt, "public/videos", `${v.main}.webp`), "640:360");
      cover(files.shorts, join(wt, "public/videos", `${v.shorts}.webp`), "360:640");
    }
    if (!entries.length) return null;
    const end = s.indexOf("\n];", s.indexOf("export const EPISODES"));
    s = s.slice(0, end + 1) + entries.join("") + s.slice(end + 1);
    writeFileSync(f, s);
    const pr = JSON.parse(gh(["pr", "list", "--head", br, "--base", "dev", "--state", "open", "--json", "number,title,body,url"]) || "[]")[0];
    // 版號：接著加就沿用 PR 的；不然 dev 最近的 commit 跟還開著的 PR 標題裡最大的再加 1（開著的 PR 已經佔走的號碼不能重複）
    let open = "";
    try { open = gh(["pr", "list", "--state", "open", "--json", "title", "--jq", ".[].title"]); } catch {}
    const tag = pr?.title.match(/^v\d+\.\d+/)?.[0] ?? nextVersion(`${git("log", "origin/dev", "--format=%s", "-60")}\n${open}`);
    git("add", "src/lib/videos.ts", "public/videos");
    git("commit", "-q", "-m", `${tag}: 影片區加 ${date} 的每日影片 ${entries.length} 筆（自動）\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`);
    git("push", "-q", "-u", "origin", br); // 不准 -f：第二班會把第一班的蓋掉（11/23、11/24 各漏過片）
    const list = added.map((v) => `「${v.title}」`).join("、");
    if (pr) {
      gh(["api", "-X", "PATCH", `repos/{owner}/{repo}/pulls/${pr.number}`, "-f", `body=後來這班又加：${list}。\n\n${pr.body}`]);
      log(`官網影片區 PR 補上 ${added.length} 筆：${pr.url}`);
      return pr.url;
    }
    const body = `每日影片（pipeline/video/daily.mjs）傳好後自動加進 /videos：${list}。公開時間到了頁面才會顯示。\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)`;
    const url = gh(["pr", "create", "--base", "dev", "--head", br, "--title", `${tag}: 影片區加 ${date} 每日影片`, "--body", body]).trim();
    log(`官網影片區 PR：${url}`);
    return url;
  } finally {
    root("worktree", "remove", "--force", wt);
  }
}

const MAX_BROKEN = 6;

/**
 * 一個時段一個題目做過去。make 丟錯＝這個題目不適合，換下一個候選（配音點數、額度用完才整班停）；
 * upload 丟錯＝記進 failed（整批紅燈）：這支的標題／說明被退就換下一個候選，其他的（傳片上限、登入失效、連不上）整班停。
 * 不適合做的（e.skip）一路往後找；做片失敗（截不到、配音不過）6 個就放棄這個時段，網站掛了不要把 200 個題目都試一遍。
 * 時段空著也記進 failed（紅燈，11/24、11/25「怎麼去」整天沒片沒人發現）。
 * e.main＝正片已經傳上去：用 partial 記下來（頻道上已經有，下一班不會再挑），這個時段不再補。
 */
export async function runJobs({ jobs, done, make, upload, partial, log }) {
  const used = new Set();
  const made = [];
  const failed = [];
  const line = (e) => e.message.replace(/\s+/g, " ").slice(0, 160);
  for (const j of jobs) {
    let filled = false;
    let broken = 0;
    for (let t; !filled && broken < MAX_BROKEN && (t = j.cands.find((c) => !used.has(c.key) && !done.has(c.key))); ) {
      used.add(t.key);
      let res;
      try {
        res = await make(t, j);
      } catch (e) {
        log(`${t.key} 跳過：${e.message.split("\n")[0]}`);
        if (!isOutOfCredit(e.message)) {
          if (!e.skip) broken++;
          continue;
        }
        log(`配音或額度用完，這班停下來：${e.message.split("\n")[0]}`);
        failed.push({ key: t.key, why: line(e) });
        return { made, failed };
      }
      try {
        made.push(await upload(res, j));
        filled = true;
      } catch (e) {
        failed.push({ key: t.key, why: e.reason || line(e) });
        if (e.main) {
          made.push(partial(res, j, e.main));
          filled = true;
        }
        if (!isVideoRejected(e)) {
          log(`上傳停在 ${t.key}：${e.message}`);
          return { made, failed };
        }
        log(`${t.key} 被 YouTube 退（${e.reason}），${filled ? "做下一個時段" : "換下一個題目"}：${line(e)}`);
      }
    }
    if (!filled) {
      const slot = `${j.at} ${j.shortsOnly ? "短影音" : "正片＋短影音"}`;
      const why = broken >= MAX_BROKEN ? `連著 ${broken} 個題目做不出來` : "沒有題目可做";
      log(`${slot}：${why}`);
      failed.push({ key: slot, why });
    }
  }
  return { made, failed };
}

export async function daily({ date = targetDateTw(), dryRun = false, site = true, env = process.env, log = console.log } = {}) {
  const creds = youtubeFromEnv(env);
  if (!creds) throw new Error("缺 YT_CLIENT_ID／YT_CLIENT_SECRET／YT_REFRESH_TOKEN");
  const token = await getAccessToken(creds);
  const videos = await channelVideos(token);
  const done = doneFromDescriptions(videos.map((v) => v.snippet?.description));
  for (const k of doneFromSite(readFileSync(join(REPO, "src/lib/videos.ts"), "utf8"))) done.add(k);
  const plan = planDay(date, done);
  const outRoot = resolve(env.VIDEO_OUT || join(tmpdir(), "maplehelper-daily", date));
  log(`${date}：頻道 ${videos.length} 支，做過 ${done.size} 個題目`);
  // 同一天第二班（或額度用完補傳）：頻道上已經有片的時段不再做；本機重跑另外看 made.json
  const madeFile = join(outRoot, "made.json");
  const before = existsSync(madeFile) ? JSON.parse(readFileSync(madeFile, "utf8")) : [];
  for (const v of before) done.add(v.key);
  const filled = filledSlots(date, videos);
  for (const at of filled) log(`${at} 已經有片，不再做`);
  for (const v of before) filled.add(v.at);
  const jobs = missingJobs(plan, filled);
  if (dryRun) {
    // 乾跑：讀頁面、寫稿、檢查標題跟說明合不合 YouTube 規定；不配音、不 render、不上傳
    const { failed } = await runJobs({
      jobs, done, log,
      make: (t) => draftTopic(t.key, join(outRoot, t.key, "work")),
      upload: async ({ topic, script }, j) => {
        const yt = parseYoutubeTxt(youtubeText(script));
        log(`${j.at} ${j.shortsOnly ? "短影音" : "正片＋短影音"} ${topic.key} ${yt.title}（標題 ${[...yt.title].length} 字、說明 ${Buffer.byteLength(yt.description)} bytes）`);
        const bad = youtubeProblems(yt);
        if (bad.length) throw Object.assign(new Error(bad.join("、")), { status: 400, reason: "invalidDescription" });
        return { key: topic.key };
      },
    });
    return { jobs: jobs.length, made: [], failed };
  }
  mkdirSync(outRoot, { recursive: true });
  const { made, failed } = await runJobs({
    jobs, done, log,
    make: (t, j) => makeTopic(t.key, { out: join(outRoot, t.key), shortsOnly: j.shortsOnly, log }),
    upload: async (res, j) => {
      const { title, description } = parseYoutubeTxt(readFileSync(res.files.youtube, "utf8"));
      const publishAt = publishTime(j.at);
      let main = null;
      try {
        if (!j.shortsOnly) {
          main = await uploadVideo({ file: res.files.main, title, description, tags: SERIES_TAGS, publishAt, token });
          try { await setThumbnail({ videoId: main, file: res.files.cover, token }); } catch (e) { log(`封面沒設成：${e.message}`); }
        }
        const shorts = await uploadVideo({ file: res.files.shorts, title: shortsTitle(title), description, tags: SERIES_TAGS, publishAt, token });
        log(`傳好 ${res.key}：${main ? `正片 ${main}、` : ""}短影音 ${shorts}（${j.at} 公開）`);
        return { key: res.key, title: res.script.site.title, at: j.at, main, shorts, out: res.outDir };
      } catch (e) {
        throw Object.assign(e, { main });
      }
    },
    partial: (res, j, main) => ({ key: res.key, title: res.script.site.title, at: j.at, main, shorts: null, out: res.outDir }),
  });
  const all = [...before, ...made];
  writeFileSync(madeFile, JSON.stringify(all, null, 2));
  if (site && env.GH_TOKEN && made.length) {
    try { addToSite(all, { date, log }); } catch (e) {
      const why = e.message.split("\n")[0];
      log(`官網影片區 PR 沒開成：${why}`);
      failed.push({ key: "官網影片區 PR", why: why.slice(0, 160) });
    }
  }
  return { jobs: jobs.length, made, failed };
}

/**
 * 排程要紅燈的理由（空的＝綠燈）：有題目被退、時段空著、中途停下來、官網 PR 沒開成
 * （11/23～11/25 每晚說明被退、後面全沒做，卻因為第一支有傳成而顯示成功）；
 * 有時段要做卻一支都沒做出來（11/18、11/19 配音點數用完卻顯示成功）。第二班沒事做是綠燈。
 */
export function exitProblems({ jobs, made, failed, dryRun = false }) {
  const out = [];
  if (failed.length) out.push(`沒做成 ${failed.length} 個：${failed.map((f) => `${f.key}（${f.why}）`).join("、")}`);
  if (!dryRun && jobs && !made.length) out.push("一支都沒做出來");
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const a = process.argv.slice(2);
  const di = a.indexOf("--date");
  const dryRun = a.includes("--dry-run");
  const r = await daily({ date: di >= 0 ? a[di + 1] : undefined, dryRun, site: !a.includes("--no-site") });
  console.log(`完成：${r.made.length} 個題目`);
  for (const why of exitProblems({ ...r, dryRun })) {
    console.error(why);
    process.exitCode = 1;
  }
}
