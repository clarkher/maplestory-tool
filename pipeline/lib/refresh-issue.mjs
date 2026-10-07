/**
 * 資料自動更新（.github/workflows/data-refresh.yml）失敗通知的內容與判斷。
 * 這裡只有不碰網路的部分；打 GitHub API 的在 pipeline/notify-refresh.mjs。
 */

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?/;
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const MARKER = /^##\[[a-z]+\]/;
const STEP_START = "##[group]Run ";
const PROCESS_FAILED = /^##\[error\]Process completed with exit code \d+/;
// 失敗那一步之後的收尾：post 步驟、清理程序
const AFTER_STEPS = ["Post job cleanup.", "Cleaning up orphan processes"];

/**
 * 從 job 的整份 log（API 下載的純文字）抓出失敗那一步的輸出，回傳最後幾行。
 *
 * log 每行前面有時間戳，每一步以「##[group]Run 指令」開頭、接著一段顯示指令的 group，
 * run 步驟失敗時最後一行是「##[error]Process completed with exit code N.」；
 * action 步驟（checkout 之類）失敗則只有「##[error]訊息」。
 * 回傳的行已去掉時間戳、顏色碼與 ##[...] 標記，進度條（同一行只差百分比）只留最後一行。
 * log 裡沒有錯誤就回空陣列。
 */
export function errorTail(log, { maxLines = 30, maxLineLength = 300 } = {}) {
  const lines = log.replace(/^﻿/, "").split(/\r?\n/).map(line => line.replace(TIMESTAMP, "").replace(ANSI, ""));

  const firstError = lines.findIndex(line => line.startsWith("##[error]"));
  if (firstError === -1) return [];

  // 往回找這一步的開頭，跳過顯示指令的那段 group
  let start = lastIndexOf(lines, line => line.startsWith(STEP_START), firstError);
  if (start === -1) {
    start = 0;
  } else {
    const headerEnd = lines.indexOf("##[endgroup]", start);
    start = headerEnd !== -1 && headerEnd < firstError ? headerEnd + 1 : start + 1;
  }

  // 往後找這一步的結尾：run 步驟到 Process completed 那行（不含），action 步驟到最後一個錯誤（含）
  let end = firstError + 1;
  for (let i = firstError; i < lines.length; i += 1) {
    const line = lines[i];
    if (i > firstError && (line.startsWith(STEP_START) || AFTER_STEPS.includes(line))) break;
    if (PROCESS_FAILED.test(line)) {
      end = i;
      break;
    }
    if (line.startsWith("##[error]")) end = i + 1;
  }

  const body = [];
  for (const raw of lines.slice(start, end)) {
    if (raw === "##[endgroup]") continue;
    const line = raw.replace(MARKER, "");
    const previous = body.at(-1);
    if (previous !== undefined && isProgress(previous) && isProgress(line) && progressKey(previous) === progressKey(line)) {
      body[body.length - 1] = line;
    } else {
      body.push(line);
    }
  }

  return trimBlank(trimBlank(body).slice(-maxLines)).map(line =>
    line.length > maxLineLength ? line.slice(0, maxLineLength) + "…" : line,
  );
}

function lastIndexOf(lines, predicate, before) {
  for (let i = before - 1; i >= 0; i -= 1) if (predicate(lines[i])) return i;
  return -1;
}

function isProgress(line) {
  return /\d+%/.test(line);
}

function progressKey(line) {
  return line.replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
}

function trimBlank(lines) {
  let from = 0;
  let to = lines.length;
  while (from < to && lines[from].trim() === "") from += 1;
  while (to > from && lines[to - 1].trim() === "") to -= 1;
  return lines.slice(from, to);
}

/** jobs API 回的 job → 第一個失敗的步驟名（Actions 頁面上看到的那個）；沒有就 null。 */
export function failedStepName(job) {
  return job?.steps?.find(step => step.conclusion === "failure")?.name ?? null;
}

/**
 * refresh job 的結果＋有沒有開著的 issue → 要做什麼。
 * 只有 failure 才通知；cancelled（手動取消、GitHub 沒派到機器）下一輪自己會再跑，不吵人。
 */
export function planAction(result, hasOpenIssue) {
  if (result === "failure") return hasOpenIssue ? "comment" : "create";
  if (result === "success" && hasOpenIssue) return "close";
  return "none";
}

/** 去重用固定的 label 與標題；dry-run 用另一組，測試不會碰到真的那張。 */
export function issueKeys(dryRun) {
  return dryRun
    ? { label: "資料更新失敗-測試", title: "（測試）資料自動更新失敗" }
    : { label: "資料更新失敗", title: "資料自動更新失敗" };
}

const DRY_RUN_NOTE = "這是 dry-run 測試（手動觸發，不開 PR、不合併）。";

