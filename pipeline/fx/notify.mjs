/**
 * fx-collect.yml 的 notify job：照 lib/notify-decide.mjs 的決定開／更新／關 issue（label「匯率收集失敗」）。
 * 已經有開著的就只改內文「最後一次」那行，不留言洗版；恢復時留言並關掉。
 *
 * 環境變數：GH_TOKEN（issues: write）、WRITE、COLLECT_RESULT、PUBLISH_RESULT、AGE_HOURS、ASSIGNEE，
 * 以及 Actions 內建的 GITHUB_REPOSITORY、GITHUB_RUN_ID、GITHUB_SERVER_URL、GITHUB_API_URL。
 */
import { decide } from "./lib/notify-decide.mjs";
import { notifyIssue } from "./lib/notify-issue.mjs";

const env = process.env;
const { action, reason } = decide({
  write: env.WRITE,
  collectResult: env.COLLECT_RESULT,
  publishResult: env.PUBLISH_RESULT,
  ageHours: env.AGE_HOURS ?? "",
});
// action 是程式用的英文代號；Actions 的 log 給人看，印中文
const ACTION_ZH = { open: "要開 issue", close: "要關 issue", none: "不動" };
console.log(`${ACTION_ZH[action] ?? action}：${reason}`);
if (action === "none") process.exit(0);

const api = env.GITHUB_API_URL ?? "https://api.github.com";
const repo = env.GITHUB_REPOSITORY;
const runUrl = `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${repo}/actions/runs/${env.GITHUB_RUN_ID}`;
const headers = { authorization: `Bearer ${env.GH_TOKEN}`, accept: "application/vnd.github+json", "content-type": "application/json", "x-github-api-version": "2022-11-28", "user-agent": "maplestory-tool fx-collect notify" };

async function call(method, url, body) {
  const response = await fetch(`${api}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(`${method} ${url} → HTTP ${response.status}：${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

const result = await notifyIssue({
  action,
  reason,
  call,
  repo,
  runUrl,
  assignee: env.ASSIGNEE,
  now: new Date(),
});
console.log(`${ACTION_ZH[action] ?? action}：${reason}（${result}）`);
