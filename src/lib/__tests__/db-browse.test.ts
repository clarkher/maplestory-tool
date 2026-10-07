import { describe, expect, it } from "vitest";
import {
  AUTO_MORE_MAX, CARD, FROM_DOC, FROM_LIST, MORE_STEP, cardOf, collapseByBack, createHistoryTracker, detailSpot, fromListMark, isTraversal, keptFromHistory,
  listSignature, moreRows, needsRescue, sameRowAction, scrollMotion, searchEntries, withCard,
} from "@/lib/db-browse";

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

describe("捲動照系統的「減少動態效果」", () => {
  const media = (...matching: string[]) => (query: string) => ({ matches: matching.includes(query) });

  it("系統開了減少動態效果：直接跳", () => {
    expect(scrollMotion(media("(prefers-reduced-motion: reduce)"))).toBe("instant");
  });

  it("沒開（或系統沒有這個設定）：照舊平滑捲過去", () => {
    expect(scrollMotion(media())).toBe("smooth");
    expect(scrollMotion(media("(prefers-reduced-motion: no-preference)"))).toBe("smooth");
  });
});

describe("同一筆開著時，卡片留在原位", () => {
  it("原本放在清單最上面：後來清單多載、把那一筆載進來了，還是放最上面", () => {
    expect(detailSpot({ wide: false, selected: "1302000", hasDetail: true, shown: true, kept: { id: "1302000", spot: "top" } })).toBe("top");
  });

  it("原本展開在那一列下面、那一列還在清單上：留在原處", () => {
    expect(detailSpot({ wide: false, selected: "1302000", hasDetail: true, shown: true, kept: { id: "1302000", spot: "inline" } })).toBe("inline");
  });

  it("原本展開在那一列下面、那一列被搜尋或篩選拿掉了（原本的位置畫不出來）：移到最上面", () => {
    expect(detailSpot({ wide: false, selected: "1302000", hasDetail: true, shown: false, kept: { id: "1302000", spot: "inline" } })).toBe("top");
  });

  it("換了一筆：重新決定", () => {
    expect(detailSpot({ wide: false, selected: "1302000", hasDetail: true, shown: true, kept: { id: "1302001", spot: "top" } })).toBe("inline");
    expect(detailSpot({ wide: false, selected: "1302000", hasDetail: true, shown: false, kept: { id: "1302001", spot: "inline" } })).toBe("top");
  });

  it("剛從桌機換成手機（原本在右邊那一欄）：重新決定", () => {
    expect(detailSpot({ wide: false, selected: "1302000", hasDetail: true, shown: true, kept: { id: "1302000", spot: "side" } })).toBe("inline");
    expect(detailSpot({ wide: false, selected: "1302000", hasDetail: true, shown: false, kept: { id: "1302000", spot: "side" } })).toBe("top");
  });

  it("桌機一律在右邊；找不到那一筆就不放", () => {
    expect(detailSpot({ wide: true, selected: "1302000", hasDetail: true, shown: true, kept: { id: "1302000", spot: "top" } })).toBe("side");
    expect(detailSpot({ wide: false, selected: "1302000", hasDetail: false, shown: false, kept: { id: "1302000", spot: "top" } })).toBeNull();
  });
});

describe("點了開著的那一筆", () => {
  it("桌機：細節在右邊，捲過去", () => {
    expect(sameRowAction({ wide: true, spot: "side" })).toBe("scroll");
  });

  it("手機、卡片展開在那一列下面：收起", () => {
    expect(sameRowAction({ wide: false, spot: "inline" })).toBe("collapse");
  });

  it("手機、卡片放在清單最上面（那一筆後來才載進清單）：卡片搬到那一列下面", () => {
    expect(sameRowAction({ wide: false, spot: "top" })).toBe("move");
  });

  it("手機、網址的 id 找不到（沒有卡片）：收起，把網址的 id 拿掉", () => {
    expect(sameRowAction({ wide: false, spot: null })).toBe("collapse");
  });
});

