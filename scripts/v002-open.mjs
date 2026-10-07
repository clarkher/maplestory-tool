// V002（2026-10-15）官方開機前後的排程工作，給 .github/workflows/v002-open.yml 用（每 15 分鐘跑一次）。
//
// 每次執行做兩件事（先做 1，連線再慢也不會耽誤重新部署）：
//  1. 開機後重新部署：開機前建置的靜態頁 HTML 裡畫著首頁橫幅（「…開機後才能去」），開機後直接打開首頁會先閃一下
//     才收。開機 5 分鐘後，正式機（main）、測試機（dev）首頁還看得到橫幅，就推一個不改任何檔案的 commit 到那個分支，
//     Vercel 收到就重建。重建完還在就再推（隔至少 10 分鐘、最多 3 次）；推了 3 次、開機 2 小時還在、或開機時刻寫壞了
//     就開 issue 叫人；正式機好了開一則「完成」issue 記下時間跟 commit 再關掉（證明當天真的有跑）。
//     開機時刻每次都從那個分支的 release.ts 讀，不另外抄一份；讀不到（標示拆掉了）或首頁已經沒有橫幅，就當作完成、不動作。
//  2. 看官方維護公告：開機前，公告寫 10/15 維護到幾點跟網站設定（main 的 src/lib/release.ts 的 V002_OPEN_TIME）不同，
//     就開一個只改那一行的 PR 到 main，等用戶確認後合併（不自動合）。過了網站設定的開機時刻就不看了：當天臨時延後開機
//     （公告通常不寫幾點開）不處理，那段時間遊戲本來就進不去（2026-10-07 用戶決定）。
//
// 用法（Node 22 以上）：
//   node scripts/v002-open.mjs                  正常執行（排程用，要 GITHUB_TOKEN）
//   node scripts/v002-open.mjs --dry-run        只印出會做什麼，不推 commit、不開 issue／PR（不用 token）
//   node scripts/v002-open.mjs --now 2026-10-15T14:06:00+08:00 --only dev
//                                               演練：假裝現在是那個時間，只真的推測試機（正式機、公告只印不做）
// 也可以用環境變數：DRY_RUN=true、PRETEND_NOW=<時間>、ONLY=all|main|dev（workflow_dispatch 用這些）。
// 演練只證明「推了之後 Vercel 會重建」：假時間時開機後推過幾次查不到（冷卻、上限不會作用），重建出來的頁面還是開機前建置，橫幅不會消失。
// GITHUB_REPOSITORY 沒給就是 clarkher/maplestory-tool；有 GITHUB_STEP_SUMMARY 就把這次的判斷寫進執行摘要。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** 首頁橫幅（src/components/route/RouteHome.tsx）裡的字：首頁 HTML 有它，就是開機前建置的靜態頁 */
export const BANNER_MARK = "開機後才能去";
/** 排程推的重建 commit 都用這個開頭，數推過幾次就靠它 */
export const REDEPLOY_MESSAGE = "redeploy: V002 開機後重建靜態頁";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DELAY = 5 * MINUTE; // 開機 5 分鐘後才看
const COOLDOWN = 10 * MINUTE; // 推完至少等 10 分鐘再推下一次（Vercel 重建約 1 分鐘，留餘裕）
const MAX_PUSHES = 3;
const GIVE_UP = 2 * HOUR; // 開機 2 小時還有橫幅（或一直讀不到首頁）就叫人
const EXPIRE = 24 * HOUR; // 開機超過一天就不管了（明年 10/15 排程照樣會跑，這樣就不會動作）
const TIMEOUT = 15 * 1000; // 每個連線最多等 15 秒（Node 的 fetch 預設等 300 秒，會把整輪耗掉）
/** 合法的 HH:MM（00:00～23:59） */
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 台灣時間 date（YYYY-MM-DD）time（HH:MM）那一刻 */
function taipei(date, time) {
  return Date.parse(`${date}T${time}:00+08:00`);
}

