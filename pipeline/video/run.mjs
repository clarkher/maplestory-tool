/**
 * announce-video.yml：官網新公告自動做快報片（正片 16:9＋Shorts 9:16），放 GitHub prerelease（tag video-<id>），
 * 在追蹤 issue（label「官方公告」）留言請使用者審。做完／失敗次數記在 issue 內文 <!-- video:... -->。
 * 用法：node pipeline/video/run.mjs
 * 環境變數：GH_TOKEN（contents、issues: write）、GITHUB_REPOSITORY、AZURE_OPENAI_KEY、INWORLD_API_KEY、
 *   VIDEO_OUT（產物資料夾，預設暫存資料夾底下）；
 *   YT_CLIENT_ID／YT_CLIENT_SECRET／YT_REFRESH_TOKEN（有就把正片＋Shorts 公開上傳到楓谷幫手頻道，失敗不擋 release）；
 *   DRY_RUN=true 只印要做哪幾則；BULLETIN_ID=<id> 只做那一則＋建 release，不留言、不改 issue（手動測試用）。
 * 每則最多試 3 次（第 3 次還失敗才留言說原因）；「只有標題」這種再試也沒用的錯一次就記滿 3 次。
 */
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fetchBulletins as realFetchBulletins } from "../announce/lib/bulletin.mjs";
import { pendingVideos, readVideoState, writeVideoState } from "./lib/pick.mjs";
import { readFile } from "node:fs/promises";
import { youtubeFromEnv, uploadPair as realUploadPair } from "./lib/youtube.mjs";
import { makeCall, releaseExists as realReleaseExists, upsertRelease as realUpsert, renderVideoComment, renderSkipComment } from "./lib/github.mjs";

const LABEL = "官方公告";
const MAX_TRIES = 3;
const QUOTA_STATUS = new Set([401, 403, 429]); // 金鑰失效／額度用完：整班停，不扣每則的次數
const BUDGET_MS = 35 * 60 * 1000; // workflow 上限 60 分，超過 35 分不開新的一則

/** 留言用的失敗原因：前 3 行有字的、最多 500 字（render 失敗會帶一大串 stderr） */
export function shortReason(err) {
  const msg = String(err?.message ?? err ?? "不明錯誤");
  const lines = msg.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 3);
  const t = lines.join(" / ");
  return t.length > 500 ? `${t.slice(0, 499)}…` : t;
}

