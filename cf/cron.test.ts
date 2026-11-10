import { describe, expect, it, vi } from "vitest";
import cron, { JOBS, dispatch } from "./cron";
import config from "./cron.wrangler.jsonc?raw";

describe("cron：Cloudflare 準時叫 GitHub 跑排程", () => {
  it("wrangler 設定的每個時間都對得到一支 workflow，反過來也是", () => {
    const crons = JSON.parse(config.replace(/^\s*\/\/.*$/gm, "")).triggers.crons as string[];
    expect([...crons].sort()).toEqual(Object.keys(JOBS).sort());
  });

  it("匯率每 2 小時、公告每天 2 次", () => {
    expect(JOBS["55 */2 * * *"]).toBe("fx-collect.yml");
    expect(JOBS["10 0,12 * * *"]).toBe("announce-watch.yml");
  });

  it("dispatch 打 GitHub 的 workflow_dispatch，分支 main", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    await dispatch("fx-collect.yml", "tok", fetcher);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/clarkher/maplestory-tool/actions/workflows/fx-collect.yml/dispatches");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ ref: "main" });
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("GitHub 回錯就丟錯（Cloudflare 才會記成失敗）", async () => {
    const fetcher = vi.fn(async () => new Response("Bad credentials", { status: 401 }));
    await expect(dispatch("fx-collect.yml", "tok", fetcher)).rejects.toThrow(/401/);
  });

  it("沒設權杖就丟錯，不默默略過", async () => {
    await expect(cron.scheduled({ cron: "55 */2 * * *" }, {})).rejects.toThrow(/GH_DISPATCH_TOKEN/);
  });

  it("不認得的時間丟錯", async () => {
    await expect(cron.scheduled({ cron: "0 0 * * *" }, { GH_DISPATCH_TOKEN: "tok" })).rejects.toThrow(/不認得/);
  });
});