describe("每筆紀錄記下這張卡片：哪一頁、哪一筆、在頁面上的位置、放在哪裡", () => {
  const nextEntry = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: 1 } };
  const card = { id: "1302000", at: 2410, spot: "top" as const, page: "/db/items" };

  it("記下來時，Next 的紀錄和「從清單點開」的記號都留著", () => {
    expect(withCard({ ...nextEntry, [FROM_LIST]: "1302000", [FROM_DOC]: 7 }, card)).toEqual({
      __NA: true,
      __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: 1 },
      [FROM_LIST]: "1302000",
      [FROM_DOC]: 7,
      [CARD]: { id: "1302000", at: 2410, spot: "top", page: "/db/items" },
    });
  });

  it("位置、放哪裡都沒變：不用再寫一次", () => {
    expect(withCard({ ...nextEntry, [CARD]: { id: "1302000", at: 2410, spot: "top", page: "/db/items" } }, card)).toBeNull();
  });

  it("卡片搬了（最上面 → 那一列下面）或位置變了：要再寫", () => {
    expect(withCard({ ...nextEntry, [CARD]: { id: "1302000", at: 2410, spot: "inline", page: "/db/items" } }, card)).toEqual({
      ...nextEntry,
      [CARD]: { id: "1302000", at: 2410, spot: "top", page: "/db/items" },
    });
    expect(withCard({ ...nextEntry, [CARD]: { id: "1302000", at: 380, spot: "top", page: "/db/items" } }, card)).toEqual({
      ...nextEntry,
      [CARD]: { id: "1302000", at: 2410, spot: "top", page: "/db/items" },
    });
  });

  it("不是 Next 管的紀錄（例如按過「跳到主要內容」，紀錄是空的）：不寫——寫了之後按返回、下一頁到這筆，Next 會整頁重載", () => {
    expect(withCard(null, card)).toBeNull();
    expect(withCard({}, card)).toBeNull();
    expect(withCard({ [FROM_LIST]: "1302000" }, card)).toBeNull();
  });

  it("讀回來：沒記過、或記壞了，就當沒記", () => {
    expect(cardOf({ ...nextEntry, [CARD]: { id: "1302000", at: 2410, spot: "inline", page: "/db/items" } })).toEqual({
      id: "1302000",
      at: 2410,
      spot: "inline",
      page: "/db/items",
    });
    expect(cardOf(nextEntry)).toBeUndefined();
    expect(cardOf(null)).toBeUndefined();
    expect(cardOf({ [CARD]: { id: "1302000", at: "2410", spot: "top", page: "/db/items" } })).toBeUndefined();
    expect(cardOf({ [CARD]: { id: 1302000, at: 2410, spot: "top", page: "/db/items" } })).toBeUndefined();
    expect(cardOf({ [CARD]: { id: "1302000", at: 2410, spot: "side", page: "/db/items" } })).toBeUndefined();
    expect(cardOf({ [CARD]: { id: "1302000", at: 2410, spot: "top" } })).toBeUndefined();
  });
});

describe("按返回、下一頁、重新整理回到開著卡片的那一筆：卡片照這筆紀錄放（不搬家）", () => {
  const entry = (card: unknown) => ({ __NA: true, [CARD]: card });

  it("紀錄記的就是這一頁的這一筆：照記的放", () => {
    expect(keptFromHistory(entry({ id: "1302000", at: 330, spot: "top", page: "/db/items" }), "1302000", "/db/items")).toEqual({
      id: "1302000",
      spot: "top",
    });
    expect(keptFromHistory(entry({ id: "1302000", at: 570, spot: "inline", page: "/db/items" }), "1302000", "/db/items")).toEqual({
      id: "1302000",
      spot: "inline",
    });
  });

  it("紀錄記的是別筆、沒記過、或沒開著卡片：不照紀錄", () => {
    expect(keptFromHistory(entry({ id: "1302001", at: 330, spot: "top", page: "/db/items" }), "1302000", "/db/items")).toBeNull();
    expect(keptFromHistory({ __NA: true }, "1302000", "/db/items")).toBeNull();
    expect(keptFromHistory(entry({ id: "1302000", at: 330, spot: "top", page: "/db/items" }), null, "/db/items")).toBeNull();
  });

  it("別頁剛好同一個編號（從怪物卡連到道具頁，換頁那一下還讀到上一頁的紀錄）：不照紀錄", () => {
    expect(keptFromHistory(entry({ id: "1002000", at: 330, spot: "top", page: "/db/monsters" }), "1002000", "/db/items")).toBeNull();
  });
});

