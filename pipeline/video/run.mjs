/**
 * announce-video.yml：官網新公告自動做快報片（正片 16:9＋Shorts 9:16），放 GitHub prerelease（tag video-<id>），
 * 在追蹤 issue（label「官方公告」）留言請使用者審。做完／失敗次數記在 issue 內文 <!-- video:... -->。
 * 用法：node pipeline/video/run.mjs
 * 環境變數：GH_TOKEN（contents、issues: write）、GITHUB_REPOSITORY、AZURE_OPENAI_KEY、INWORLD_API_KEY、
 *   VIDEO_OUT（產物資料夾，預設暫存資料夾底下）；
 *   DRY_RUN=true 只印要做哪幾則；BULLETIN_ID=<id> 只做那一則＋建 release，不留言、不改 issue（手動測試用）。
 * 每則最多試 3 次（第 3 次還失敗才留言說原因）；「只有標題」這種再試也沒用的錯一次就記滿 3 次。
 */
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fetchBulletins as realFetchBulletins } from "../announce/lib/bulletin.mjs";
import { pendingVideos, readVideoState, writeVideoState } from "./lib/pick.mjs";
import { makeCall, upsertRelease as realUpsert, renderVideoComment, renderSkipComment } from "./lib/github.mjs";

const LABEL = "官方公告";
const MAX_TRIES = 3;

export async function run({
  env = process.env,
  make,
  upsertRelease = realUpsert,
  call,
  fetchBulletins = realFetchBulletins,
  now = Date.now(),
  log = console.log,
} = {}) {
  const repo = env.GITHUB_REPOSITORY ?? "clarkher/maplestory-tool";
  const dryRun = env.DRY_RUN === "true";
  const outBase = resolve(env.VIDEO_OUT ?? join(tmpdir(), "maplehelper-video-out"));
  call ??= makeCall({ token: env.GH_TOKEN, api: env.GITHUB_API_URL });
  make ??= (await import("./make.mjs")).make;

  // 手動測試：只做指定那則，不看 pending、不留言、不改 issue 狀態
  if (env.BULLETIN_ID) {
    const id = String(env.BULLETIN_ID).trim();
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

  for (const row of todo) {
    const id = row.bullentinId;
    try {
      const res = await make(id, { out: join(outBase, id) });
      const release = await upsertRelease(id, res.title, res.files, { call, repo });
      await call("POST", `/repos/${repo}/issues/${issue.number}/comments`, { body: renderVideoComment({ title: res.title, row, release }) });
      state.set(id, { n: 0, done: true });
      log(`${id} 做好了：${release.htmlUrl}`);
    } catch (err) {
      const n = err?.permanent ? MAX_TRIES : (state.get(id)?.n ?? 0) + 1;
      state.set(id, { n, done: false });
      log(`${id} 失敗（第 ${n} 次）：${err?.message ?? err}`);
      if (n >= MAX_TRIES) {
        await call("POST", `/repos/${repo}/issues/${issue.number}/comments`, { body: renderSkipComment(row, err?.message ?? String(err)) });
      }
    }
  }

  // announce-watch 可能在做片這段時間改過 seen，PATCH 前重讀最新內文
  const fresh = await call("GET", `/repos/${repo}/issues/${issue.number}`);
  await call("PATCH", `/repos/${repo}/issues/${issue.number}`, { body: writeVideoState(fresh.body, state) });
  log(`#${issue.number} 記好做片狀態`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await run();
}
