/**
 * 資料自動更新（.github/workflows/data-refresh.yml）的失敗通知，跑在 notify job。
 *
 * refresh 失敗：開一張 issue（label「資料更新失敗」、指派給 repo 擁有者），已經有開著的就在那張留言，不會每天開新的。
 * refresh 成功：有開著的就留言「恢復了」並關掉。被取消（含 GitHub 沒派到機器）不通知。
 * 內容與判斷在 lib/refresh-issue.mjs；這支只負責打 GitHub API。
 *
 * 環境變數（workflow 給）：
 *   GH_TOKEN        要有 issues: write、actions: read
 *   REFRESH_RESULT  refresh job 的結果：success／failure／cancelled
 *   UPSTREAM_STAMP  上游版本（data/raw/artale.json 的 metadata.generatedAt），取上游那步就失敗時是空的
 *   SITE_STAMP      網站目前的資料版本（public/data/meta.json 的 dataGeneratedAt）
 *   DRY_RUN         "true" 就改用測試用的 label 與標題
 *   ASSIGNEE        issue 指派給誰
 *   以及 Actions 內建的 GITHUB_REPOSITORY、GITHUB_RUN_ID、GITHUB_RUN_ATTEMPT、GITHUB_SERVER_URL、GITHUB_API_URL
 *
 * 本機預覽某一次執行會發出什麼內容（只讀，不開 issue、不留言、不關）：
 *   GH_TOKEN=$(gh auth token) GITHUB_REPOSITORY=clarkher/maplestory-tool GITHUB_RUN_ID=<run id> \
 *   REFRESH_RESULT=failure PRINT_ONLY=true node pipeline/notify-refresh.mjs
 */
import { notifyRefresh } from "./lib/refresh-issue.mjs";

const env = process.env;
const LABEL_COLOR = "d73a4a";
const LABEL_DESCRIPTION = "資料自動更新（data-refresh.yml）失敗時自動開的，之後成功一次會自動關";
const LOG_ATTEMPTS = 4;

function required(name) {
  if (!env[name]) throw new Error(`缺環境變數 ${name}`);
  return env[name];
}

function githubApi({ token, repo, runId, runAttempt, apiUrl }) {
  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "maplestory-tool data-refresh notify",
  };

  function request(method, path, body) {
    return fetch(`${apiUrl}/${path}`, {
      method,
      headers: body ? { ...headers, "content-type": "application/json" } : headers,
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
  }

  async function json(method, path, body) {
    const response = await request(method, path, body);
    if (!response.ok) {
      const error = new Error(`${method} ${path} → HTTP ${response.status}：${(await response.text()).slice(0, 300)}`);
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }

  return {
    async findOpenIssue(label) {
      const issues = await json("GET", `repos/${repo}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=20`);
      return issues.find(issue => !issue.pull_request) ?? null;
    },

    async refreshJob() {
      const { jobs } = await json("GET", `repos/${repo}/actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100`);
      const job = jobs.find(candidate => candidate.name === "refresh");
      if (!job) throw new Error("這次執行裡找不到 refresh 這個 job");
      return job;
    },

    async jobLog(jobId) {
      // API 回 302 轉到有時效的下載網址，那個網址不能帶我們的 token。
      // refresh 剛結束時 log 可能還沒整理好，隔幾秒再試
      let lastStatus;
      for (let attempt = 1; attempt <= LOG_ATTEMPTS; attempt += 1) {
        const response = await request("GET", `repos/${repo}/actions/jobs/${jobId}/logs`);
        const location = response.headers.get("location");
        if (location && response.status >= 300 && response.status < 400) {
          const download = await fetch(location);
          if (download.ok) return download.text();
          lastStatus = download.status;
        } else if (response.ok) {
          return response.text();
        } else {
          lastStatus = response.status;
        }
        if (attempt < LOG_ATTEMPTS) await new Promise(resolve => setTimeout(resolve, 5000));
      }
      throw new Error(`HTTP ${lastStatus}`);
    },

    async ensureLabel(label) {
      const response = await request("POST", `repos/${repo}/labels`, { name: label, color: LABEL_COLOR, description: LABEL_DESCRIPTION });
      // 422 = 已經有這個 label
      if (!response.ok && response.status !== 422) {
        throw new Error(`建 label「${label}」→ HTTP ${response.status}：${(await response.text()).slice(0, 300)}`);
      }
    },

    async createIssue({ title, body, label, assignee }) {
      const issue = { title, body, labels: [label] };
      if (!assignee) return json("POST", `repos/${repo}/issues`, issue);
      try {
        return await json("POST", `repos/${repo}/issues`, { ...issue, assignees: [assignee] });
      } catch (error) {
        if (error.status !== 422) throw error;
        // 指派不了（例如擁有者是組織）也要把 issue 開出來
        console.warn(`指派給 ${assignee} 失敗，改成不指派：${error.message}`);
        return json("POST", `repos/${repo}/issues`, issue);
      }
    },

    async comment(number, body) {
      await json("POST", `repos/${repo}/issues/${number}/comments`, { body });
    },

    async close(number) {
      await json("PATCH", `repos/${repo}/issues/${number}`, { state: "closed", state_reason: "completed" });
    },
  };
}

/** 本機預覽：讀的照讀，寫的只印出來。 */
function printOnly(github) {
  const print = (what, text) => console.log(`\n───── 預覽：會${what}（沒有真的送出）─────\n${text}\n`);
  return {
    ...github,
    async ensureLabel(label) {
      print("確保有這個 label", label);
    },
    async createIssue({ title, body, label, assignee }) {
      print("開 issue", `標題：${title}\nlabel：${label}\n指派：${assignee || "（不指派）"}\n\n${body}`);
      return { number: 0, html_url: "（預覽，沒有開）" };
    },
    async comment(number, body) {
      print(`在 #${number} 留言`, body);
    },
    async close(number) {
      print("關閉", `#${number}`);
    },
  };
}

const repo = required("GITHUB_REPOSITORY");
const runId = required("GITHUB_RUN_ID");
const github = githubApi({
  token: env.GH_TOKEN || required("GITHUB_TOKEN"),
  repo,
  runId,
  runAttempt: env.GITHUB_RUN_ATTEMPT || "1",
  apiUrl: env.GITHUB_API_URL || "https://api.github.com",
});

const outcome = await notifyRefresh(
  {
    result: required("REFRESH_RESULT"),
    dryRun: env.DRY_RUN === "true",
    upstreamStamp: env.UPSTREAM_STAMP ?? "",
    siteStamp: env.SITE_STAMP ?? "",
    runUrl: `${env.GITHUB_SERVER_URL || "https://github.com"}/${repo}/actions/runs/${runId}`,
    assignee: env.ASSIGNEE ?? "",
  },
  env.PRINT_ONLY === "true" ? printOnly(github) : github,
);

const DONE = { create: "開 issue", comment: "在開著的 issue 留言", close: "留言並關掉 issue", none: "不用通知" };
const done = `${env.PRINT_ONLY === "true" ? "（預覽）會" : ""}${DONE[outcome.action]}`;
console.log(`refresh 結果 ${env.REFRESH_RESULT} → ${done}${outcome.issue?.number ? `：${outcome.issue.html_url}` : ""}`);
