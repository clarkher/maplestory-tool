/**
 * fx-collect.yml 的 notify job 中開／更新／關 issue 的流程邏輯。
 * 注入 call、repo、assignee、reason、runUrl、action、now（Date）。
 * 回傳簡短字串描述執行結果：「created」、「updated」、「closed」、「nothing」。
 */
import { LABEL } from "./notify-decide.mjs";

export async function notifyIssue({ action, reason, call, repo, runUrl, assignee, now }) {
  const stamp = now.toISOString();
  const lastLine = `最後一次：${stamp}，${reason}（${runUrl}）`;

  // 為什麼是 per_page=1：最多只需要找一張標了「匯率收集失敗」的開著的 issue
  const open = await call("GET", `/repos/${repo}/issues?state=open&labels=${encodeURIComponent(LABEL)}&per_page=1`);
  const issue = open[0];

  if (action === "open") {
    if (issue) {
      // 已經有開著的：只改「最後一次」那行，不留言洗版
      const newBody = (issue.body ?? "").includes("最後一次：")
        ? (issue.body ?? "").replace(/^最後一次：.*$/m, () => lastLine)
        : (issue.body ?? "") + `\n\n${lastLine}`;
      await call("PATCH", `/repos/${repo}/issues/${issue.number}`, { body: newBody });
      return "updated";
    } else {
      // 沒有開著的：先建 label（容忍「已存在」的 422 error），再開 issue
      try {
        await call("POST", `/repos/${repo}/labels`, { name: LABEL, color: "d73a4a", description: "楓幣匯率收集（fx-collect.yml）失敗時自動開的，恢復正常會自動關" });
      } catch (err) {
        // 為什麼容忍 422：label 已存在時 GitHub API 回 422；其他 error（403、500 等）就應該拋出來
        if (!err.message.includes("HTTP 422")) throw err;
      }
      await call("POST", `/repos/${repo}/issues`, {
        title: "楓幣匯率收集失敗",
        labels: [LABEL],
        assignees: assignee ? [assignee] : [],
        body: `${reason}\n\n${lastLine}\n\n資料分支：fx-data；排程：.github/workflows/fx-collect.yml。恢復正常會自動關這張。`,
      });
      return "created";
    }
  } else if (action === "close") {
    if (issue) {
      // 恢復了：留言並關掉
      await call("POST", `/repos/${repo}/issues/${issue.number}/comments`, { body: `恢復了：${reason}（${runUrl}）` });
      await call("PATCH", `/repos/${repo}/issues/${issue.number}`, { state: "closed" });
      return "closed";
    }
    // 沒有開著的 issue：什麼都不做
    return "nothing";
  }
  return "nothing";
}
