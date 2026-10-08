/**
 * 資料自動更新（.github/workflows/data-refresh.yml）的失敗通知，跑在 notify job。
 *
 * refresh（建置）或 publish（開 PR 合併）失敗：開一張 issue（label「資料更新失敗」、指派給 repo 擁有者）；已經有開著的就不另開——
 *   同樣的失敗（同一步、同一個上游版本）只更新內文「最後一次失敗」那行（不發通知），有變才在那張留言。
 *   步驟名與錯誤訊息從失敗的那個 job 讀（lib/refresh-issue.mjs 的 overallResult）。
 * 跑超過時間上限被中止（結果是 cancelled，但有主要步驟跑到一半）也算失敗；
 * 一步都沒跑（GitHub 沒派到機器）、或只有收尾步驟被中止，不通知。
 * 成功（publish 合併了，或 dry-run、版本沒變所以沒跑）：有開著的就留言「恢復了」並關掉。
 * 內容與判斷在 lib/refresh-issue.mjs；這支只負責打 GitHub API（讀取與改內文遇到 5xx、連線失敗會重試，開 issue、留言不重試）。
 *
 * 環境變數（workflow 給）：
 *   GH_TOKEN        要有 issues: write、actions: read
 *   REFRESH_RESULT  refresh job 的結果：success／failure／cancelled
 *   PUBLISH_RESULT  publish job 的結果：success／failure／cancelled／skipped（沒給當成沒跑）
 *   UPSTREAM_STAMP  上游版本（data/raw/artale.json 的 metadata.generatedAt），取上游那步就失敗時是空的
 *   SITE_STAMP      網站目前的資料版本（public/data/meta.json 的 dataGeneratedAt）
 *   DRY_RUN         "true" 就改用測試用的 label 與標題（workflow 開頭的 env：勾 dry_run、simulate_failure，或不是從 main 觸發）
 *   ASSIGNEE        issue 指派給誰
 *   以及 Actions 內建的 GITHUB_REPOSITORY、GITHUB_RUN_ID、GITHUB_SERVER_URL、GITHUB_API_URL
 *
 * 本機預覽某一次執行會發出什麼內容（只讀，不開 issue、不留言、不關）：
 *   GH_TOKEN=$(gh auth token) GITHUB_REPOSITORY=clarkher/maplestory-tool GITHUB_RUN_ID=<run id> \
 *   REFRESH_RESULT=success PUBLISH_RESULT=failure PRINT_ONLY=true node pipeline/notify-refresh.mjs
 */
import { notifyRefresh, overallResult } from "./lib/refresh-issue.mjs";

const env = process.env;
const LABEL_COLOR = "d73a4a";
const LABEL_DESCRIPTION = "資料自動更新（data-refresh.yml）失敗時自動開的，之後成功一次會自動關";
const LOG_ATTEMPTS = 4;
const REQUEST_ATTEMPTS = 3;

function required(name) {
  if (!env[name]) throw new Error(`缺環境變數 ${name}`);
  return env[name];
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function githubApi({ token, repo, runId, apiUrl }) {
  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "maplestory-tool data-refresh notify",
  };

  // GitHub 偶爾回 5xx 或連線斷掉，讀取（GET）與改內文（PATCH）隔幾秒再試，免得那一輪的通知因此發不出去。
  // 開 issue、留言（POST）不重試：GitHub 回 502 時可能其實已經寫進去了，重送會多開一張——成功後只會關掉一張
  async function request(method, path, body) {
    const attempts = method === "POST" ? 1 : REQUEST_ATTEMPTS;
    for (let attempt = 1; ; attempt += 1) {
      try {
        const response = await fetch(`${apiUrl}/${path}`, {
          method,
          headers: body ? { ...headers, "content-type": "application/json" } : headers,
          body: body ? JSON.stringify(body) : undefined,
          redirect: "manual",
        });
        if (response.status < 500 || attempt >= attempts) return response;
      } catch (error) {
        if (attempt >= attempts) throw error;
      }
      await sleep(3000 * attempt);
    }
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

    async job(name) {
      // filter=latest：每個 job 拿最新那次（只重跑 notify 時也找得到 refresh、publish）
      const { jobs } = await json("GET", `repos/${repo}/actions/runs/${runId}/jobs?filter=latest&per_page=100`);
      const job = jobs.find(candidate => candidate.name === name);
      if (!job) throw new Error(`這次執行裡找不到 ${name} 這個 job`);
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
        if (attempt < LOG_ATTEMPTS) await sleep(5000);
      }
      throw new Error(`HTTP ${lastStatus}`);
    },

    async ensureLabel(label) {
      // 422 = 已經有這個 label。其他錯誤只警告：label 建不起來也要把 issue 開出來
      try {
        const response = await request("POST", `repos/${repo}/labels`, { name: label, color: LABEL_COLOR, description: LABEL_DESCRIPTION });
        if (!response.ok && response.status !== 422) {
          console.warn(`建 label「${label}」失敗（HTTP ${response.status}）：${(await response.text()).slice(0, 300)}`);
        }
      } catch (error) {
        console.warn(`建 label「${label}」失敗：${error.message}`);
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

    async updateIssue(number, body) {
      await json("PATCH", `repos/${repo}/issues/${number}`, { body });
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
    async updateIssue(number, body) {
      print(`改 #${number} 的內文（不發通知）`, body);
    },
    async close(number) {
      print("關閉", `#${number}`);
    },
  };
}

const repo = required("GITHUB_REPOSITORY");
const runId = required("GITHUB_RUN_ID");
const server = env.GITHUB_SERVER_URL || "https://github.com";
const github = githubApi({
  token: env.GH_TOKEN || required("GITHUB_TOKEN"),
  repo,
  runId,
  apiUrl: env.GITHUB_API_URL || "https://api.github.com",
});

const { result, job } = overallResult({ refresh: required("REFRESH_RESULT"), publish: env.PUBLISH_RESULT });
const outcome = await notifyRefresh(
  {
    result,
    job,
    dryRun: env.DRY_RUN === "true",
    upstreamStamp: env.UPSTREAM_STAMP ?? "",
    siteStamp: env.SITE_STAMP ?? "",
    runUrl: `${server}/${repo}/actions/runs/${runId}`,
    // blob/HEAD＝預設分支：從功能分支觸發的測試 issue，分支刪掉後連結也不會壞
    readmeUrl: `${server}/${repo}/blob/HEAD/README.md#${encodeURIComponent("自動更新")}`,
    assignee: env.ASSIGNEE ?? "",
  },
  env.PRINT_ONLY === "true" ? printOnly(github) : github,
);

const DONE = {
  create: "開 issue",
  comment: "失敗有變，在開著的 issue 留言",
  update: "同樣的失敗，只更新開著的 issue 內文（不發通知）",
  close: "留言並關掉 issue",
  none: "不用通知",
};
const done = `${env.PRINT_ONLY === "true" && outcome.action !== "none" ? "（預覽）會" : ""}${DONE[outcome.action]}`;
console.log(`refresh 結果 ${env.REFRESH_RESULT}、publish 結果 ${env.PUBLISH_RESULT || "（沒給）"} → ${done}${outcome.issue?.number ? `：${outcome.issue.html_url}` : ""}`);
