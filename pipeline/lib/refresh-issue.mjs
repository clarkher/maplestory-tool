/**
 * 資料自動更新（.github/workflows/data-refresh.yml）失敗通知的內容與判斷。
 * 這裡只有不碰網路的部分；打 GitHub API 的在 pipeline/notify-refresh.mjs。
 */

const BOM = String.fromCharCode(0xfeff);
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?/;
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const MARKER = /^##\[[a-z]+\]/;
const STEP_START = "##[group]Run ";
const PROCESS_FAILED = /^##\[error\]Process completed with exit code \d+/;
// 失敗那一步之後的收尾：post 步驟、清理程序
const AFTER_STEPS = ["Post job cleanup.", "Cleaning up orphan processes"];
// git 的進度條「Updating files:  82% (13354/16277)」，括號前的名稱一樣的連續幾行只留最後一行
const GIT_PROGRESS = /^([^:]+):\s+\d{1,3}% \(\d+\/\d+\)/;

/**
 * 從 job 的整份 log（API 下載的純文字）抓出失敗那一步的輸出，回傳最後幾行。
 *
 * log 每行前面有時間戳，每一步以「##[group]Run 指令」開頭、接著一段顯示指令的 group。
 * 失敗那一步的結尾（都只看收尾 Post job cleanup. 之前，收尾步驟自己的錯誤不算）：
 * run 步驟是最後一個「##[error]Process completed with exit code N.」（不含）；
 * action 步驟（checkout 之類）失敗、或跑超過時間上限被中止（最後一行是 The operation was canceled.），
 * 則是最後一個「##[error]」（含）。前面成功的步驟自己印的 ##[error] 標註不會被當成失敗點。
 * 回傳的行已去掉時間戳、顏色碼與 ##[...] 標記，git 進度條只留最後一行。log 裡沒有錯誤就回空陣列。
 */