/**
 * 從 release.ts 的原始碼讀開機時刻：{ date, time, at }。跟網站一樣是 V002_OPEN_DATE 那天的 V002_OPEN_TIME（台灣時間）；
 * 舊版完全沒有 V002_OPEN_TIME（那時當天 00:00 收）。檔案不見或讀不到開放日回 null；
 * 有 V002_OPEN_TIME 這個字卻讀不出合法的 HH:MM、或日期不存在，at 是 NaN（寫壞了，排程不敢推）。
 */
export function parseOpenAt(source) {
  if (!source) return null;
  const date = source.match(/export const V002_OPEN_DATE = "([^"]*)"/)?.[1];
  if (!date) return null;
  const time = source.includes("V002_OPEN_TIME") ? (source.match(/export const V002_OPEN_TIME = "([^"]*)"/)?.[1] ?? "") : "00:00";
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(date) && CLOCK.test(time);
  return { date, time, at: ok ? taipei(date, time) : Number.NaN };
}

export function hasBanner(html) {
  return html.includes(BANNER_MARK);
}

/**
 * 開機後要不要推重建 commit。banner：首頁有沒有橫幅（null＝讀不到首頁）；pushes：開機後已經推過的重建 commit 時間。
 * 回 { action, reason }，action：wait 等｜deploy 推｜done 完成｜alert 叫人｜expired 不管了。
 */
export function decideRedeploy({ now, openAt, banner, pushes }) {
  if (openAt == null) return { action: "done", reason: "release.ts 沒有開機時刻（標示已經拆掉），不用處理" };
  if (!Number.isFinite(openAt)) return { action: "alert", reason: "release.ts 的開機時刻寫壞了、看不懂，不敢推" };
  if (now < openAt + DELAY) return { action: "wait", reason: "還沒到開機＋5 分鐘" };
  if (now >= openAt + EXPIRE) return { action: "expired", reason: "開機已經超過一天，不再處理" };
  if (banner == null) {
    return now >= openAt + GIVE_UP ? { action: "alert", reason: "開機 2 小時了，還是讀不到首頁" } : { action: "wait", reason: "讀不到首頁，下一輪再看" };
  }
  if (!banner) return { action: "done", reason: "首頁已經沒有橫幅" };
  if (now - Math.max(-Infinity, ...pushes) < COOLDOWN) return { action: "wait", reason: "10 分鐘內剛推過，等 Vercel 重建" };
  if (pushes.length >= MAX_PUSHES) return { action: "alert", reason: `推了 ${pushes.length} 次重建，首頁還有橫幅` };
  if (now >= openAt + GIVE_UP) return { action: "alert", reason: "開機 2 小時了，首頁還有橫幅" };
  return { action: "deploy", reason: pushes.length ? `重建後還有橫幅，推第 ${pushes.length + 1} 次` : "首頁還有開機前建置的橫幅" };
}

const PERIOD = "(上午|早上|中午|下午|晚上)?";
const TIME = "(\\d{1,2})\\s*[:：]\\s*(\\d{2})";
const WEEKDAY = "(?:\\s*[（(]\\s*(?:星期|週|周)?[一二三四五六日天]\\s*[)）])?";
const SEP = "\\s*[~～〜\\-－—–至到]\\s*";
/** 時段後半可能再寫一次日期（「10/15(四) 08:00 ~ 10/15(四) 18:00」）：抓出月、日，不是同一天就不算 */
const SECOND_DATE = `(?:(?:\\d{4}\\s*[/年.\\-]\\s*)?(\\d{1,2})\\s*[/月.\\-]\\s*(\\d{1,2})\\s*日?${WEEKDAY}\\s*)?`;

function clock(period, hour, minute) {
  let h = Number(hour);
  if ((period === "下午" || period === "晚上") && h < 12) h += 12;
  return `${String(h).padStart(2, "0")}:${minute}`;
}

