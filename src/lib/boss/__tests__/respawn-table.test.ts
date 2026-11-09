import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BOSSES } from "@/lib/boss/types";
import { RESPAWN_STATS_UNTIL, mapText, respawnCell, respawnLlmsLines, respawnRows, respawnSummary, respawnText } from "@/lib/boss/respawn-table";

const by = (name: string) => BOSSES.find((b) => b.name === name)!;

describe("野王重生時間表（v1.90，伺服器就畫得出來，給爬蟲跟第一屏）", () => {
  it("有實測寫區間或約幾分，跟計時器卡片同一套寫法", () => {
    expect(respawnText(by("蘑菇王"))).toBe("45～60 分");
    expect(respawnText(by("紅寶王"))).toBe("約 45 分");
    expect(respawnText(by("艾利傑"))).toBe("還沒有台服實測");
  });

  it("表格那格：只有 1 筆實測的不寫「還沒有」，照實寫筆數；完全沒有的照舊寫還沒有台服實測", () => {
    expect(respawnCell(by("巴洛古"))).toBe("實測只有 1 筆");
    expect(respawnCell(by("冥界幽靈"))).toBe("還沒有台服實測");
    expect(respawnCell(by("巨居蟹"))).toBe("約 90 分");
  });

  it("每隻王一列、順序跟計時器一樣，地圖兩張的合成一格", () => {
    const rows = respawnRows();
    expect(rows.map((r) => r.name)).toEqual(BOSSES.map((b) => b.name));
    expect(rows.find((r) => r.name === "殭屍猴王")!.map).toBe("巫婆森林Ⅰ或Ⅱ");
    expect(mapText(["菇菇王出沒地"])).toBe("菇菇王出沒地");
  });

  it("數字只來自台服實測檔：每一列的分鐘數都要等於 respawn.json 的 min／max，不准出現客戶端 mobTime", () => {
    for (const row of respawnRows()) {
      const boss = BOSSES.find((b) => b.id === row.id)!;
      const nums = (row.respawn.match(/\d+/g) ?? []).map(Number);
      if (boss.min === null || boss.max === null) {
        expect(row.measured).toBe(false);
        // 沒實測那格只准出現筆數，不准出現分鐘
        expect(row.respawn).not.toMatch(/分/);
      } else {
        expect(row.measured).toBe(true);
        expect(nums).toEqual(boss.min === boss.max ? [boss.min] : [boss.min, boss.max]);
      }
    }
    // 蘑菇王客戶端 mobTime 是 1800 秒＝30 分，實測 45～60
    expect(respawnRows().some((r) => /(^|\D)30 分/.test(r.respawn))).toBe(false);
  });

  it("一句話摘要：同樣時間的王併在一起，沒實測的不寫進去（給 description、llms.txt）", () => {
    expect(respawnSummary()).toBe("蘑菇王、殭屍蘑菇王 45～60 分；紅寶王、樹妖王、殭屍猴王約 45 分；沼澤巨鱷 42～65 分；巨居蟹約 90 分");
    expect(respawnSummary()).not.toMatch(/巴洛古|艾利傑|雪毛怪人|冥界幽靈/);
  });

  it("llms.txt 有一段野王重生時間：每隻王一行、寫地圖跟時間、附計時器網址", async () => {
    // 整支 route 要載全站資料、太慢，這裡測產生那段的函式＋確認 route 有接
    const route = readFileSync(path.resolve(import.meta.dirname, "../../../app/llms.txt/route.ts"), "utf8");
    expect(route).toContain("...respawnLlmsLines(SITE_URL)");
    const block = respawnLlmsLines("https://maplehelper.tw").join("\n");
    expect(block).toMatch(/^## 野王重生時間（台服玩家實測，統計到 9\/8）/);
    expect(block).toContain("- 蘑菇王（菇菇王出沒地）：45～60 分");
    expect(block).toContain("- 巴洛古（被詛咒的寺院）：實測只有 1 筆");
    expect(block).toContain("https://maplehelper.tw/plan/boss");
    expect(block.match(/^- /gm)?.length).toBe(BOSSES.length);
  });

  it("頁面描述開頭直接講重生時間", async () => {
    const { metadata } = await import("@/app/plan/boss/page");
    expect(String(metadata.description)).toMatch(/^野王重生時間（台服玩家實測）：蘑菇王、殭屍蘑菇王 45～60 分/);
  });

  it("統計截止日從資料檔讀", () => {
    expect(RESPAWN_STATS_UNTIL).toBe("9/8");
  });
});
