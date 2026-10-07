import { describe, expect, it } from "vitest";
import {
  canJobUse, compareItems, equipGroups, itemKeywords, itemNote, shopGroups, wearFit, jobLabel, sortCategories, subcategoryOptions, usableBy,
} from "@/lib/item-view";
import type { Item } from "@/lib/types";

const spear: Item = {
  id: 1432011, n: "佛羅利刃", c: "裝備", s: "槍",
  eq: { reqLevel: 90, reqJob: 1, reqSTR: 280, incPAD: 97, tuc: 7 },
};
const sake: Item = {
  id: 1422011, n: "清酒", c: "裝備", s: "雙手棍",
  eq: { reqLevel: 30, reqJob: -1, reqSTR: 110, incPAD: 100 },
};
const medal: Item = { id: 1142094, n: "10日夢勳章", c: "裝備", s: "勳章", eq: { incSTR: 1, incACC: 1 } };
const fashionHat: Item = { id: 1000000, n: "時裝帽", c: "時裝", s: "帽子", eq: { incPDD: 1 } };
const potion: Item = { id: 2000000, n: "紅色藥水", c: "消耗", s: "藥水" };

// 職業代碼：0 初心者、130 槍騎兵（劍士系）、210 火毒巫師（法師系）、410 刺客（盜賊系）
describe("職業能不能用這件裝備", () => {
  it("沒有職業限制的誰都能用，初心者也行", () => {
    expect(canJobUse(undefined, 130)).toBe(true);
    expect(canJobUse(undefined, 0)).toBe(true);
    expect(canJobUse(0, 210)).toBe(true);
  });

  it("職業系對得上才能用：槍騎兵能用劍士（1）、劍士＋盜賊（9），不能用法師（2）", () => {
    expect(canJobUse(1, 130)).toBe(true);
    expect(canJobUse(9, 130)).toBe(true);
    expect(canJobUse(9, 410)).toBe(true);
    expect(canJobUse(2, 130)).toBe(false);
    expect(canJobUse(13, 210)).toBe(false);
  });

  it("五個職業系各自對上自己的位元（1 劍士、2 法師、4 弓箭手、8 盜賊、16 海盜），二轉三轉照一轉的系", () => {
    const table: Array<[number, number]> = [[1, 111], [2, 230], [4, 320], [8, 421], [16, 510]];
    for (const [bit, job] of table) {
      expect(canJobUse(bit, job)).toBe(true);
      for (const [otherBit] of table) if (otherBit !== bit) expect(canJobUse(otherBit, job)).toBe(false);
    }
  });

  it("-1 只有初心者能用；初心者不能用有職業限制的", () => {
    expect(canJobUse(-1, 0)).toBe(true);
    expect(canJobUse(-1, 130)).toBe(false);
    expect(canJobUse(1, 0)).toBe(false);
  });

  it("認不得的值或認不得的職業代碼回 null，不猜能不能用", () => {
    expect(canJobUse(32, 130)).toBeNull();
    expect(canJobUse(-2, 130)).toBeNull();
    expect(canJobUse(1, 999)).toBeNull();
  });
});

