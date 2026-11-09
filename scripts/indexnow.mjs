/**
 * IndexNow：把正式機的網址一次通知 Bing（ChatGPT 查網路主要靠 Bing）等搜尋引擎，不用等它們自己來爬（v1.90）。
 *
 * 用法：
 *   node scripts/indexnow.mjs --dry-run
 *       讀正式機的 https://maplehelper.tw/sitemap.xml，只印筆數、分幾批、金鑰檔狀態，不送出。
 *   node scripts/indexnow.mjs --dry-run --sitemap out/sitemap.xml
 *       改讀本機建置產出的 sitemap（npm run build:cf 之後才有）。也可以給網址。
 *   node scripts/indexnow.mjs --wait-deploy <commit sha>
 *       GitHub Actions 用（.github/workflows/indexnow.yml，main 有新 commit 時）：
 *       先等那顆 commit 的 check-run「Workers Builds: maplehelper」成功（正式機部署完），
 *       再確認 https://maplehelper.tw/<金鑰>.txt 回 200 而且內容對，最後讀正式機 sitemap 送出。
 *       要環境變數 GITHUB_TOKEN（讀 check-runs）、GITHUB_REPOSITORY（預設 clarkher/maplestory-tool）。
 *   node scripts/indexnow.mjs
 *       不等部署，直接檢查金鑰檔後送出（手動補送用）。
 *
 * 規則：
 *   - 只送 maplehelper.tw 的網址（sitemap 裡別的網域一律丟掉；一筆都不剩就失敗），測試機不送。
 *   - 一次最多 10,000 筆（IndexNow 上限），超過分批。回 200／202 算成功，其他（403 金鑰不對、422、429…）失敗。
 *   - 金鑰在 scripts/indexnow-key.mjs，檔案在 public/<金鑰>.txt。金鑰檔還沒上正式機時送出會被拒（403），所以送之前一定先檢查。
 *   - 每次送整份 sitemap（11/09 正式機 3,635 筆）：搜尋引擎自己會略過沒變的頁，main 一天只合幾次，不會太多。
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { INDEXNOW_HOST, INDEXNOW_KEY } from "./indexnow-key.mjs";

export const ENDPOINT = "https://api.indexnow.org/indexnow";
export const BATCH = 10_000;
export const SITE = `https://${INDEXNOW_HOST}`;
export const KEY_LOCATION = `${SITE}/${INDEXNOW_KEY}.txt`;
export const DEPLOY_CHECK = "Workers Builds: maplehelper";

/** sitemap 文字 → <loc> 網址（把 &amp; 這類還原）。sitemap index 的子 sitemap 也是 <loc>，由呼叫的人分辨 */
export function parseLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(m =>
    m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
  );
}

/** 只留正式網域（https、host 完全相同）的網址，去重 */
export function keepOwnUrls(urls, host = INDEXNOW_HOST) {
  const out = new Set();
  for (const raw of urls) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (url.protocol === "https:" && url.host === host) out.add(url.href);
  }
  return [...out];
}

export function chunk(list, size = BATCH) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** 送給 IndexNow 的 JSON */
export function payload(urlList) {
  return { host: INDEXNOW_HOST, key: INDEXNOW_KEY, keyLocation: KEY_LOCATION, urlList };
}

const sleeper = ms => new Promise(resolve => setTimeout(resolve, ms));

/** 讀 sitemap（網址或本機檔），sitemap index 會再往下讀一層 */
export async function readSitemap(source, { fetch = globalThis.fetch } = {}) {
  const load = async src => {
    if (/^https?:\/\//.test(src)) {
      const res = await fetch(src, { headers: { "User-Agent": "maplehelper-indexnow" } });
      if (!res.ok) throw new Error(`讀不到 sitemap ${src}：HTTP ${res.status}`);
      return res.text();
    }
    return readFileSync(src, "utf8");
  };
  const xml = await load(source);
  if (!/<sitemapindex[\s>]/.test(xml)) return parseLocs(xml);
  const all = [];
  for (const child of parseLocs(xml)) all.push(...parseLocs(await load(child)));
  return all;
}

/** 正式機的金鑰檔：回 200 而且內容就是金鑰才算好 */
export async function keyFileOk({ fetch = globalThis.fetch } = {}) {
  try {
    const res = await fetch(`${KEY_LOCATION}?t=${Date.now()}`, { headers: { "Cache-Control": "no-cache" } });
    const body = res.ok ? (await res.text()).trim() : "";
    return { ok: res.ok && body === INDEXNOW_KEY, status: res.status };
  } catch (error) {
    return { ok: false, status: 0, error: String(error) };
  }
}

/**
 * 等那顆 commit 的正式機部署（Cloudflare Workers Builds 的 check-run）結束。
 * 成功回 true；失敗、取消丟錯；等到 timeoutMs 還沒結束也丟錯。
 */