/**
 * 從維護公告的文字讀 date（YYYY-MM-DD）那天幾點維護到幾點：{ start, end, excerpt }（HH:MM、原文那一段連前後 20 字）。
 * 寫法：「全伺服器將於 10/1(四) 08:00 ~ 14:00」「2026/10/15(四)08:00~16:30」「10/15（四）上午 8:00 ～ 下午 6:00」。
 * 只認：前後 20 個字內有「維護／關機／停機／改版」、結束跟開始同一天、結束晚於開始（販售期間、活動時間不算）；
 * 有給 startBefore（網站設定的開機時刻）時，開始時間要早於它——開機後才開始的「維護補償領取」「首日加碼」不是維護。
 * 同一則有好幾段（維護時間調整公告：原定→調整後）取最後一段。沒寫時間範圍（延後開機公告）回 null。
 */
export function parseMaintenance(text, date, startBefore) {
  const [, month, day] = date.split("-").map(Number);
  const theDay = `(?:\\d{4}\\s*[/年.\\-]\\s*)?(?<!\\d)0?${month}\\s*[/月.\\-]\\s*0?${day}(?!\\d)\\s*日?`;
  const range = new RegExp(`${theDay}${WEEKDAY}\\s*${PERIOD}\\s*${TIME}${SEP}${SECOND_DATE}${PERIOD}\\s*${TIME}`, "g");
  let hit = null;
  for (const match of text.matchAll(range)) {
    const [whole, p1, h1, m1, month2, day2, p2, h2, m2] = match;
    if (month2 && (Number(month2) !== month || Number(day2) !== day)) continue;
    const start = clock(p1, h1, m1);
    const end = clock(p2, h2, m2);
    if (!CLOCK.test(start) || !CLOCK.test(end) || end <= start) continue;
    if (startBefore && start >= startBefore) continue;
    const from = Math.max(0, match.index - 20);
    const to = match.index + whole.length + 20;
    if (!/維護|關機|停機|改版/.test(text.slice(from, match.index) + text.slice(match.index + whole.length, to))) continue;
    hit = { start, end, excerpt: text.slice(from, to).trim() };
  }
  return hit;
}

/**
 * 公告列表裡要打開來讀的：date 前 7 天到當天發的關機公告、維護時間調整、改版公告（新的在前，照列表順序）。
 * 臨時維護、延後開機、開機公告、分流維護不看——開機當天的臨時維護不能蓋掉正常維護的時間。
 */
export function pickNotices(rows, date) {
  const day = date.replaceAll("-", "/");
  const earliest = new Date(taipei(date, "00:00") - 7 * 24 * HOUR + 8 * HOUR).toISOString().slice(0, 10).replaceAll("-", "/");
  return rows.filter(
    row =>
      row.startDate >= earliest &&
      row.startDate <= day &&
      /關機|維護時間調整|改版/.test(row.title) &&
      !/開機公告|延後|臨時|分流|商城|登入|客服|制裁/.test(row.title),
  );
}

/**
 * 公告的開機時間（announced）跟網站設定（current）不同、而且兩個時間都還沒到，才開 PR 改：{ action: "none" | "pr", time, reason }。
 * 過了網站設定的開機時刻就不再看（當天延後不處理）；讀到不合理的時間（99:00）不開。
 */
export function decideOpenTime({ now, date, current, announced }) {
  if (!CLOCK.test(current)) return { action: "none", reason: `網站設定的開機時刻 ${current} 讀不懂，不看公告` };
  if (now >= taipei(date, current)) return { action: "none", reason: `已經過了網站設定的開機時刻 ${current}，不再看公告` };
  if (!announced) return { action: "none", reason: `官方還沒公告 ${date} 的維護時間` };
  if (!CLOCK.test(announced)) return { action: "none", reason: `公告讀到的時間 ${announced} 不合理，不改` };
  if (announced === current) return { action: "none", reason: `公告維護到 ${announced}，跟網站設定一樣` };
  if (now >= taipei(date, announced)) return { action: "none", reason: `公告的開機時間 ${announced} 已經過了，不改` };
  return { action: "pr", time: announced, reason: `公告維護到 ${announced}，網站設定 ${current}` };
}