describe("穿戴條件旁的小標籤（對照角色列的職業和等級）", () => {
  it("職業對、等級夠：藍色「槍騎兵能用」", () => {
    expect(wearFit(spear, { job: 130, level: 95 })).toEqual({ tone: "sky", text: "槍騎兵能用" });
    expect(wearFit(spear, { job: 130, level: 90 })).toEqual({ tone: "sky", text: "槍騎兵能用" });
  });

  it("職業對、等級不夠：金色「槍騎兵還差 55 級」", () => {
    expect(wearFit(spear, { job: 130, level: 35 })).toEqual({ tone: "gold", text: "槍騎兵還差 55 級" });
  });

  it("職業不對：紅色「火毒巫師不能用」，等級夠不夠都一樣", () => {
    expect(wearFit(spear, { job: 210, level: 95 })).toEqual({ tone: "maple", text: "火毒巫師不能用" });
    expect(wearFit(spear, { job: 210, level: 35 })).toEqual({ tone: "maple", text: "火毒巫師不能用" });
  });

  it("初心者專用武器：初心者看等級，其他職業不能用", () => {
    expect(wearFit(sake, { job: 0, level: 20 })).toEqual({ tone: "gold", text: "初心者還差 10 級" });
    expect(wearFit(sake, { job: 0, level: 30 })).toEqual({ tone: "sky", text: "初心者能用" });
    expect(wearFit(sake, { job: 130, level: 95 })).toEqual({ tone: "maple", text: "槍騎兵不能用" });
  });

  it("沒有職業和等級限制的裝備：誰都能用", () => {
    expect(wearFit(medal, { job: 410, level: 10 })).toEqual({ tone: "sky", text: "刺客能用" });
  });

  it("還沒選職業、沒填等級、不是裝備（藥水、時裝）、職業值認不得：都不顯示", () => {
    expect(wearFit(spear, { job: -1, level: 50 })).toBeNull();
    expect(wearFit(spear, { job: 130, level: 0 })).toBeNull();
    expect(wearFit(potion, { job: 130, level: 95 })).toBeNull();
    expect(wearFit(fashionHat, { job: 130, level: 95 })).toBeNull();
    expect(wearFit({ ...spear, eq: { ...spear.eq, reqJob: 32 } }, { job: 130, level: 95 })).toBeNull();
  });
});

describe("裝備數值拆成「穿戴條件」和「裝備數值」兩組", () => {
  it("需求等級、職業、力量放穿戴條件，其他放裝備數值", () => {
    expect(equipGroups(spear)).toEqual({
      requirements: [["需求等級", "90"], ["需求職業", "劍士"], ["需求力量", "280"]],
      stats: [["攻擊力", "97"], ["可使用捲軸次數", "7"]],
    });
  });

  it("穿戴條件照固定順序排（等級、職業、力量…），不管資料裡的順序", () => {
    const shuffled: Item = { id: 1, n: "測試劍", c: "裝備", s: "單手劍", eq: { incPAD: 5, reqSTR: 20, reqJob: 1, reqLevel: 10 } };
    expect(equipGroups(shuffled)).toEqual({
      requirements: [["需求等級", "10"], ["需求職業", "劍士"], ["需求力量", "20"]],
      stats: [["攻擊力", "5"]],
    });
  });

  it("裝備沒寫職業限制時補一格「不限職業」，排在需求等級後面", () => {
    expect(equipGroups(medal).requirements).toEqual([["需求職業", "不限職業"]]);
    const shield: Item = { id: 2, n: "測試盾", c: "裝備", s: "盾牌", eq: { reqLevel: 10, incPDD: 3 } };
    expect(equipGroups(shield).requirements).toEqual([["需求等級", "10"], ["需求職業", "不限職業"]]);
  });

  it("時裝不補「不限職業」；沒有數值的道具兩組都是空的", () => {
    expect(equipGroups(fashionHat)).toEqual({ requirements: [], stats: [["防禦力", "1"]] });
    expect(equipGroups(potion)).toEqual({ requirements: [], stats: [] });
  });

  it("武器先排攻擊力、攻擊速度（挑武器時一起看），其他照資料順序", () => {
    const bow: Item = {
      id: 1452003, n: "測試弓", c: "裝備", s: "弓",
      eq: { reqLevel: 35, reqJob: 4, incDEX: 2, incPAD: 50, tuc: 7, islot: "WpSi", attackSpeed: 5 },
    };
    expect(equipGroups(bow).stats).toEqual([
      ["攻擊力", "50"], ["攻擊速度", "快（5）"], ["敏捷", "2"], ["可使用捲軸次數", "7"], ["裝備欄位", "雙手，不能配盾"],
    ]);
  });

  it("沒有攻擊速度的（手套也有攻擊力）照資料順序，不搬", () => {
    const glove: Item = { id: 1082000, n: "測試手套", c: "手套", s: "手套", eq: { incDEX: 1, incPAD: 2, incPDD: 3 } };
    expect(equipGroups(glove).stats).toEqual([["敏捷", "1"], ["攻擊力", "2"], ["防禦力", "3"]]);
  });

  it("只佔一格的裝備欄位不給格子；攻擊速度照樣寫成字", () => {
    const oneSlot: Item = { ...spear, eq: { ...spear.eq, islot: "Wp", attackSpeed: 6 } };
    expect(equipGroups(oneSlot).stats).toEqual([["攻擊力", "97"], ["攻擊速度", "普通（6）"], ["可使用捲軸次數", "7"]]);
  });

  it("「佔兩格」只寫真的套服（105 開頭）跟雙手武器（14 開頭）；標題寫上衣的上衣、武器外觀不寫，免得跟標題打架", () => {
    const overall: Item = { id: 1051000, n: "鋼鐵鎧甲", c: "裝備", s: "套服", eq: { incPDD: 28, islot: "MaPn" } };
    expect(equipGroups(overall).stats).toEqual([["防禦力", "28"], ["裝備欄位", "上衣＋褲裙（佔兩格）"]]);
    const top: Item = { id: 1042167, n: "樸素的武士上衣", c: "裝備", s: "上衣", eq: { incPDD: 3, islot: "MaPn" } };
    expect(equipGroups(top).stats).toEqual([["防禦力", "3"]]);
    const cover: Item = { id: 1702000, n: "測試武器外觀", c: "時裝", s: "武器外觀", eq: { islot: "WpSi" } };
    expect(equipGroups(cover).stats).toEqual([]);
  });

  it("只剩不顯示的欄位時「裝備數值」是空的，道具頁不會多一組空的", () => {
    const wig: Item = { id: 1000030, n: "薩基爾假髮", c: "時裝", s: "帽子", eq: { islot: "HrCp" } };
    expect(equipGroups(wig)).toEqual({ requirements: [], stats: [] });
  });
});