export async function waitForDeploy({ sha, repo, token, fetch = globalThis.fetch, sleep = sleeper, intervalMs = 30_000, timeoutMs = 25 * 60_000, log = console.log }) {
  if (!/^[0-9a-f]{7,40}$/.test(sha ?? "")) throw new Error(`commit sha 格式不對：${sha}`);
  const url = `https://api.github.com/repos/${repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(DEPLOY_CHECK)}`;
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "maplehelper-indexnow", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  for (let waited = 0; ; waited += intervalMs) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`讀不到 check-runs：HTTP ${res.status}`);
    const runs = (await res.json()).check_runs ?? [];
    // 同一顆 commit 可能重建好幾次，看最新那次
    const run = runs.sort((a, b) => String(b.started_at ?? "").localeCompare(String(a.started_at ?? "")))[0];
    if (run?.status === "completed") {
      if (run.conclusion === "success") return true;
      throw new Error(`正式機部署沒成功（${DEPLOY_CHECK}：${run.conclusion}），不送`);
    }
    if (waited >= timeoutMs) throw new Error(`等了 ${Math.round(waited / 60_000)} 分鐘正式機部署還沒結束（${run ? run.status : "還沒出現"}），不送`);
    log(`等正式機部署（${run ? run.status : "還沒出現"}），${Math.round(intervalMs / 1000)} 秒後再看`);
    await sleep(intervalMs);
  }
}

/** 等金鑰檔回 200（部署剛好、快取還沒換掉時重試幾次） */
export async function waitForKeyFile({ fetch = globalThis.fetch, sleep = sleeper, tries = 10, intervalMs = 30_000, log = console.log } = {}) {
  let last;
  for (let i = 1; i <= tries; i++) {
    last = await keyFileOk({ fetch });
    if (last.ok) return last;
    if (i < tries) {
      log(`金鑰檔還沒好（HTTP ${last.status}），${Math.round(intervalMs / 1000)} 秒後再試（${i}/${tries}）`);
      await sleep(intervalMs);
    }
  }
  throw new Error(`正式機的金鑰檔 ${KEY_LOCATION} 不是 200 或內容不對（HTTP ${last.status}），不送`);
}

/** 分批 POST；dryRun 時一筆都不送 */
export async function submit(urls, { dryRun, fetch = globalThis.fetch, log = console.log }) {
  const batches = chunk(urls);
  if (dryRun) return { sent: 0, batches: batches.length };
  let sent = 0;
  for (const [i, list] of batches.entries()) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload(list)),
    });
    if (res.status !== 200 && res.status !== 202) {
      const text = await res.text().catch(() => "");
      throw new Error(`IndexNow 第 ${i + 1} 批回 HTTP ${res.status}：${text.slice(0, 300)}`);
    }
    sent += list.length;
    log(`第 ${i + 1}/${batches.length} 批 ${list.length} 筆：HTTP ${res.status}`);
  }
  return { sent, batches: batches.length };
}

export function parseArgs(argv) {
  const args = { dryRun: false, sitemap: `${SITE}/sitemap.xml`, waitDeploy: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--sitemap") args.sitemap = argv[++i];
    else if (a === "--wait-deploy") args.waitDeploy = argv[++i];
    else throw new Error(`看不懂的參數：${a}`);
  }
  if (!args.sitemap) throw new Error("--sitemap 後面要給路徑或網址");
  if (args.waitDeploy !== null && !args.waitDeploy) throw new Error("--wait-deploy 後面要給 commit sha");
  return args;
}

export async function main(argv, { env = process.env, fetch = globalThis.fetch, sleep = sleeper, log = console.log } = {}) {
  const args = parseArgs(argv);
  if (args.waitDeploy) {
    await waitForDeploy({ sha: args.waitDeploy, repo: env.GITHUB_REPOSITORY || "clarkher/maplestory-tool", token: env.GITHUB_TOKEN, fetch, sleep, log });
    log("正式機部署成功");
  }
  const all = await readSitemap(args.sitemap, { fetch });
  const urls = keepOwnUrls(all);
  if (!urls.length) throw new Error(`sitemap ${args.sitemap} 裡沒有 ${INDEXNOW_HOST} 的網址，不送`);
  if (all.length !== urls.length) log(`丟掉 ${all.length - urls.length} 筆不是 ${INDEXNOW_HOST} 的網址或重複`);
  if (args.dryRun) {
    const key = await keyFileOk({ fetch });
    const { batches } = await submit(urls, { dryRun: true, fetch, log });
    log(`[dry-run] ${urls.length} 筆網址、${batches} 批，不送出。正式機金鑰檔 HTTP ${key.status}${key.ok ? "（內容正確）" : "（還沒上正式機或內容不對，真送會被拒）"}`);
    log(`[dry-run] 前三筆：${urls.slice(0, 3).join("、")}`);
    return { count: urls.length, batches, sent: 0 };
  }
  await waitForKeyFile({ fetch, sleep, log });
  const result = await submit(urls, { dryRun: false, fetch, log });
  log(`已通知 IndexNow：${result.sent} 筆、${result.batches} 批`);
  return { count: urls.length, ...result };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
