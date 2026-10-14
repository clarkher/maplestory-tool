// src/lib/speed/__tests__/speed-panel.test.ts
/**
 * 練功測速頁的地圖面板、組隊卡（src/app/plan/speed）第一次畫出來的樣子（10/14 修飾）：
 * 地圖名旁有「不是這張圖」、掉寶預設收起來（按鈕寫幾樣、aria-expanded／aria-controls）、組隊勾了最下面有改隊伍的說明。
 * 按下去之後的行為（展開、重選地圖）在 scripts/verify/speed-shot.mjs 用無頭 Chrome 驗。
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MapPanel } from "@/app/plan/speed/parts";
import { PartyCard } from "@/app/plan/speed/PartyCard";
import type { Item, MapRecord, Monster, TrainingRow } from "@/lib/types";

const maps = { "101": { zh: "森林迷宮III", st: "迷霧森林" } } as unknown as Record<string, MapRecord>;
const monster = { id: 7, n: "風獨眼獸", lv: 46, exp: 120, hp: 3000, drops: [2000, 2001] } as unknown as Monster;
const items = new Map([
  [2000, { id: 2000, n: "紅色藥水" }],
  [2001, { id: 2001, n: "藍色藥水" }],
] as [number, Item][]);
const training = [{ m: 101, mobs: [[7, 12, 0]] }] as unknown as TrainingRow[];

const html = (element: Parameters<typeof renderToString>[0]) => renderToString(element).replace(/<!-- -->/g, "");

describe("地圖面板", () => {
  const panel = () =>
    html(createElement(MapPanel, { mapId: 101, maps, monsterById: new Map([[7, monster]]), items, training, party: null, onWrong: () => {} }));

  it("地圖名旁邊有「不是這張圖」", () => {
    expect(panel()).toMatch(/<h2[^>]*>森林迷宮III<\/h2><button type="button"[^>]*>不是這張圖<\/button>/);
  });

  it("掉寶預設收起來：只有一顆「掉寶 N 樣」（aria-expanded=false、aria-controls），沒有畫出道具標籤", () => {
    const out = panel();
    const button = out.match(/<button type="button" aria-expanded="false" aria-controls="([^"]+)"[^>]*>掉寶 (\d+) 樣/);
    expect(button).not.toBeNull();
    expect(Number(button![2])).toBeGreaterThan(0);
    expect(out).not.toContain('href="/db/items?id=');
    // 怪的基本資料照舊永遠顯示
    expect(out).toContain("Lv.46 · HP 3,000 · 經驗 120 · 刷怪點 12 個");
  });
});

describe("組隊卡", () => {
  const hint = "練到一半改隊伍，會從改的那一刻重新算一段（不到 5 分鐘的那段不存）。";

  it("勾了組隊：卡片最下面一行寫改隊伍會重新算一段", () => {
    const out = html(createElement(PartyCard, { party: { on: true, others: [44], hitter: 0 }, selfLevel: 46, onChange: () => {} }));
    expect(out).toContain(hint);
    expect(out.lastIndexOf(hint)).toBeGreaterThan(out.lastIndexOf("加一個隊友"));
  });

  it("沒勾：不出這行", () => {
    expect(html(createElement(PartyCard, { party: { on: false, others: [], hitter: 0 }, selfLevel: 46, onChange: () => {} }))).not.toContain(hint);
  });
});
