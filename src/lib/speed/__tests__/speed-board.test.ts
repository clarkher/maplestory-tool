// src/lib/speed/__tests__/speed-board.test.ts
/**
 * 練功測速頁的排行卡（src/app/plan/speed/parts.tsx 的 Leaderboard）：組隊分頁的打幾隻取整數（跟回推那行一樣），
 * 分頁有對應的 tabpanel，讀螢幕軟體才知道下面那塊是哪個分頁的內容。
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Leaderboard } from "@/app/plan/speed/parts";
import { OverviewList } from "@/app/plan/speed/Overview";
import type { BoardRow, OverviewMap } from "../server/rules";
import { couponTag } from "../view";

const row = (patch: Partial<BoardRow>): BoardRow => ({ name: null, job: 220, level: 46, expPer10: 20_000, minutes: 12, date: "2026-10-13", partySize: 1, kills: null, couponMult: null, couponMin: null, ...patch });

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
    // 10/20：有開加倍券的已經扣掉（伺服器存的是回推後的真實速度）
    expect(html).toContain("數字是全隊 10 分鐘打幾隻，用存這段的人填的等級回推（有開加倍券的已經扣掉）。");
  });

  it("單練分頁：10 分鐘經驗照千分位；沒公開寫匿名玩家", () => {
    const html = render("solo", [row({ expPer10: 123_456 })]);
    expect(html).toContain("123,456");
    expect(html).toContain("匿名玩家");
    expect(html).toContain("冰雷巫師 Lv.46");
    expect(html).toContain("數字是 10 分鐘拿到的經驗（有開加倍券的已經扣掉）。");
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

  it("有開加倍券的那筆標「加倍 1.5 倍・8 分」，數字照還原值；沒開的不標（v2.79）", () => {
    const html = render("solo", [row({ expPer10: 80_000, couponMult: 1.5, couponMin: 8 }), row({ expPer10: 70_000 })]);
    expect(html).toContain("80,000");
    expect(html.match(/加倍 /g)).toHaveLength(1); // 只有開了的那筆標（說明那行寫的是「加倍券」）
    expect(html).toContain("加倍 1.5 倍・8 分");
  });
});

describe("加倍標籤文字", () => {
  it("倍率去掉多的 0、分鐘照填的", () => {
    expect(couponTag(1.5, 8)).toBe("加倍 1.5 倍・8 分");
    expect(couponTag(2, 10)).toBe("加倍 2 倍・10 分");
    expect(couponTag(1.15, 12)).toBe("加倍 1.15 倍・12 分");
    expect(couponTag(null, null)).toBeNull();
    expect(couponTag(1.5, null)).toBe("加倍 1.5 倍");
  });
});

// 11/26 v2.79 使用者選 A：一進來就看得到大家的實測，每張圖一列，點開看那張圖前 10 名
describe("大家的實測（依地圖總覽）", () => {
  const maps = { "105040303": { zh: "森林迷宮Ⅲ" }, "101010100": { zh: "別張圖" } } as never;
  const forest: OverviewMap = {
    mapId: 105040303, mapName: "森林迷宮III", runs: 5, couponRuns: 2, minLevel: 44, maxLevel: 52, latest: "2026-11-20",
    best: { expPer10: 123_456, job: 220, level: 48, couponMult: 1.5, couponMin: 8 },
  };
  const party: OverviewMap = { mapId: 101010100, mapName: "x", runs: 1, couponRuns: 0, minLevel: 30, maxLevel: 30, latest: "2026-11-25", best: null };
  const list = (state: Parameters<typeof OverviewList>[0]["state"], open: number | null = null) =>
    renderToString(createElement(OverviewList, { state, maps, open, onToggle: () => {}, board: { kind: "loading" }, tab: "solo", onTab: () => {}, showAll: false, onShowAll: () => {} })).replace(/<!-- -->/g, "");

  it("每張圖一列：圖名、等級範圍、幾筆（加倍幾筆）、最快那筆＋加倍標籤", () => {
    const html = list({ kind: "ok", open: true, maps: [forest, party] });
    expect(html).toContain("森林迷宮Ⅲ");
    expect(html).toContain("Lv.44～52");
    expect(html).toContain("5 筆（2 筆有加倍）");
    expect(html).toContain("123,456");
    expect(html).toContain("冰雷巫師 Lv.48");
    expect(html).toContain("加倍 1.5 倍・8 分");
    // 只有組隊的圖
    expect(html).toContain("只有組隊紀錄");
    expect(html).toContain("Lv.30");
    expect(html).not.toContain("Lv.30～30");
    // 點開用按鈕，讀螢幕軟體知道開了沒
    expect(html).toContain('aria-expanded="false"');
  });

  it("點開那張圖：下面接那張圖的前 10 名", () => {
    const html = list({ kind: "ok", open: true, maps: [forest] }, 105040303);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("載入中…");
  });

  it("沒紀錄、還沒開、連不上、載入中各有一句", () => {
    expect(list({ kind: "ok", open: true, maps: [] })).toContain("還沒有人練滿 10 分鐘");
    expect(list({ kind: "ok", open: false, maps: [] })).toContain("排行還沒開");
    expect(list({ kind: "error" })).toContain("等一下再過來");
    expect(list({ kind: "loading" })).toContain("載入中…");
  });

  it("圖多的時候先列 8 張，按「看全部」才列完", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ ...party, mapId: 100 + index, mapName: `圖${index}` }));
    const html = list({ kind: "ok", open: true, maps: many });
    expect(html).toContain("圖7");
    expect(html).not.toContain("圖8");
    expect(html).toContain("看全部 12 張圖");
  });
});