describe("職業的稱呼", () => {
  it("職業代碼寫成職業名，0 是初心者，認不得的回 null", () => {
    expect(jobLabel(130)).toBe("槍騎兵");
    expect(jobLabel(0)).toBe("初心者");
    expect(jobLabel(-1)).toBeNull();
    expect(jobLabel(999)).toBeNull();
  });
});

describe("篩選「只看我的職業能用的裝備」", () => {
  it("槍騎兵能用劍士武器、沒有職業限制的裝備，不能用法師武器", () => {
    expect(usableBy(spear, 130)).toBe(true);
    expect(usableBy(medal, 130)).toBe(true);
    expect(usableBy(spear, 210)).toBe(false);
  });

  it("初心者專用武器只有初心者能用", () => {
    expect(usableBy(sake, 0)).toBe(true);
    expect(usableBy(sake, 130)).toBe(false);
  });

  it("時裝、消耗品、沒有數值的裝備、認不得的職業值都不算", () => {
    expect(usableBy(fashionHat, 130)).toBe(false);
    expect(usableBy(potion, 130)).toBe(false);
    expect(usableBy({ id: 1902040, n: "1階段龍", c: "裝備", s: "騎寵" }, 130)).toBe(false);
    expect(usableBy({ ...spear, eq: { ...spear.eq, reqJob: 32 } }, 130)).toBe(false);
  });
});

