// cf/cron.ts
// 排程叫醒鐘（v2.00，11/10 拍板 1A 2A）：GitHub 自己的 schedule 會延遲、會整個跳過
// （fx-collect 寫每 2 小時，10/29～11/09 實際一天只跑 3～5 次），所以改由 Cloudflare 的 Cron Triggers 準時
// 打 GitHub 的 workflow_dispatch，工作本身照舊在 GitHub Actions 跑。workflow 裡原本的 schedule 留著當備援
// （兩邊都跑也沒關係：匯率沒新市價不推、公告已經通知過的不會再通知）。
// 部署：npx wrangler deploy -c cf/cron.wrangler.jsonc（只有這支程式，不用先 build）。
// 秘密：GH_DISPATCH_TOKEN（能對 clarkher/maplestory-tool 觸發 workflow 的權杖），
//   npx wrangler secret put GH_DISPATCH_TOKEN -c cf/cron.wrangler.jsonc

/** cron（UTC，跟 cron.wrangler.jsonc 的 triggers.crons 一字不差）→ 要觸發的 workflow 檔 */
export const JOBS: Record<string, string> = {
  // 台灣時間 00:55 起每 2 小時（參考站在偶數整點 :41 左右更新，晚一點再抓）
  "55 */2 * * *": "fx-collect.yml",
  // 台灣時間 08:10、20:10 看官方公告
  "10 0,12 * * *": "announce-watch.yml",
};

const REPO = "clarkher/maplestory-tool";
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export async function dispatch(workflow: string, token: string, fetcher: Fetch = fetch): Promise<void> {
  const response = await fetcher(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "maplehelper-cron",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  if (!response.ok) throw new Error(`觸發 ${workflow} 失敗：HTTP ${response.status} ${await response.text()}`);
}

export type CronEnv = { GH_DISPATCH_TOKEN?: string };

export default {
  async scheduled(controller: { cron: string }, env: CronEnv): Promise<void> {
    const workflow = JOBS[controller.cron];
    if (!workflow) throw new Error(`不認得的排程時間：${controller.cron}`);
    // 沒設權杖就丟錯：Cloudflare 的排程紀錄會記成失敗，看得到（不默默略過）
    if (!env.GH_DISPATCH_TOKEN) throw new Error(`沒設 GH_DISPATCH_TOKEN，${workflow} 這次沒觸發`);
    await dispatch(workflow, env.GH_DISPATCH_TOKEN);
    console.log(`已觸發 ${workflow}`);
  },
};