describe("按返回後位置對不上的補救：清單變了、而且那一筆和卡片都不在畫面上，才跳過去", () => {
  // 375×812 的手機，導覽列高 66
  const view = { viewTop: 66, viewBottom: 812 };

  it("清單沒變（卡片在頁面上的位置跟離開時一樣）：不動——就算卡片不在畫面上（離開前自己捲去看清單別處）", () => {
    expect(needsRescue({ leftAt: 2410, nowAt: 2410, top: -1900, bottom: -1100, ...view })).toBe(false);
  });

  it("位置只差幾 px（字型載入之類）：不算變", () => {
    expect(needsRescue({ leftAt: 2410, nowAt: 2414, top: -1900, bottom: -1100, ...view })).toBe(false);
  });

  it("差 8px 還不算變，差 9px 就算", () => {
    expect(needsRescue({ leftAt: 2410, nowAt: 2418, top: -1900, bottom: -1100, ...view })).toBe(false);
    expect(needsRescue({ leftAt: 2410, nowAt: 2419, top: -1900, bottom: -1100, ...view })).toBe(true);
    expect(needsRescue({ leftAt: 2410, nowAt: 2401, top: -1900, bottom: -1100, ...view })).toBe(true);
  });

  it("剛好貼著導覽列下緣、或剛好貼著畫面底：都還看不到，算不在畫面上", () => {
    expect(needsRescue({ leftAt: 2410, nowAt: 380, top: -700, bottom: 66, ...view })).toBe(true);
    expect(needsRescue({ leftAt: 380, nowAt: 2410, top: 812, bottom: 1600, ...view })).toBe(true);
  });

  it("清單變了、那一筆和卡片都在畫面上面：跳過去", () => {
    expect(needsRescue({ leftAt: 2410, nowAt: 380, top: -1700, bottom: -900, ...view })).toBe(true);
  });

  it("清單變了、那一筆和卡片都在畫面下面：跳過去", () => {
    expect(needsRescue({ leftAt: 380, nowAt: 2410, top: 1300, bottom: 2100, ...view })).toBe(true);
  });

  it("清單變了、整張卡片躲在導覽列後面：算不在畫面上", () => {
    expect(needsRescue({ leftAt: 2410, nowAt: 380, top: -700, bottom: 60, ...view })).toBe(true);
  });

  it("清單變了、但卡片還看得到一部分（導覽列下面露出一截、或從畫面底部露出來）：不動", () => {
    expect(needsRescue({ leftAt: 2410, nowAt: 380, top: -700, bottom: 120, ...view })).toBe(false);
    expect(needsRescue({ leftAt: 380, nowAt: 2410, top: 700, bottom: 1500, ...view })).toBe(false);
  });

  it("這筆紀錄沒記過位置（例如更新前留下的）：交給瀏覽器，不動", () => {
    expect(needsRescue({ leftAt: undefined, nowAt: 380, top: -1700, bottom: -900, ...view })).toBe(false);
  });
});

describe("這次換的網址是不是按上一頁／下一頁來的", () => {
  const tracker = (traversing: boolean) => ({ cameFromHistory: () => traversing });

  it("popstate 正在發（同一頁按返回，Next 在 popstate 之後馬上重畫，那時候自己的監聽還沒跑到）：是", () => {
    expect(isTraversal(tracker(false), new Event("popstate"))).toBe(true);
  });

  it("自己的監聽已經收到 popstate（重畫晚一點才跑）：是", () => {
    expect(isTraversal(tracker(true), undefined)).toBe(true);
  });

  it("都不是（點清單、點連結、重新整理）：不是", () => {
    expect(isTraversal(tracker(false), undefined)).toBe(false);
    expect(isTraversal(tracker(false), new Event("click"))).toBe(false);
    expect(isTraversal(null, undefined)).toBe(false);
  });
});

describe("清單下面怎麼多載：自動接到 600 筆就停，換成看得到的按鈕（頁尾才滑得到）", () => {
  it("一次多 120 筆，自動接到剛好 600 筆", () => {
    expect(MORE_STEP).toBe(120);
    expect(AUTO_MORE_MAX).toBe(600);
  });

  it("還沒到 600 筆：捲到底自動接 120 筆", () => {
    expect(moreRows(60, 5000)).toEqual({ mode: "auto", next: 180, count: 120 });
  });

  it("差一點到 600 筆：自動接到剛好 600 就停", () => {
    expect(moreRows(540, 5000)).toEqual({ mode: "auto", next: 600, count: 60 });
  });

  it("到了 600 筆：換成按鈕，按一次多 120 筆", () => {
    expect(moreRows(600, 5000)).toEqual({ mode: "button", next: 720, count: 120 });
    expect(moreRows(720, 5000)).toEqual({ mode: "button", next: 840, count: 120 });
  });

  it("以前自動接過頭（記住的筆數超過 600、又不是 120 的倍數）：一樣是按鈕", () => {
    expect(moreRows(660, 5000)).toEqual({ mode: "button", next: 780, count: 120 });
  });

  it("剩下不到 120 筆：按鈕寫實際剩幾筆", () => {
    expect(moreRows(600, 650)).toEqual({ mode: "button", next: 720, count: 50 });
    expect(moreRows(60, 100)).toEqual({ mode: "auto", next: 180, count: 40 });
  });

  it("全部列完了：不用再載", () => {
    expect(moreRows(180, 180)).toBeNull();
    expect(moreRows(720, 650)).toBeNull();
  });
});
