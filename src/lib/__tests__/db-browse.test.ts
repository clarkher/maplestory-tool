import { describe, expect, it } from "vitest";
import { FROM_LIST, collapseByBack, createHistoryTracker, detailSpot, listSignature } from "@/lib/db-browse";

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

describe("收起：從清單點開的用返回，其他的直接把網址的 id 拿掉", () => {
  it("這一筆是在沒有開著別筆時從清單點開的：上一頁就是點之前的清單，用返回", () => {
    expect(collapseByBack({ [FROM_LIST]: "1302000", __NA: true }, "1302000")).toBe(true);
  });

  it("直接打開網址、從別的細節連過來、點開時另一筆還開著：返回會離開這頁或跳回上一筆，所以不用返回", () => {
    expect(collapseByBack(null, "1302000")).toBe(false);
    expect(collapseByBack({ __NA: true }, "1302000")).toBe(false);
    expect(collapseByBack({ [FROM_LIST]: "1302001" }, "1302000")).toBe(false);
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
});
