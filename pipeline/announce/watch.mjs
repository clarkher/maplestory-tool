/**
 * announce-watch.yml：抓官網公告列表，新的在追蹤 issue（label「官方公告」，一直開著）留言通知。
 * 第一次跑（還沒有追蹤 issue）只開 issue、把現有公告記成看過，不留言。
 * 用法：node pipeline/announce/watch.mjs
 * 環境變數：GH_TOKEN（issues: write）、GITHUB_REPOSITORY、ASSIGNEE；DRY_RUN=true 只印不寫。
 */
import { fetchBulletins, newRows, readSeen, renderComment, writeSeen } from "./lib/bulletin.mjs";

const LABEL = "官方公告";
const env = process.env;
const dryRun = env.DRY_RUN === "true";
const api = env.GITHUB_API_URL ?? "https://api.github.com";
const repo = env.GITHUB_REPOSITORY ?? "clarkher/maplestory-tool";
const headers = { authorization: `Bearer ${env.GH_TOKEN}`, accept: "application/vnd.github+json", "content-type": "application/json", "x-github-api-version": "2022-11-28", "user-agent": "maplestory-tool announce-watch" };

async function call(method, url, body) {
  const response = await fetch(`${api}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(`${method} ${url} → HTTP ${response.status}：${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

const rows = await fetchBulletins();
console.log(`官網公告列表 ${rows.length} 則，最新：${rows[0].startDate} ${rows[0].title}`);

const [issue] = await call("GET", `/repos/${repo}/issues?state=open&labels=${encodeURIComponent(LABEL)}&per_page=1`);

if (!issue) {
  const body = writeSeen(
    "排程（.github/workflows/announce-watch.yml，Cloudflare 每天 08:10、20:10 準時叫）抓官網公告列表，" +
      "有新公告就在這裡留言，寫是哪一類、網站哪裡要看。不會自動改網站。制裁公告不通知。\n\n" +
      "這張要一直開著（看過的公告記在內文最後）；關掉的話下一次會重開一張、從那時候重新記。",
    rows.map(r => r.bullentinId),
  );
  if (dryRun) {
    console.log(`[dry-run] 會開追蹤 issue，記 ${rows.length} 則看過`);
  } else {
    try {
      await call("POST", `/repos/${repo}/labels`, { name: LABEL, color: "1d76db", description: "官網新公告通知（announce-watch.yml）" });
    } catch (err) {
      // 已經有這個 label 回 422，其他錯照丟
      if (!err.message.includes("HTTP 422")) throw err;
    }
    const created = await call("POST", `/repos/${repo}/issues`, { title: "官網公告追蹤", labels: [LABEL], assignees: env.ASSIGNEE ? [env.ASSIGNEE] : [], body });
    console.log(`開了追蹤 issue #${created.number}，記 ${rows.length} 則看過`);
  }
  process.exit(0);
}

const seen = readSeen(issue.body);
const fresh = newRows(rows, seen);
if (fresh.length === 0) {
  console.log("沒有新公告");
  process.exit(0);
}
const comment = renderComment(fresh);
console.log(comment || `新公告 ${fresh.length} 則都不用通知（制裁公告）`);
if (dryRun) {
  console.log("[dry-run] 不留言、不改 issue");
  process.exit(0);
}
// 先留言再記看過：留言失敗時下一次還會再試，不會漏
if (comment) await call("POST", `/repos/${repo}/issues/${issue.number}/comments`, { body: comment });
await call("PATCH", `/repos/${repo}/issues/${issue.number}`, { body: writeSeen(issue.body, [...seen, ...fresh.map(r => r.bullentinId)]) });
console.log(`#${issue.number} 記了 ${fresh.length} 則新的`);
