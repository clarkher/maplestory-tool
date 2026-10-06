import { describe, expect, it } from "vitest";
import { levelRange, respawnText, sourceLabels } from "@/lib/format";

describe("回生秒數的寫法", () => {
  it("等效回生秒數帶小數，畫面寫整數秒「回生約 7 秒」", () => {
    expect(respawnText(7.1)).toBe("回生約 7 秒");
    expect(respawnText(9.6)).toBe("回生約 10 秒");
    expect(respawnText(12)).toBe("回生約 12 秒");
  });
});

describe("出處連結的名字", () => {
  it("寫網站名，不寫貼文編號；同一個網站好幾篇排在一起時才加 2、3", () => {
    expect(sourceLabels([
      "https://forum.gamer.com.tw/C.php?bsn=85994&snA=647",
      "https://forum.gamer.com.tw/C.php?bsn=85994&snA=2395",
      "https://bobogameguides.com/maplestory-classic/guides/quests.html",
    ])).toEqual(["巴哈姆特", "巴哈姆特 2", "波波攻略島"]);
    expect(sourceLabels(["https://forum.gamer.com.tw/C.php?bsn=85994&snA=1490272"])).toEqual(["巴哈姆特"]);
  });

  it("認得的網站寫站名，不認得的寫「網頁」，網址壞掉也寫「網頁」", () => {
    expect(sourceLabels([
      "https://mapleclassictools.com/guides/x/",
      "https://home.gamer.com.tw/artwork.php?sn=1",
      "https://www.ptt.cc/bbs/x.html",
      "https://kafuffu20.com/adventurer-ring.html",
      "https://v113.wordpress.com/x",
      "not a url",
    ])).toEqual(["楓錄", "巴哈小屋", "PTT", "網頁", "網頁 2", "網頁 3"]);
  });
});

describe("等級範圍文字", () => {
  it("頭尾同一級只寫一個等級，不寫成 Lv.30–30", () => {
    expect(levelRange(30, 30)).toBe("Lv.30");
    expect(levelRange(21, 30)).toBe("Lv.21–30");
  });
});
