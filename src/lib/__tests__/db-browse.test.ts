import { describe, expect, it } from "vitest";
import { FROM_DOC, FROM_LIST, collapseByBack, createHistoryTracker, detailSpot, fromListMark, listSignature, searchEntries } from "@/lib/db-browse";

describe("細節卡放哪裡", () => {
  it("桌機：右邊那一欄（沒選也是，那裡寫「左邊選一個看細節」）", () => {
    expect(detailSpot({ wide: true, selected: "1302000", hasDetail: true, shown: true })).toBe("side");
    expect(detailSpot({ wide: true, selected: null, hasDetail: false, shown: false })).toBe("side");
  });

  it("手機：那一筆在清單上，就展開在它下面", () => {
    expect(detailSpot({ wide: false, selected: "1302000", hasDetail: true, shown: true })).toBe("inline");
  });

  it("手機：那一筆不在清單上（還沒載到、被搜尋篩掉），放在清單最上面", () => {
    expect(detailSpot({ wide: false, selected: "1302000", hasDetail: true, shown: false })).toBe("top");
  });

  it("手機：沒選、或網址的 id 找不到，就不放", () => {
    expect(detailSpot({ wide: false, selected: null, hasDetail: false, shown: false })).toBeNull();
    expect(detailSpot({ wide: false, selected: "999999999", hasDetail: false, shown: false })).toBeNull();
  });
});

describe("清單真的換了，才從頭顯示 60 筆", () => {
  const list = (...ids: string[]) => ids.map(id => ({ id }));

  it("內容一樣只是重算（角色讀好、10/15 標籤冒出來），不算換，按過「再載」的筆數不會被收回去", () => {
    expect(listSignature(list("1", "2", "3"))).toBe(listSignature(list("1", "2", "3")));
  });

  it("篩選、搜尋後筆數或順序不同，就算換了", () => {
    expect(listSignature(list("1", "2", "3"))).not.toBe(listSignature(list("1", "2")));
    expect(listSignature(list("1", "2", "3"))).not.toBe(listSignature(list("3", "2", "1")));
    expect(listSignature(list("1", "2", "3"))).not.toBe(listSignature(list("1", "5", "3")));
  });
});

describe("從清單點開時留記號", () => {
  const nextEntry = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: {} };

  it("沒開著別筆、這一筆紀錄是 Next 管的：留記號，記號帶這份頁面的識別", () => {
    expect(fromListMark(null, nextEntry, "1302000", 1700000000123.5)).toEqual({ [FROM_LIST]: "1302000", [FROM_DOC]: 1700000000123.5 });
  });

  it("開著別筆時點開（網址已經是另一筆，就算畫面還沒更新）：不留，收起時返回會跳回那一筆", () => {
    expect(fromListMark("1302001", nextEntry, "1302000", 1)).toBeNull();
  });

  it("這一筆紀錄不是 Next 管的（例如按過「跳到主要內容」）：不留，返回時 Next 不會換畫面", () => {
    expect(fromListMark(null, null, "1302000", 1)).toBeNull();
    expect(fromListMark(null, {}, "1302000", 1)).toBeNull();
  });
});

describe("收起：從清單點開的用返回，其他的直接把網址的 id 拿掉", () => {
  it("同一份頁面裡從清單點開的這一筆：上一頁就是點之前的清單，用返回", () => {
    expect(collapseByBack({ [FROM_LIST]: "1302000", [FROM_DOC]: 7, __NA: true }, "1302000", 7)).toBe(true);
  });

  it("重新整理過（或手機把分頁收掉又重開）：上一頁屬於舊的頁面，返回會整頁重載，所以不用返回", () => {
    expect(collapseByBack({ [FROM_LIST]: "1302000", [FROM_DOC]: 7, __NA: true }, "1302000", 8)).toBe(false);
  });

  it("直接打開網址、從別的細節連過來、點開時另一筆還開著：返回會離開這頁或跳回上一筆，所以不用返回", () => {
    expect(collapseByBack(null, "1302000", 7)).toBe(false);
    expect(collapseByBack({ __NA: true }, "1302000", 7)).toBe(false);
    expect(collapseByBack({ [FROM_LIST]: "1302001", [FROM_DOC]: 7 }, "1302000", 7)).toBe(false);
  });
});

