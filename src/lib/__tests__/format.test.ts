import { describe, expect, it } from "vitest";
import { equipStatLabel, equipStatValue, levelRange, respawnText, sourceLabels } from "@/lib/format";

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

describe("裝備的需求職業", () => {
  it("欄位寫「需求職業」，不露出英文 reqJob", () => {
    expect(equipStatLabel("reqJob")).toBe("需求職業");
  });

  it("單一職業系寫職業名，不寫數字", () => {
    expect(equipStatValue("reqJob", 1)).toBe("劍士");
    expect(equipStatValue("reqJob", 2)).toBe("法師");
    expect(equipStatValue("reqJob", 4)).toBe("弓箭手");
    expect(equipStatValue("reqJob", 8)).toBe("盜賊");
    expect(equipStatValue("reqJob", 16)).toBe("海盜");
  });

  it("好幾個職業系都能用時用頓號串起來", () => {
    expect(equipStatValue("reqJob", 3)).toBe("劍士、法師");
    expect(equipStatValue("reqJob", 9)).toBe("劍士、盜賊");
    expect(equipStatValue("reqJob", 13)).toBe("劍士、弓箭手、盜賊");
  });

  it("-1 是只有初心者能用，0 是不限職業", () => {
    expect(equipStatValue("reqJob", -1)).toBe("初心者");
    expect(equipStatValue("reqJob", 0)).toBe("不限職業");
  });

  it("認不得的值照原值寫，不猜職業", () => {
    expect(equipStatValue("reqJob", 32)).toBe("32");
    expect(equipStatValue("reqJob", -2)).toBe("-2");
  });

  it("其他欄位照原值，不會被當成職業解讀", () => {
    expect(equipStatValue("reqLevel", 8)).toBe("8");
  });
});

describe("裝備的攻擊速度", () => {
  it("寫遊戲裡的字、括號附數字：4、5 都是快，7、8 都是慢", () => {
    expect(equipStatValue("attackSpeed", 2)).toBe("更快（2）");
    expect(equipStatValue("attackSpeed", 3)).toBe("更快（3）");
    expect(equipStatValue("attackSpeed", 4)).toBe("快（4）");
    expect(equipStatValue("attackSpeed", 5)).toBe("快（5）");
    expect(equipStatValue("attackSpeed", 6)).toBe("普通（6）");
    expect(equipStatValue("attackSpeed", 7)).toBe("慢（7）");
    expect(equipStatValue("attackSpeed", 8)).toBe("慢（8）");
    expect(equipStatValue("attackSpeed", 9)).toBe("比較慢（9）");
  });

  it("認不得的值照原值寫，不猜快慢", () => {
    expect(equipStatValue("attackSpeed", 1)).toBe("1");
    expect(equipStatValue("attackSpeed", 10)).toBe("10");
  });
});

describe("裝備欄位", () => {
  it("一件佔兩格的寫出來：雙手武器不能配盾、上衣褲裙一起佔", () => {
    expect(equipStatValue("islot", "WpSi")).toBe("雙手，不能配盾");
    expect(equipStatValue("islot", "MaPn")).toBe("上衣＋褲裙（佔兩格）");
  });

  it("只佔一格的不顯示——標題已經寫了帽子、槍", () => {
    expect(equipStatValue("islot", "Cp")).toBeNull();
    expect(equipStatValue("islot", "Wp")).toBeNull();
    expect(equipStatValue("islot", "HrCp")).toBeNull();
  });
});

describe("裝備數值的欄位名寫遊戲說明框的字", () => {
  it("攻擊力、魔法攻擊力、防禦力、魔法防禦力、命中率、迴避率、HP、MP、可使用捲軸次數（經典版客戶端的字）", () => {
    expect(equipStatLabel("incPAD")).toBe("攻擊力");
    expect(equipStatLabel("incMAD")).toBe("魔法攻擊力");
    expect(equipStatLabel("incPDD")).toBe("防禦力");
    expect(equipStatLabel("incMDD")).toBe("魔法防禦力");
    expect(equipStatLabel("incACC")).toBe("命中率");
    expect(equipStatLabel("incEVA")).toBe("迴避率");
    expect(equipStatLabel("incMHP")).toBe("HP");
    expect(equipStatLabel("incMMP")).toBe("MP");
    expect(equipStatLabel("tuc")).toBe("可使用捲軸次數");
  });

  it("本來就跟遊戲一樣的不動：力量、移動速度、跳躍力", () => {
    expect(equipStatLabel("incSTR")).toBe("力量");
    expect(equipStatLabel("incSpeed")).toBe("移動速度");
    expect(equipStatLabel("incJump")).toBe("跳躍力");
  });
});
