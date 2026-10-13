// src/lib/speed/__tests__/speed-board.test.ts
/**
 * 練功測速頁的排行卡（src/app/plan/speed/parts.tsx 的 Leaderboard）：組隊分頁的打幾隻取整數（跟回推那行一樣），
 * 分頁有對應的 tabpanel，讀螢幕軟體才知道下面那塊是哪個分頁的內容。
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Leaderboard } from "@/app/plan/speed/parts";
import type { BoardRow } from "../server/rules";

const row = (patch: Partial<BoardRow>): BoardRow => ({ name: null, job: 220, level: 46, expPer10: 20_000, minutes: 12, date: "2026-10-13", partySize: 1, kills: null, ...patch });

function render(tab: "solo" | "party", rows: BoardRow[]) {
  const board = { kind: "ok" as const, open: true, solo: tab === "solo" ? rows : [], party: tab === "party" ? rows : [] };
  return renderToString(createElement(Leaderboard, { board, tab, onTab: () => {} })).replace(/<!-- -->/g, "");
}

describe("練功測速排行卡", () => {
  it("組隊分頁：全隊打幾隻取整數、寫幾人隊；說明換成組隊的", () => {
    const html = render("party", [row({ name: "芙莉蓮", partySize: 3, kills: 52.4 })]);
    expect(html).toContain("全隊 52 隻／10 分");
    expect(html).not.toContain("52.4");
    expect(html).toContain("3 人隊");
    expect(html).toContain("數字是全隊 10 分鐘打幾隻，用存這段的人填的等級回推。");
  });

  it("單練分頁：10 分鐘經驗照千分位；沒公開寫匿名玩家", () => {
    const html = render("solo", [row({ expPer10: 123_456 })]);
    expect(html).toContain("123,456");
    expect(html).toContain("匿名玩家");
    expect(html).toContain("冰雷巫師 Lv.46");
  });

  it("分頁對應 tabpanel：選中的分頁 id ＝ tabpanel 的 aria-labelledby，分頁的 aria-controls 指向 tabpanel", () => {
    const html = render("party", []);
    const panel = html.match(/<div id="([^"]+)" role="tabpanel" aria-labelledby="([^"]+)"/);
    expect(panel).not.toBeNull();
    const [, panelId, labelledBy] = panel!;
    const selected = html.match(/<button id="([^"]+)" type="button" role="tab" aria-selected="true" aria-controls="([^"]+)"/);
    expect(selected?.[1]).toBe(labelledBy);
    expect(selected?.[2]).toBe(panelId);
  });
});