/** release.ts 的 V002_OPEN_TIME 那一行改成 time，其他一字不動；找不到那一行或時間不合法就報錯 */
export function setOpenTime(source, time) {
  if (!CLOCK.test(time)) throw new Error(`開機時刻 ${time} 不合法，不改`);
  const line = /^export const V002_OPEN_TIME = "\d{2}:\d{2}";$/m;
  if (!line.test(source)) throw new Error("release.ts 找不到 V002_OPEN_TIME 那一行，不改");
  return source.replace(line, `export const V002_OPEN_TIME = "${time}";`);
}

/**
 * 檢查參數：假時間（演練）又不是只看不做，就只准推測試機——正式機絕不拿假時間推。
 * 回 { now, only, canWrite(站), watchWrite（能不能開改時間的 PR） }。
 */
export function checkArgs({ dryRun, pretend, only, token }) {
  const now = pretend ? Date.parse(pretend) : Date.now();
  if (Number.isNaN(now)) throw new Error(`--now 的時間看不懂：${pretend}（例：2026-10-15T14:06:00+08:00）`);
  if (!["all", "main", "dev"].includes(only)) throw new Error(`--only 只能是 all、main、dev：${only}`);
  if (pretend && !dryRun && only !== "dev") throw new Error("演練時間（--now）只能搭配 --only dev 或 --dry-run：正式機不拿假時間推");
  if (!dryRun && !token) throw new Error("要 GITHUB_TOKEN 才能推 commit、開 issue／PR（只想看判斷就加 --dry-run）");
  return { now, only, canWrite: key => !dryRun && (!pretend || key === "dev"), watchWrite: !dryRun && !pretend };
}

// ───────────────────────── 以下是排程實際去讀、去做的部分 ─────────────────────────

const REPO = process.env.GITHUB_REPOSITORY || "clarkher/maplestory-tool";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const SITES = [
  { key: "main", label: "正式機", url: "https://maplestory-tool-three.vercel.app/" },
  { key: "dev", label: "測試機", url: "https://maplestory-tool-git-dev-clarkhers-projects.vercel.app/" },
];
const DONE_TITLE = "V002 開機後重新部署：完成";
const ALERT_TITLE = "V002 開機後重新部署：要人工處理";
const BULLETIN_API = "https://maplestoryclassic.beanfun.com/api/Bulletin";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const RUN_URL = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID}` : "";

const lines = [];
function say(line) {
  console.log(line);
  lines.push(line);
}
/** 執行摘要以外，在 Actions 畫面上標黃色警告（讀不到官方公告這種會默默沒作用的事） */
function warn(line) {
  say(line);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::${line.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`);
}

/** 台灣時間 YYYY-MM-DD HH:MM */
function fmt(ms) {
  return new Date(ms + 8 * HOUR).toISOString().slice(0, 16).replace("T", " ");
}

const decode = base64 => Buffer.from(base64, "base64").toString("utf8");

async function github(method, route, body) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "maplestory-tool-v002-open", "X-GitHub-Api-Version": "2022-11-28" };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  if (body) headers["Content-Type"] = "application/json";
  const response = await fetch(`https://api.github.com${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub ${method} ${route}：${response.status} ${(await response.text()).slice(0, 300)}`);
  return response.status === 204 ? null : response.json();
}

/** 那個分支的 src/lib/release.ts 原始碼（不見了回 null） */
async function releaseSource(branch) {
  const file = await github("GET", `/repos/${REPO}/contents/src/lib/release.ts?ref=${branch}`);
  return file ? decode(file.content) : null;
}

