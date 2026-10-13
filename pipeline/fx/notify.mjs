/**
 * fx-collect.yml 的 notify job：照 lib/notify-decide.mjs 的決定開／更新／關 issue（label「匯率收集失敗」）。
 * 已經有開著的就只改內文「最後一次」那行，不留言洗版；恢復時留言並關掉。
 *
 * 環境變數：GH_TOKEN（issues: write）、WRITE、COLLECT_RESULT、PUBLISH_RESULT、OK_8591、FAIL_8591、ASSIGNEE，
 * 以及 Actions 內建的 GITHUB_REPOSITORY、GITHUB_RUN_ID、GITHUB_SERVER_URL、GITHUB_API_URL。
 */
import { LABEL, decide } from "./lib/notify-decide.mjs";

const env = process.env;
const { action, reason } = decide({
  write: env.WRITE,
  collectResult: env.COLLECT_RESULT,
  publishResult: env.PUBLISH_RESULT,
  ok8591: env.OK_8591 ?? "",
  fail8591: env.FAIL_8591 ?? "",
});
console.log(`${action}：${reason}`);
if (action === "none") process.exit(0);

const api = env.GITHUB_API_URL ?? "https://api.github.com";
const repo = env.GITHUB_REPOSITORY;
const runUrl = `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${repo}/actions/runs/${env.GITHUB_RUN_ID}`;
const headers = { authorization: `Bearer ${env.GH_TOKEN}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "maplestory-tool fx-collect notify" };

async function call(method, url, body) {
  const response = await fetch(`${api}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(`${method} ${url} → HTTP ${response.status}：${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

const open = await call("GET", `/repos/${repo}/issues?state=open&labels=${encodeURIComponent(LABEL)}&per_page=1`);
const issue = open[0];
const stamp = new Date().toISOString();
const lastLine = `最後一次：${stamp}，${reason}（${runUrl}）`;

if (action === "open") {
  if (issue) {
    await call("PATCH", `/repos/${repo}/issues/${issue.number}`, { body: (issue.body ?? "").replace(/^最後一次：.*$/m, lastLine) });
  } else {
    await call("POST", `/repos/${repo}/labels`, { name: LABEL, color: "d73a4a", description: "楓幣匯率收集（fx-collect.yml）失敗時自動開的，8591 恢復會自動關" }).catch(() => {});
    await call("POST", `/repos/${repo}/issues`, {
      title: "楓幣匯率收集失敗",
      labels: [LABEL],
      assignees: env.ASSIGNEE ? [env.ASSIGNEE] : [],
      body: `${reason}\n\n${lastLine}\n\n資料分支：fx-data；排程：.github/workflows/fx-collect.yml。8591 恢復正常會自動關這張。`,
    });
  }
} else if (issue) {
  await call("POST", `/repos/${repo}/issues/${issue.number}/comments`, { body: `恢復了：${reason}（${runUrl}）` });
  await call("PATCH", `/repos/${repo}/issues/${issue.number}`, { state: "closed" });
}
