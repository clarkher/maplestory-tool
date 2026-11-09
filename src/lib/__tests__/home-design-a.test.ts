/**
 * 首頁照 A「攻略工具」（v1.97 第 3 輪，候選圖 docs/design-candidates/A-home.png）：
 * 輪播是一般卡片底、入口收成一張清單卡、重點色只留給主要按鈕。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => fs.readFileSync(`${root}/${path}`, "utf8");
const SOLID = "bg-[color:var(--maple)]";

describe("首頁輪播、入口清單（v1.97）", () => {
  const showcase = read("components/route/AvatarShowcase.tsx");
  const home = read("components/route/RouteHome.tsx");

  it("輪播用卡片底、圖跟下面那列之間一條細線，公會連結搬去清單", () => {
    expect(showcase).not.toContain("--gold-wash");
    expect(showcase).toContain("border-t border-[color:var(--paper-edge)]");
    expect(showcase).not.toContain("/plan/guild");
  });

  it("萬聖節、未來視、做公會徽章收在同一張清單卡，列跟列之間 1px 線", () => {
    const list = home.match(/function HomeLinks[\s\S]*?\r?\n}\r?\n/)?.[0] ?? "";
    expect(list).toContain("divide-y");
    for (const href of ["/event/halloween", "/future", "/plan/guild"]) expect(list).toContain(href);
    expect(list).toContain("拼圖案、配顏色，下載照遊戲位置");
    // 存過角色硬重新整理時清單先藏著（跟原本的入口卡同一招）
    expect(list).toContain("[[data-profile=saved]_&]:invisible");
  });
});

describe("首頁橘色收斂（v1.97）", () => {
  it("帶我去／去（GoButton）是次要按鈕：橘框、不實心", () => {
    const shell = read("components/PlanShell.tsx");
    const go = shell.match(/export function GoButton[\s\S]*?\r?\n}\r?\n/)?.[0] ?? "";
    expect(go).not.toContain(SOLID);
    expect(go).toContain("border-[color:var(--maple)]");
  });

  it("技能條頁首不是實心橘，左邊 3px 橘線", () => {
    const strip = read("components/route/SkillStrip.tsx");
    const header = strip.match(/aria-expanded=\{open\}\s*className="([^"]*)"/)?.[1] ?? "";
    expect(header).not.toContain(SOLID);
    const section = strip.match(/aria-label="技能怎麼點" className="([^"]*)"/)?.[1] ?? "";
    expect(section).toContain("border-l-[3px] border-l-[color:var(--maple)]");
    // wood-frame 是 @utility 的 border 簡寫，排在後面會把左邊 3px 橘線蓋回 1px 灰線
    expect(section).not.toContain("wood-frame");
  });

  it("能力值主屬性是橘框淡底、副屬性只有橘字", () => {
    const gear = read("components/route/GearCard.tsx");
    const tone = gear.match(/const CELL_TONE = \{[\s\S]*?\}/)?.[0] ?? "";
    expect(tone).not.toContain(SOLID);
    expect(tone).toMatch(/main: "[^"]*border-\[color:var\(--maple\)\][^"]*--maple-wash/);
    // 副屬性不能跟主屬性同底（審查：只差一條 1px 框，手機上分不出誰是主的）：副屬性只留橘字、不加淡底
    expect(tone).toMatch(/second: "(?![^"]*--maple-wash)[^"]*--maple\)\]/);
  });

  it("初心者鈕跟其他職業鈕同一套選項樣式，不是虛線", () => {
    const bar = read("components/route/CharacterBar.tsx");
    expect(bar).not.toContain("border-dashed");
  });
});