export async function run({
  env = process.env,
  make,
  upsertRelease = realUpsert,
  releaseExists = realReleaseExists,
  call,
  fetchBulletins = realFetchBulletins,
  now = Date.now(),
  clock = Date.now,
  budgetMs = BUDGET_MS,
  log = console.log,
  uploadPair = realUploadPair,
} = {}) {
  const started = clock();
  const repo = env.GITHUB_REPOSITORY ?? "clarkher/maplestory-tool";
  const dryRun = env.DRY_RUN === "true";
  const outBase = resolve(env.VIDEO_OUT ?? join(tmpdir(), "maplehelper-video-out"));
  call ??= makeCall({ token: env.GH_TOKEN, api: env.GITHUB_API_URL });
  make ??= (await import("./make.mjs")).make;
  const yt = youtubeFromEnv(env);
  // 傳 YouTube（公開）；失敗只記原因，不擋 release 跟留言
  const toYoutube = async (res) => {
    if (!yt) return null;
    try {
      const ytFile = res.files.find((f) => /youtube\.txt$/.test(f));
      const ids = await uploadPair({ files: res.files, ytText: await readFile(ytFile, "utf8"), creds: yt, log });
      log(`YouTube（公開）：正片 ${ids.main}、Shorts ${ids.shorts}`);
      return ids;
    } catch (e) {
      log(`YouTube 上傳失敗（片照樣放 release）：${shortReason(e)}`);
      return { error: shortReason(e) };
    }
  };

  // 手動測試：只做指定那則，不看 pending、不留言、不改 issue 狀態
  if (env.BULLETIN_ID) {
    const id = String(env.BULLETIN_ID).trim();
    if (!/^\d+$/.test(id)) throw new Error(`BULLETIN_ID 要是數字：${id}`);
    const res = await make(id, { out: join(outBase, id) });
    log(`做好 ${id}：${res.title}`);
    if (dryRun) {
      log("[dry-run] 不建 release");
      return;
    }
    const rel = await upsertRelease(id, res.title, res.files, { call, repo });
    log(`release：${rel.htmlUrl}`);
    return;
  }

  const [issue] = await call("GET", `/repos/${repo}/issues?state=open&labels=${encodeURIComponent(LABEL)}&per_page=1`);
  if (!issue) {
    log("沒有追蹤 issue（announce-watch 還沒開），這次不做片");
    return;
  }
  const state = readVideoState(issue.body);
  const rows = await fetchBulletins();
  const todo = pendingVideos(rows, state, now);
  if (!todo.length) {
    log("沒有要做片的公告");
    return;
  }
  log(`要做片 ${todo.length} 則：${todo.map((r) => `${r.bullentinId} ${r.title}`).join("、")}`);
  if (dryRun) {
    log("[dry-run] 不做片、不留言、不改 issue");
    return;
  }

  // 每則做完就存一次（job 被 timeout 殺掉也不會重做已完成的）；announce-watch 可能改過 seen，所以每次先重讀
  const save = async () => {
    const fresh = await call("GET", `/repos/${repo}/issues/${issue.number}`);
    await call("PATCH", `/repos/${repo}/issues/${issue.number}`, { body: writeVideoState(fresh.body, state) });
  };
  const saveSafe = async () => {
    try {
      await save();
    } catch (e) {
      log(`存做片狀態失敗（最後還會再存一次）：${shortReason(e)}`);
    }
  };

  let tried = 0;
  try {
    for (const row of todo) {
      const id = row.bullentinId;
      if (clock() - started > budgetMs) {
        log(`已經跑超過 ${Math.round(budgetMs / 60000)} 分鐘，${id} 留給下一班`);
        break;
      }
      tried++;
      try {
        if (await releaseExists(`video-${id}`, { call, repo })) {
          state.set(id, { n: 0, done: true });
          log(`${id} 已經有發布頁了，不重做`);
          await saveSafe();
          continue;
        }
        const res = await make(id, { out: join(outBase, id) });
        const youtube = await toYoutube(res);
        const release = await upsertRelease(id, res.title, res.files, { call, repo });
        state.set(id, { n: 0, done: true });
        log(`${id} 做好了：${release.htmlUrl}`);
        try {
          await call("POST", `/repos/${repo}/issues/${issue.number}/comments`, { body: renderVideoComment({ title: res.title, row, release, youtube }) });
        } catch (err) {
          log(`${id} 留言失敗（片已放在 release）：${shortReason(err)}`);
        }
        await saveSafe();
      } catch (err) {
        if (QUOTA_STATUS.has(err?.status)) {
          log(`${id} 遇到 HTTP ${err.status}（金鑰或額度問題），整班停下、這則不扣次數：${shortReason(err)}`);
          break;
        }
        const n = err?.permanent ? MAX_TRIES : (state.get(id)?.n ?? 0) + 1;
        const reason = shortReason(err);
        state.set(id, { n, done: false });
        log(`${id} 失敗（第 ${n} 次）：${reason}`);
        if (n >= MAX_TRIES) {
          try {
            await call("POST", `/repos/${repo}/issues/${issue.number}/comments`, { body: renderSkipComment(row, reason) });
          } catch (e) {
            log(`${id} 留言失敗：${shortReason(e)}`);
          }
        }
        await saveSafe();
      }
    }
  } finally {
    if (tried) {
      await save();
      log(`#${issue.number} 記好做片狀態`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await run();
}