describe("這次換頁是不是按上一頁／下一頁", () => {
  it("按了上一頁／下一頁：是", () => {
    const target = new EventTarget();
    const history = createHistoryTracker(target);
    expect(history.cameFromHistory()).toBe(false);
    target.dispatchEvent(new Event("popstate"));
    expect(history.cameFromHistory()).toBe(true);
  });

  it("按上一頁時通知一次（還原位置時直接跳，不要一路滑），之後第一次自己操作再通知一次（恢復平滑捲動）", () => {
    const target = new EventTarget();
    const calls: string[] = [];
    createHistoryTracker(target, { onTraverse: () => calls.push("上一頁"), onFresh: () => calls.push("自己操作") });
    target.dispatchEvent(new Event("pointerdown"));
    expect(calls).toEqual([]);
    target.dispatchEvent(new Event("popstate"));
    target.dispatchEvent(new Event("pointerdown"));
    target.dispatchEvent(new Event("keydown"));
    expect(calls).toEqual(["上一頁", "自己操作"]);
  });

  it("之後自己點了連結、按了按鍵：接下來的換頁是新的，不是上一頁", () => {
    const target = new EventTarget();
    const history = createHistoryTracker(target);
    target.dispatchEvent(new Event("popstate"));
    target.dispatchEvent(new Event("pointerdown"));
    expect(history.cameFromHistory()).toBe(false);
    target.dispatchEvent(new Event("popstate"));
    target.dispatchEvent(new Event("keydown"));
    expect(history.cameFromHistory()).toBe(false);
  });

  it("讀螢幕軟體按連結只送 click：也算自己操作", () => {
    const target = new EventTarget();
    const history = createHistoryTracker(target);
    target.dispatchEvent(new Event("popstate"));
    target.dispatchEvent(new Event("click"));
    expect(history.cameFromHistory()).toBe(false);
  });
});

describe("搜尋結果的順序", () => {
  const list = [
    { id: "1", name: "劍士冒險家表揚狀" },
    { id: "2", name: "長槍", keywords: "槍 劍士" },
    { id: "3", name: "木劍", keywords: "雙手劍 劍士、弓箭手、盜賊" },
    { id: "4", name: "紅色藥水" },
    { id: "5", name: "劍士轉職證明書" },
  ];
  const names = (rows: ReadonlyArray<{ name: string }>) => rows.map(row => row.name);

  it("沒打字：清單原樣", () => {
    expect(names(searchEntries(list, "  "))).toEqual(["劍士冒險家表揚狀", "長槍", "木劍", "紅色藥水", "劍士轉職證明書"]);
  });

  it("名字開頭符合的排前面，再來是名字或關鍵字含這個字的；各組照清單順序", () => {
    expect(names(searchEntries(list, "劍士"))).toEqual(["劍士冒險家表揚狀", "劍士轉職證明書", "長槍", "木劍"]);
  });

  it("打編號：編號完全一樣的算開頭符合", () => {
    expect(names(searchEntries(list, "4"))).toEqual(["紅色藥水"]);
  });

  it("指定要排最前面的（例如搜「劍士」時劍士能用的裝備）：照清單順序排在最前面，其他照原本的分組", () => {
    expect(names(searchEntries(list, "劍士", new Set(["2", "3"])))).toEqual(["長槍", "木劍", "劍士冒險家表揚狀", "劍士轉職證明書"]);
  });

  it("指定的如果根本不符合搜尋字，不會被硬塞進結果", () => {
    expect(names(searchEntries(list, "劍士", new Set(["4"])))).toEqual(["劍士冒險家表揚狀", "劍士轉職證明書", "長槍", "木劍"]);
  });
});