describe("道具清單的預設排序", () => {
  it("裝備最前面、依需求等級由低到高，沒寫等級的排在裝備最後；再來消耗、其他、裝飾、現金、時裝", () => {
    const shield: Item = { id: 1092000, n: "木盾", c: "裝備", s: "盾牌", eq: { reqLevel: 10 } };
    const quest: Item = { id: 4000000, n: "任務道具", c: "其他", s: "任務道具" };
    const chair: Item = { id: 3010000, n: "椅子", c: "裝飾", s: "椅子" };
    const megaphone: Item = { id: 5071000, n: "喇叭", c: "現金", s: "喇叭" };
    const input = [fashionHat, potion, medal, megaphone, spear, chair, quest, shield];
    expect([...input].sort(compareItems).map(item => item.n)).toEqual([
      "木盾", "佛羅利刃", "10日夢勳章", "紅色藥水", "任務道具", "椅子", "喇叭", "時裝帽",
    ]);
  });

  it("同一類、同等級的維持原本的順序（資料本來依名稱排）", () => {
    const first: Item = { id: 1, n: "甲", c: "消耗" };
    const second: Item = { id: 2, n: "乙", c: "消耗" };
    expect([first, second].sort(compareItems).map(item => item.n)).toEqual(["甲", "乙"]);
    expect([second, first].sort(compareItems).map(item => item.n)).toEqual(["乙", "甲"]);
  });

  it("分類下拉也照同一個順序", () => {
    expect(sortCategories(["其他", "時裝", "裝備", "消耗", "現金", "裝飾"])).toEqual(["裝備", "消耗", "其他", "裝飾", "現金", "時裝"]);
  });
});

describe("搜尋也比對職業和種類", () => {
  it("有職業限制的放進職業名：偃月刃（劍士、盜賊）搜「盜賊」「短刀」都找得到", () => {
    const dagger: Item = { id: 1332009, n: "偃月刃", c: "裝備", s: "短刀", d: "鋒利的刀", eq: { reqLevel: 30, reqJob: 9 } };
    const keywords = itemKeywords(dagger);
    expect(keywords).toContain("盜賊");
    expect(keywords).toContain("短刀");
    expect(keywords).toContain("鋒利的刀");
  });

  it("沒有職業限制的不放職業名，免得搜「劍士」被全職業裝備洗版", () => {
    expect(itemKeywords(medal)).not.toContain("劍士");
    expect(itemKeywords(medal)).toContain("勳章");
  });

  it("初心者專用的搜「初心者」找得到；認不得的職業值不把數字塞進去", () => {
    expect(itemKeywords(sake)).toContain("初心者");
    expect(itemKeywords({ ...spear, eq: { ...spear.eq, reqJob: 32 } })).not.toContain("32");
  });
});

describe("種類下拉", () => {
  it("只列這個分類裡有的種類，件數多的排前面", () => {
    const list: Item[] = [
      { id: 1, n: "a", c: "裝備", s: "槍" },
      { id: 2, n: "b", c: "裝備", s: "帽子" },
      { id: 3, n: "c", c: "裝備", s: "帽子" },
      { id: 4, n: "d", c: "消耗", s: "藥水" },
      { id: 5, n: "e", c: "裝備" },
    ];
    expect(subcategoryOptions(list, "裝備")).toEqual(["帽子", "槍"]);
    expect(subcategoryOptions(list, "消耗")).toEqual(["藥水"]);
  });
});

describe("道具清單右邊的小字", () => {
  it("武器寫種類＋攻擊速度：矛 · 慢（8）", () => {
    const mop: Item = { id: 1442004, n: "拖把", c: "裝備", s: "矛", eq: { incPAD: 47, attackSpeed: 8 } };
    expect(itemNote(mop)).toBe("矛 · 慢（8）");
  });

  it("不是武器的只寫種類，沒有種類寫分類", () => {
    expect(itemNote(medal)).toBe("勳章");
    expect(itemNote({ id: 4000000, n: "任務道具", c: "其他" })).toBe("其他");
  });

  it("認不得的攻擊速度不寫，不露出光禿禿的數字", () => {
    const odd: Item = { id: 1442999, n: "測試矛", c: "裝備", s: "矛", eq: { attackSpeed: 12 } };
    expect(itemNote(odd)).toBe("矛");
  });
});

