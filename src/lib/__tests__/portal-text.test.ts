import { describe, expect, it } from "vitest";
import { npcLevelNote, npcSentence, npcWarp, exitSentence, portalDirection } from "@/lib/portal-text";

const spread: Array<[number, number]> = [[-1400, 0], [-700, 0], [0, 0], [700, 0], [1400, 0], [0, -600]];

describe("傳送門方向：名稱只認方向字", () => {
  it("east／west／up／top／down／dn／under／bottom 照名稱", () => {
    expect(portalDirection("east00", 0, 0, [])).toBe("右邊");
    expect(portalDirection("west00", 0, 0, [])).toBe("左邊");
    expect(portalDirection("up00", 10, 10, spread)).toBe("上面");
    expect(portalDirection("top00", 10, 10, spread)).toBe("上面");
    expect(portalDirection("down00", 10, 10, spread)).toBe("下面");
    expect(portalDirection("dn01", 10, 10, spread)).toBe("下面");
    expect(portalDirection("under00", 10, 10, spread)).toBe("下面");
    expect(portalDirection("bottom00", 10, 10, spread)).toBe("下面");
  });

  it("in／out／st／market／tp 不是方向，改看位置（不再寫走進建築、走出去、樓梯）", () => {
    expect(portalDirection("in01_1", -1300, 0, spread)).toBe("左邊");
    expect(portalDirection("out00", 1300, 0, spread)).toBe("右邊");
    expect(portalDirection("st00", 100, 0, spread)).toBe("中間");
    expect(portalDirection("market00", 0, -600, spread)).toBe("上面");
    expect(portalDirection("tp00", 0, 0, spread)).toBeNull();
  });
});

describe("傳送門方向：名稱看不出來時用它在這張圖所有傳送門裡的位置", () => {
  it("左右：橫向夠寬（300 以上）時，前四分之一是左邊、後四分之一是右邊", () => {
    expect(portalDirection("sub00", -1300, 0, spread)).toBe("左邊");
    expect(portalDirection("sub00", 1300, 0, spread)).toBe("右邊");
  });

  it("上下：比中位高度高（y 小）200 以上是上面、低 200 以上是下面", () => {
    expect(portalDirection("mid00", 0, -600, spread)).toBe("上面");
    const tall: Array<[number, number]> = [[0, -300], [50, 0], [100, 0], [150, 600]];
    expect(portalDirection("mid00", 150, 600, tall)).toBe("下面");
  });

  it("橫向太窄就不分左右，直接看上下", () => {
    const narrow: Array<[number, number]> = [[-100, 0], [100, 0], [0, -500]];
    expect(portalDirection("sub00", -100, 0, narrow)).toBe("中間");
    expect(portalDirection("sub00", 0, -500, narrow)).toBe("上面");
  });

  it("都不偏就是中間", () => {
    expect(portalDirection("mid00", 100, 0, spread)).toBe("中間");
  });

  it("座標不明或這張圖傳送門太少就不猜", () => {
    expect(portalDirection("sub00", 0, 0, spread)).toBeNull();
    expect(portalDirection("sub00", undefined, undefined, spread)).toBeNull();
    expect(portalDirection("sub00", 500, 0, [[500, 0]])).toBeNull();
  });
});

describe("傳送門句子：寫在這張圖的卡片上，講走哪個門、往哪裡", () => {
  it("組成給玩家看的一句話，不露出代碼", () => {
    expect(exitSentence("最右邊", "海岸草叢Ⅰ", false)).toBe("走最右邊的傳送門，往 海岸草叢Ⅰ");
    expect(exitSentence("上面", "番茄園", true)).toBe("走上面的傳送門，往 番茄園");
  });
  it("看不出方向：圖上有圈就說圈起來的，沒圖只說傳送門", () => {
    expect(exitSentence(null, "番茄園", true)).toBe("走圈起來的傳送門，往 番茄園");
    expect(exitSentence(null, "番茄園", false)).toBe("走傳送門，往 番茄園");
  });
});

describe("NPC 傳送那一步（冰雪峽谷Ⅱ的傑夫，v1.04 使用者拍板 A）", () => {
  it("認得出 npc:名字:站的位置", () => {
    expect(npcWarp("npc:傑夫:最上面")).toEqual({ npc: "傑夫", spot: "最上面" });
  });

  it("一般傳送門、空字串都不是", () => {
    expect(npcWarp("top00")).toBeNull();
    expect(npcWarp("")).toBeNull();
    expect(npcWarp("npc:")).toBeNull();
  });

  it("那一步的字寫在這張圖的卡片上：跟最上面的傑夫說話，他會送你到下一張", () => {
    expect(npcSentence({ npc: "傑夫", spot: "最上面" }, "尖銳的絕壁Ⅰ")).toBe("跟最上面的傑夫說話，他會送你到 尖銳的絕壁Ⅰ");
  });

  it("有等級門檻再加一行：傑夫只讓 50 等以上的人進去，參考舊版資料", () => {
    expect(npcLevelNote("傑夫", 50)).toBe("（傑夫只讓 50 等以上的人進去，參考舊版資料）");
  });
});