/** 首頁 HTML 有沒有橫幅；讀不到回 null */
async function readBanner(url) {
  try {
    const response = await fetch(url, {
      headers: { "Cache-Control": "no-cache", "User-Agent": "maplestory-tool-v002-open" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    return response.ok ? hasBanner(await response.text()) : null;
  } catch {
    return null;
  }
}

/** 開機後這個分支上，排程推過的重建 commit */
async function redeploysSince(branch, since) {
  const commits = await github("GET", `/repos/${REPO}/commits?sha=${branch}&since=${new Date(since).toISOString()}&per_page=100`);
  return (commits ?? [])
    .filter(commit => commit.commit.message.startsWith(REDEPLOY_MESSAGE))
    .map(commit => ({ sha: commit.sha, at: Date.parse(commit.commit.committer.date) }));
}

/** 推一個不改任何檔案的 commit（跟分支最新 commit 同一棵樹）到 branch，Vercel 收到就重建 */
async function pushEmptyCommit(branch, label) {
  const head = (await github("GET", `/repos/${REPO}/git/ref/heads/${branch}`)).object.sha;
  const tree = (await github("GET", `/repos/${REPO}/git/commits/${head}`)).tree.sha;
  const message = `${REDEPLOY_MESSAGE}（${label}，內容不變）\n\n開機前建置的首頁還畫著 V002 橫幅，重建一次讓靜態頁照開機後的狀態畫。由 .github/workflows/v002-open.yml 自動推。`;
  const commit = await github("POST", `/repos/${REPO}/git/commits`, { message, tree, parents: [head] });
  // force: false：這中間有人推了新 commit 就失敗，下一輪再看（有新 commit 本來就會重建）
  await github("PATCH", `/repos/${REPO}/git/refs/heads/${branch}`, { sha: commit.sha, force: false });
  return commit.sha;
}

async function reportIssues() {
  const issues = (await github("GET", `/repos/${REPO}/issues?state=all&per_page=100`)) ?? [];
  return issues.filter(issue => !issue.pull_request && (issue.title === DONE_TITLE || issue.title === ALERT_TITLE));
}

/**
 * 正式機的結果開 issue：完成記一則再關掉（只記一次，順手關掉還開著的叫人 issue）；
 * 要人工處理開一則留著（不管開著或被關掉，開過就不再開，免得每 15 分鐘一則）。
 * 開機後的叫人只看開機後開的那幾則：開機前因為時刻寫壞叫過人、修好了，開機後真的出事還是要再叫。
 */
async function report(decision, { open, now, pushes, site }) {
  const issues = await reportIssues();
  const done = issues.find(issue => issue.title === DONE_TITLE);
  const alerts = issues.filter(issue => issue.title === ALERT_TITLE && (!Number.isFinite(open.at) || Date.parse(issue.created_at) >= open.at));
  const pushed = pushes.length
    ? pushes.map(push => `${push.sha.slice(0, 7)}（${fmt(push.at)}）`).join("、")
    : "沒有（開機後已經有別的部署，不用另外推）";
  const facts = [
    `- 開機時刻：${open.date} ${open.time}（main 的 src/lib/release.ts）`,
    `- 檢查時間：${fmt(now)}（台灣時間）`,
    `- 排程推的重建 commit：${pushed}`,
    `- ${site.label}：${site.url}`,
    RUN_URL ? `- 這次執行：${RUN_URL}` : "",
  ].filter(Boolean);
  if (decision.action === "done" && !done) {
    for (const alert of issues.filter(issue => issue.title === ALERT_TITLE && issue.state === "open")) {
      await github("POST", `/repos/${REPO}/issues/${alert.number}/comments`, { body: `後來好了：${site.label}首頁已經沒有橫幅（${fmt(now)}）。` });
      await github("PATCH", `/repos/${REPO}/issues/${alert.number}`, { state: "closed", state_reason: "completed" });
    }
    const body = [`${site.label}首頁已經沒有「…開機後才能去」橫幅，直接打開首頁不會再先閃一下。`, "", ...facts].join("\n");
    const issue = await github("POST", `/repos/${REPO}/issues`, { title: DONE_TITLE, body });
    await github("PATCH", `/repos/${REPO}/issues/${issue.number}`, { state: "closed", state_reason: "completed" });
    say(`${site.label}：開了完成紀錄 ${issue.html_url}（已關閉）`);
  }
  if (decision.action === "alert" && !alerts.length && !done) {
    const fix = Number.isFinite(open.at)
      ? "排程已經停手、不會再推。請到 Vercel（https://vercel.com/clarkhers-projects/maplestory-tool）→ Deployments 看最新的 Production 部署有沒有失敗，按 Redeploy 重建一次；合任何一個 PR 進 main 也會重建。標示本身照時間收，不受影響。"
      : "src/lib/release.ts 的 V002_OPEN_DATE／V002_OPEN_TIME 寫壞了（V002_OPEN_TIME 要是 \"14:00\" 這種兩位數的時間），修好合進 main，排程下一輪就會照新時間跑。";
    const body = [`${decision.reason}。開機前建置的首頁還畫著 V002 橫幅的話，直接打開首頁會先閃一下才收。`, "", `怎麼處理：${fix}`, "", ...facts].join("\n");
    const issue = await github("POST", `/repos/${REPO}/issues`, { title: ALERT_TITLE, body });
    say(`${site.label}：開了 issue 叫人 ${issue.html_url}`);
  }
}

async function beanfun(route, referer, body) {
  const response = await fetch(`${BULLETIN_API}/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, Referer: referer },
    body,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!response.ok) throw new Error(`官方公告 ${route} HTTP ${response.status}`);
  return (await response.json())?.data?.myDataSet?.table;
}

/** 要讀的公告裡（pickNotices），最新一則寫了那天維護時間的（開始時間要早於網站設定的開機時刻 current） */
async function findNotice(date, current) {
  const table = await beanfun("FindBulletin", "https://maplestoryclassic.beanfun.com/bulletin", JSON.stringify({ pageSize: 30, kind: 0, page: 1, method: 6 }));
  for (const row of pickNotices(Array.isArray(table) ? table : table ? [table] : [], date)) {
    const url = `https://maplestoryclassic.beanfun.com/bulletin?Bid=${row.bullentinId}`;
    const html = (await beanfun(`BulletinDetail?pbid=${row.bullentinId}`, url, "{}"))?.content ?? "";
    const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
    const hit = parseMaintenance(text, date, current);
    if (hit) return { ...hit, title: row.title, url };
  }
  return null;
}

/** 開一個只改 V002_OPEN_TIME 那一行的 PR 到 main。同一個時間開過（不管開著或被關掉）就不再開；上次做到一半就補完 */
async function proposeOpenTime(open, time, notice) {
  const branch = `bot/v002-open-time-${time.replace(":", "")}`;
  const owner = REPO.split("/")[0];
  const prs = (await github("GET", `/repos/${REPO}/pulls?head=${owner}:${branch}&state=all`)) ?? [];
  if (prs.length) return `改成 ${time} 的 PR 開過了：${prs[0].html_url}（${prs[0].state === "open" ? "等確認合併" : "已關閉，不再開"}）`;
  // 先用 main 算好改完的檔案：找不到那一行就在這裡報錯，什麼都還沒建
  const next = setOpenTime(decode((await github("GET", `/repos/${REPO}/contents/src/lib/release.ts?ref=main`)).content), time);
  if (!(await github("GET", `/repos/${REPO}/git/ref/heads/${branch}`))) {
    const base = (await github("GET", `/repos/${REPO}/git/ref/heads/main`)).object.sha;
    await github("POST", `/repos/${REPO}/git/refs`, { ref: `refs/heads/${branch}`, sha: base });
  }
  const file = await github("GET", `/repos/${REPO}/contents/src/lib/release.ts?ref=${branch}`);
  if (decode(file.content) !== next) {
    await github("PUT", `/repos/${REPO}/contents/src/lib/release.ts`, {
      message: `V002 開機時間照官方公告改成 ${time}`,
      content: Buffer.from(next).toString("base64"),
      sha: file.sha,
      branch,
    });
  }
  const body = [
    `官方維護公告寫 ${open.date} 維護到 ${time}，網站現在設 ${open.time}。`,
    `公告：${notice.title} ${notice.url}`,
    `公告原文那一段：「${notice.excerpt}」`,
    "",
    "請先點公告確認時間讀對了再合併。這個 PR 只改 src/lib/release.ts 的 V002_OPEN_TIME 一行。合併後：",
    `- 正式機的「10/15 開放」標示跟首頁橫幅改到 ${time} 才收`,
    "- 開機後自動重新部署也跟著這個時間（排程每次都讀 main 的 release.ts）",
    `不合併就照原本 ${open.time} 收。測試機（dev）不會跟著改。`,
    "",
    "這個 PR 是排程 .github/workflows/v002-open.yml 自動開的。",
  ].join("\n");
  const pr = await github("POST", `/repos/${REPO}/pulls`, { title: `V002 開機時間照官方公告改成 ${time}（請確認後合併）`, head: branch, base: "main", body });
  return `開了 PR：${pr.html_url}`;
}

async function watchNotice({ now, open, write }) {
  if (!open || !Number.isFinite(open.at)) return say("公告：main 的 release.ts 讀不到開機時刻，不看公告");
  if (now >= open.at) return say(`公告：已經過了網站設定的開機時刻 ${open.time}，不再看公告`);
  const notice = await findNotice(open.date, open.time);
  const decision = decideOpenTime({ now, date: open.date, current: open.time, announced: notice?.end ?? null });
  say(`公告：${decision.reason}${notice ? `（${notice.title} ${notice.url}，原文「${notice.excerpt}」）` : ""}`);
  if (decision.action !== "pr") return;
  say(write ? `公告：${await proposeOpenTime(open, decision.time, notice)}` : `公告：會開 PR 把開機時刻改成 ${decision.time}（只看不做）`);
}

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const pretend = option("now") || process.env.PRETEND_NOW || "";
  const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "true";
  const { now, only, canWrite, watchWrite } = checkArgs({ dryRun, pretend, only: option("only") || process.env.ONLY || "all", token: TOKEN });
  say(`現在 ${fmt(now)}（台灣時間）${pretend ? "，演練：假裝的時間" : ""}${dryRun ? "，只看不做" : ""}`);

  let failed = false;
  let mainOpen = null;
  for (const site of SITES) {
    const selected = only === "all" || only === site.key;
    // main 的開機時刻看公告也要用，沒選 main 也照讀；沒選的測試機就不讀
    if (!selected && site.key !== "main") continue;
    try {
      const open = parseOpenAt(await releaseSource(site.key));
      if (site.key === "main") mainOpen = open;
      if (!selected) continue;
      const late = open && Number.isFinite(open.at) && now >= open.at + DELAY && now < open.at + EXPIRE;
      const banner = late ? await readBanner(site.url) : null;
      const pushes = late ? await redeploysSince(site.key, open.at) : [];
      const decision = decideRedeploy({ now, openAt: open?.at ?? null, banner, pushes: pushes.map(push => push.at) });
      say(`${site.label}：開機 ${open ? `${open.date} ${open.time}` : "（讀不到）"}，${decision.reason}`);
      if (decision.action === "deploy") {
        say(canWrite(site.key) ? `${site.label}：推了重建 commit ${(await pushEmptyCommit(site.key, site.label)).slice(0, 7)}` : `${site.label}：會推重建 commit（只看不做）`);
      }
      if (site.key === "main" && open && (decision.action === "done" || decision.action === "alert")) {
        if (canWrite(site.key)) await report(decision, { open, now, pushes, site });
        else say(`${site.label}：會${decision.action === "done" ? "開完成紀錄" : "開 issue 叫人"}（只看不做）`);
      }
    } catch (error) {
      if (selected) failed = true;
      say(`${site.label}：出錯 ${error.message}`);
    }
  }

  // 公告放在重新部署後面：官方網站開機當天可能很慢，不能耽誤重新部署
  try {
    await watchNotice({ now, open: mainOpen, write: watchWrite });
  } catch (error) {
    warn(`公告：讀官方公告失敗（不影響重新部署）：${error.message}`);
  }

  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## V002 開機後重新部署\n\n${lines.map(line => `- ${line}`).join("\n")}\n`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