export function errorTail(log, { maxLines = 30, maxLineLength = 300 } = {}) {
  const text = log.startsWith(BOM) ? log.slice(1) : log;
  const lines = text.split(/\r?\n/).map(line => line.replace(TIMESTAMP, "").replace(ANSI, ""));

  const cleanup = lines.findIndex(line => AFTER_STEPS.includes(line));
  const limit = cleanup === -1 ? lines.length : cleanup;
  let end = lastIndexOf(lines, line => PROCESS_FAILED.test(line), limit);
  if (end === -1) {
    const lastError = lastIndexOf(lines, line => line.startsWith("##[error]"), limit);
    if (lastError === -1) return [];
    end = lastError + 1;
  }

  // 往回找這一步的開頭，跳過顯示指令的那段 group
  let start = lastIndexOf(lines, line => line.startsWith(STEP_START), end);
  if (start === -1) {
    start = 0;
  } else {
    const headerEnd = lines.indexOf("##[endgroup]", start);
    start = headerEnd !== -1 && headerEnd < end ? headerEnd + 1 : start + 1;
  }

  const body = [];
  for (const raw of lines.slice(start, end)) {
    if (raw === "##[endgroup]") continue;
    const line = raw.replace(MARKER, "");
    const progress = line.match(GIT_PROGRESS)?.[1];
    if (progress !== undefined && body.at(-1)?.match(GIT_PROGRESS)?.[1] === progress) {
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

function trimBlank(lines) {
  let from = 0;
  let to = lines.length;
  while (from < to && lines[from].trim() === "") from += 1;
  while (to > from && lines[to - 1].trim() === "") to -= 1;
  return lines.slice(from, to);
}

/** 主要步驟：不含收尾（Post Run …）與 Complete job——只有收尾卡住時，資料更新本身其實已經跑完了。 */
function mainSteps(job) {
  return (job?.steps ?? []).filter(step => !/^Post /.test(step.name ?? "") && step.name !== "Complete job");
}

/**
 * jobs API 回的 job → 失敗的步驟名（Actions 頁面上看到的那個）。
 * 跑超過時間上限被中止時沒有哪一步是 failure，當時在跑的主要步驟是 cancelled，回那一步並註明。都沒有就 null。
 */
export function failedStepName(job) {
  const failed = (job?.steps ?? []).find(step => step.conclusion === "failure");
  if (failed) return failed.name;
  const stopped = mainSteps(job).find(step => step.conclusion === "cancelled");
  return stopped ? `${stopped.name}（被中止，多半是跑超過時間上限）` : null;
}

/** job 被中止時有哪一個主要步驟跑到一半（跑超過時間上限）；一步都沒跑（GitHub 沒派到機器）、或只有收尾被中止就不算。 */
function wasStopped(job) {
  return mainSteps(job).some(step => step.conclusion === "cancelled");
}

/**
 * refresh job 的結果＋有沒有開著的 issue → 要做什麼。
 * cancelled 一律不動；跑超過時間上限的那種 cancelled，notifyRefresh 會先看步驟、改成 failure 再問。
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
 * 失敗時的 issue 內容（含「最後一次失敗」那行與藏著的註解，之後同樣的失敗只換這兩處）；
 * repeat = 失敗有變、在已經開著的那張底下留言（開頭寫連續第幾次，不帶那一行與註解）。
 * tail 是 errorTail() 的結果，抓不到時改寫 tailNote（原因）。at 是 taipeiTime()。
 */
export function failureBody({ stepName, upstreamStamp, siteStamp, runUrl, readmeUrl, tail = [], tailNote, dryRun = false, repeat = false, count = 1, at }) {
  const lines = dryRun ? [DRY_RUN_NOTE, ""] : [];
  if (repeat) {
    lines.push(`又失敗了（連續第 ${count} 次），這次失敗的步驟或上游版本跟上次不同；網站資料還停在原本那一版。`);
  } else {
    lines.push("資料自動更新沒有跑完，網站資料停在原本那一版。", statusLine({ stepName, count, at, runUrl }));
  }
  lines.push(
    "",
    `- 失敗的步驟：${stepName ?? "（沒有哪一步標成失敗，可能是執行的機器出問題）"}`,
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
    const readme = readmeUrl ? `[README「自動更新」](${readmeUrl})` : "README「自動更新」";
    lines.push(
      "",
      "之後同樣的失敗只會更新上面「最後一次失敗」那行，不另外通知；失敗的步驟或上游版本變了，才會在這裡留言。" +
        `修好後下一次更新成功，會自動留言並關掉這張。怎麼處理見 ${readme}。`,
      failureMark({ stepName, upstreamStamp, count }),
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
 * notify job 的主流程：refresh 失敗就開 issue（已經有開著的就更新那張），成功就留言並關掉。
 * 已經有開著的時候，同樣的失敗（同一步、同一個上游版本）只改內文的「最後一次失敗」那行——改內文不發通知，
 * 排程一天兩次壞著不修才不會每 12 小時吵一次；失敗的步驟或上游版本變了才留言（會通知）。
 *
 * ctx：{ result（refresh job 的結果）, dryRun, upstreamStamp, siteStamp, runUrl, readmeUrl, assignee, now }
 * github：打 GitHub API 的動作（pipeline/notify-refresh.mjs 給真的，測試給假的）——
 *   findOpenIssue(label)、refreshJob()、jobLog(jobId)、ensureLabel(label)、
 *   createIssue({ title, body, label, assignee })、comment(number, body)、updateIssue(number, body)、close(number)
 * 回傳 { action: "create" | "comment" | "update" | "close" | "none", issue? }
 */
export async function notifyRefresh(ctx, github) {
  let result = ctx.result;
  let job;
  if (result === "cancelled") {
    // 跑超過時間上限也是 cancelled（10/07 實測）：有哪一步被中止就當失敗；一步都沒跑是 GitHub 沒派到機器，下一輪會再跑。
    // 手動取消整個執行時 notify 根本不會跑（workflow 的 if: !cancelled()），不會走到這裡
    job = await github.refreshJob().catch(error => {
      console.warn(`refresh 被取消，但讀不到它的步驟，當成不用通知：${error.message}`);
      return null;
    });
    if (!wasStopped(job)) return { action: "none" };
    result = "failure";
  }
  if (result !== "failure" && result !== "success") return { action: "none" };
  const { label, title } = issueKeys(ctx.dryRun);
  const open = await github.findOpenIssue(label);
  const action = planAction(result, Boolean(open));

  if (action === "close") {
    await github.comment(open.number, recoveredBody(ctx));
    await github.close(open.number);
    return { action, issue: open };
  }
  if (action === "none") return { action };

  const failure = { ...ctx, ...(await failureDetails(github, job)), at: taipeiTime(ctx.now ?? new Date()) };
  if (action === "create") {
    await github.ensureLabel(label);
    const issue = await github.createIssue({ title, body: failureBody(failure), label, assignee: ctx.assignee });
    return { action, issue };
  }

  const previous = readFailureMark(open.body);
  const same = previous !== null && previous.step === (failure.stepName ?? null) && previous.upstream === (failure.upstreamStamp || "");
  // 藏著的註解被人改掉時，次數改從「最後一次失敗」那行接著算
  const count = (Number.isInteger(previous?.count) ? previous.count : (countInStatus(open.body) ?? 1)) + 1;
  // 先留言再改內文：改內文失敗頂多下次再留一次，反過來會漏掉通知
  if (!same) await github.comment(open.number, failureBody({ ...failure, repeat: true, count }));
  await github.updateIssue(open.number, markFailure(open.body ?? "", { ...failure, count }));
  return { action: same ? "update" : "comment", issue: open };
}

/**
 * 失敗的步驟名＋錯誤最後幾行＋失敗那個 job 的網址（點了直接看到那段 log）；
 * job 已經讀過就不再讀。API 讀不到也照樣回內容，通知本身不能因此開不出來。
 */
async function failureDetails(github, job) {
  if (!job) {
    try {
      job = await github.refreshJob();
    } catch (error) {
      // 步驟名寫固定的字：錯誤訊息每次不一樣（網址帶執行編號），放進步驟名會讓 API 壞著的期間每次都被當成「失敗有變」而留言
      return { stepName: "（讀不到這次執行的步驟）", tail: [], tailNote: `讀不到這次執行的步驟（${error.message}）` };
    }
  }
  const details = { stepName: failedStepName(job), ...(job.html_url ? { runUrl: job.html_url } : {}) };
  try {
    const tail = errorTail(await github.jobLog(job.id));
    return { ...details, tail, tailNote: tail.length > 0 ? undefined : "log 裡找不到錯誤訊息" };
  } catch (error) {
    return { ...details, tail: [], tailNote: `抓不到 log（${error.message}）` };
  }
}

const STATUS_LINE = /^最後一次失敗：.*$/m;
const MARKS = /<!-- data-refresh-failure (.*?) -->/g;

/** 台灣時間「YYYY-MM-DD HH:mm」（runner 跑在 UTC）。 */
export function taipeiTime(date) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ");
}

/** 「最後一次失敗」那行：寫最新一次的時間、卡在哪一步、連續第幾次（之後同樣的失敗只改這一行，不發通知）。 */
function statusLine({ stepName, count, at, runUrl }) {
  return `最後一次失敗：${at}（台灣時間）${stepName ? `卡在「${stepName}」` : ""}，連續第 ${count} 次，[執行紀錄](${runUrl})`;
}

/** 那一行寫的連續次數；沒有就 null。 */
function countInStatus(body) {
  const count = Number(body?.match(STATUS_LINE)?.[0].match(/連續第 (\d+) 次/)?.[1]);
  return Number.isInteger(count) ? count : null;
}

/**
 * 藏在 issue 內文最後（畫面上看不到）的這次失敗：步驟、上游版本、連續次數，下一次拿來比是不是同樣的失敗。
 * 內容整段 encodeURIComponent：步驟名可能帶著錯誤訊息原文（-->、換行、U+2028…），編碼後註解不會被提早結束、也一定讀得回來。
 */
function failureMark({ stepName, upstreamStamp, count }) {
  const payload = encodeURIComponent(JSON.stringify({ step: stepName ?? null, upstream: upstreamStamp || "", count }));
  return `<!-- data-refresh-failure ${payload} -->`;
}

/** 讀出 failureMark 藏的內容（有好幾個就看最後一個）；沒有、或被改壞了就回 null。 */
export function readFailureMark(body) {
  const last = [...(body ?? "").matchAll(MARKS)].at(-1);
  if (!last) return null;
  try {
    const { step, upstream, count } = JSON.parse(decodeURIComponent(last[1]));
    return { step, upstream, count };
  } catch {
    return null;
  }
}

/** 同樣的失敗又發生：換掉內文的「最後一次失敗」那行（沒有就補）、藏著的註解換成一個新的放最後，其他內容不動。 */
export function markFailure(body, { stepName, upstreamStamp, count, at, runUrl }) {
  const status = statusLine({ stepName, count, at, runUrl });
  const rest = body.replace(MARKS, "").replace(/\s+$/, "");
  const withStatus = STATUS_LINE.test(rest) ? rest.replace(STATUS_LINE, () => status) : rest ? `${rest}\n\n${status}` : status;
  return `${withStatus}\n${failureMark({ stepName, upstreamStamp, count })}`;
}