describe("哪裡買得到", () => {
  it("同一個價錢的店家排在一起，價錢只寫一次；有舊版資料要標", () => {
    const mop: Item = {
      id: 1442004, n: "拖把", c: "裝備", s: "矛",
      sp: [
        { p: "弓箭手村武器店", n: "克爾", m: 100000101, pr: 24000, o: 1 },
        { p: "勇士之村武器店", n: "利伯", m: 102000001, pr: 24000, o: 1 },
      ],
    };
    expect(shopGroups(mop)).toEqual({
      groups: [{
        price: "24,000 楓幣",
        places: [
          { place: "弓箭手村武器店", npc: "克爾", later: false },
          { place: "勇士之村武器店", npc: "利伯", later: false },
        ],
      }],
      fromOldData: true,
    });
  });

  it("10/15 才開放的店標 later、排在同一組最後；現在去得了的先列（其餘照資料順序）", () => {
    const redPotion: Item = {
      id: 2000000, n: "紅色藥水", c: "消耗", s: "藥水",
      sp: [
        { p: "冰原雪域", n: "哈娜", m: 211000000, pr: 50, o: 1 },
        { p: "弓箭手村雜貨店", n: "露娜", m: 100000102, pr: 50, o: 1 },
        { p: "楓之谷通行證遠端商店", pr: 50 },
      ],
    };
    const opensLater = (mapId: number) => mapId === 211000000;
    expect(shopGroups(redPotion, opensLater).groups[0].places).toEqual([
      { place: "弓箭手村雜貨店", npc: "露娜", later: false },
      { place: "楓之谷通行證遠端商店", later: false },
      { place: "冰原雪域", npc: "哈娜", later: true },
    ]);
    // 沒傳判斷就當全部現在都去得了，照資料順序
    expect(shopGroups(redPotion).groups[0].places.map(place => place.place)).toEqual(["冰原雪域", "弓箭手村雜貨店", "楓之谷通行證遠端商店"]);
  });

  it("商城寫樂豆點、整組賣的寫幾個，不同價錢分開列；全是商城不標舊版", () => {
    const box: Item = { id: 5068302, n: "記憶音樂盒", c: "現金", sp: [{ p: "商城", pr: 220, c: 1 }, { p: "商城", pr: 1980, k: 10, c: 1 }] };
    expect(shopGroups(box)).toEqual({
      groups: [
        { price: "220 樂豆點", places: [{ place: "商城", later: false }] },
        { price: "10 個 1,980 樂豆點", places: [{ place: "商城", later: false }] },
      ],
      fromOldData: false,
    });
  });

  it("沒有店家的道具是空的", () => {
    expect(shopGroups(potion)).toEqual({ groups: [], fromOldData: false });
  });

  it("整組賣的件數也加千分位：2,000 個 1,400 楓幣", () => {
    const arrows: Item = { id: 2060000, n: "箭矢", c: "消耗", s: "箭矢", sp: [{ p: "楓之谷通行證遠端商店", pr: 1400, k: 2000 }] };
    expect(shopGroups(arrows).groups.map(group => group.price)).toEqual(["2,000 個 1,400 楓幣"]);
  });

  it("整組都是 10/15 才開的價錢排在現在買得到的價錢後面", () => {
    const coldHeart: Item = { id: 1492004, n: "冷酷之心", c: "裝備", s: "火槍", sp: [
      { p: "天空之城", n: "妖精 娜麗", m: 200000000, pr: 75000, o: 1 },
      { p: "中央走廊", n: "摩根", m: 120000200, pr: 50000, o: 1 },
    ] };
    const opensLater = (mapId: number) => mapId === 200000000;
    expect(shopGroups(coldHeart, opensLater).groups.map(group => group.price)).toEqual(["50,000 楓幣", "75,000 楓幣"]);
    expect(shopGroups(coldHeart).groups.map(group => group.price)).toEqual(["75,000 楓幣", "50,000 楓幣"]);
  });
});