/**
 * 失敗時的 issue 內容；repeat = 在已經開著的那張底下留言（開頭不同，不再重講之後會怎樣）。
 * tail 是 errorTail() 的結果，抓不到時改寫 tailNote（原因）。
 */
export function failureBody({ stepName, upstreamStamp, siteStamp, runUrl, tail = [], tailNote, dryRun = false, repeat = false }) {
  const lines = dryRun ? [DRY_RUN_NOTE, ""] : [];
  lines.push(
    repeat ? "又失敗一次，網站資料還停在原本那一版。" : "資料自動更新沒有跑完，網站資料停在原本那一版。",
    "",
    `- 失敗的步驟：${stepName ?? "（沒有哪一步標成失敗，可能是逾時或執行的機器出問題）"}`,
    `- 上游版本：${upstreamStamp ? `\`${upstreamStamp}\`` : "（沒取到：在讀到上游版本之前就失敗了）"}`,
    `- 網站目前的資料版本：${siteStamp ? `\`${siteStamp}\`` : "（沒取到）"}`,
    `- 執行紀錄：${runUrl}`,
    "",
  );
  if (tail.length > 0) {
    const fence = fenceFor(tail);
    lines.push(`錯誤訊息（最後 ${tail.length} 行）：`, "", fence, ...tail, fence);
  } else {
    lines.push(`錯誤訊息：${tailNote ?? "log 裡找不到錯誤訊息"}，請點上面的執行紀錄看。`);
  }
  if (!repeat) {
    lines.push(
      "",
      "之後再失敗會留言在這張，不會另開新的；修好後下一次更新成功，會自動留言並關掉這張。怎麼處理見 README「自動更新」。",
    );
  }
  return lines.join("\n");
}

/** 成功時關掉 issue 前留的那則。 */
export function recoveredBody({ upstreamStamp, runUrl, dryRun = false }) {
  const lines = dryRun ? [DRY_RUN_NOTE, ""] : [];
  lines.push(
    "恢復了：這次資料自動更新成功，自動關掉這張。",
    "",
    `- 上游版本：${upstreamStamp ? `\`${upstreamStamp}\`` : "（沒取到）"}`,
    `- 執行紀錄：${runUrl}`,
  );
  return lines.join("\n");
}

/** 程式碼區塊的外框要比內容裡最長的一串 ` 還長，才不會被內容提早結束。 */
function fenceFor(lines) {
  const longest = Math.max(0, ...lines.flatMap(line => (line.match(/`+/g) ?? []).map(run => run.length)));
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * notify job 的主流程：refresh 失敗就開 issue／在開著的那張留言，成功就留言並關掉。
 *
 * ctx：{ result（refresh job 的結果）, dryRun, upstreamStamp, siteStamp, runUrl, assignee }
 * github：打 GitHub API 的動作（pipeline/notify-refresh.mjs 給真的，測試給假的）——
 *   findOpenIssue(label)、refreshJob()、jobLog(jobId)、ensureLabel(label)、
 *   createIssue({ title, body, label, assignee })、comment(number, body)、close(number)
 * 回傳 { action: "create" | "comment" | "close" | "none", issue? }
 */
export async function notifyRefresh(ctx, github) {
  if (ctx.result !== "failure" && ctx.result !== "success") return { action: "none" };
  const { label, title } = issueKeys(ctx.dryRun);
  const open = await github.findOpenIssue(label);
  const action = planAction(ctx.result, Boolean(open));

  if (action === "close") {
    await github.comment(open.number, recoveredBody(ctx));
    await github.close(open.number);
    return { action, issue: open };
  }
  if (action === "none") return { action };

  const body = failureBody({ ...ctx, ...(await failureDetails(github)), repeat: action === "comment" });
  if (action === "comment") {
    await github.comment(open.number, body);
    return { action, issue: open };
  }
  await github.ensureLabel(label);
  const issue = await github.createIssue({ title, body, label, assignee: ctx.assignee });
  return { action, issue };
}

/** 失敗的步驟名＋錯誤最後幾行；API 讀不到也照樣回內容，通知本身不能因此開不出來。 */
async function failureDetails(github) {
  let job;
  try {
    job = await github.refreshJob();
  } catch (error) {
    return { stepName: `（讀不到：${error.message}）`, tail: [], tailNote: "讀不到這次執行的步驟" };
  }
  const stepName = failedStepName(job);
  try {
    const tail = errorTail(await github.jobLog(job.id));
    return { stepName, tail, tailNote: tail.length > 0 ? undefined : "log 裡找不到錯誤訊息" };
  } catch (error) {
    return { stepName, tail: [], tailNote: `抓不到 log（${error.message}）` };
  }
}
