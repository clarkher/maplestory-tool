/**
 * 展開的東西重新整理後收回去，頁面變短，捲動位置（reload-scroll 記的像素）就對到別段內容。
 * 所以展開／收起記在「這一筆瀏覽紀錄」上：重新整理、離站再回來、站內按返回都從記下的開始；從選單、連結新點進來照預設。
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { entryKeyOf, visitMemory } from "@/lib/visit-state";

const STORE = "ms-open";

/** 假的 sessionStorage：關掉分頁才清，重新整理還在 */
function fakeSessionStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (name: string) => store.get(name) ?? null,
    setItem: (name: string, value: string) => void store.set(name, value),
  };
}

/**
 * 一個分頁：at.entry 是現在在哪一筆瀏覽紀錄（換頁、按返回就換）；load() 是一次整頁載入（重新整理、離站再回來），
 * 程式重新跑、只剩 sessionStorage 裡的東西
 */
function tab(storage: Pick<Storage, "getItem" | "setItem"> | null = fakeSessionStorage()) {
  const at = { entry: "entry-1" };
  return { at, storage, load: () => visitMemory({ storage, entry: () => at.entry }) };
}

describe("重新整理、離站再回來：從記下的開始", () => {
  it("看細節展開之後重新整理（同一筆紀錄、程式重新載入）：還是展開", () => {
    const t = tab();
    t.load().remember("quest:card:101", true, false);
    expect(t.load().recall("quest:card:101", false)).toBe(true);
  });

  it("沒動過的照預設：預設收著的收著，預設開著的（升級路線你在的那段）開著", () => {
    const memory = tab().load();
    expect(memory.recall("quest:card:101", false)).toBe(false);
    expect(memory.recall("home:band:110:30:30", true)).toBe(true);
  });

  it("收起預設開著的那段也記得：重新整理後還是收著", () => {
    const t = tab();
    t.load().remember("home:band:110:30:30", false, true);
    expect(t.load().recall("home:band:110:30:30", true)).toBe(false);
  });

  it("長任務線點開的那一段（記的是那一段的 id）：重新整理後還是那一段；收回去就回到沒有", () => {
    const t = tab();
    t.load().remember("home:todo:110:45:q-ring:part", "2051", null);
    expect(t.load().recall("home:todo:110:45:q-ring:part", null)).toBe("2051");
    t.load().remember("home:todo:110:45:q-ring:part", null, null);
    expect(t.load().recall("home:todo:110:45:q-ring:part", null)).toBe(null);
  });
});

describe("每一筆瀏覽紀錄各記各的", () => {
  it("從選單重新點進來（新的一筆紀錄）：照預設，不套上一次的展開", () => {
    const t = tab();
    t.load().remember("quest:card:101", true, false);
    t.at.entry = "entry-2";
    expect(t.load().recall("quest:card:101", false)).toBe(false);
  });

  it("按返回回到舊的那一筆：拿回那一筆的展開，新的那一筆也還留著", () => {
    const t = tab();
    const memory = t.load();
    memory.remember("quest:card:101", true, false);
    t.at.entry = "entry-2";
    memory.remember("quest:card:202", true, false);
    t.at.entry = "entry-1";
    expect(memory.recall("quest:card:101", false)).toBe(true);
    expect(memory.recall("quest:card:202", false)).toBe(false);
    t.at.entry = "entry-2";
    expect(t.load().recall("quest:card:202", false)).toBe(true);
    expect(t.load().recall("quest:card:101", false)).toBe(false);
  });
});

describe("最多記 50 筆紀錄，最久沒動的先丟", () => {
  it("第 51 筆有展開的紀錄進來：最早那筆丟掉，其他都還在", () => {
    const t = tab();
    const memory = t.load();
    for (let n = 1; n <= 51; n += 1) {
      t.at.entry = `entry-${n}`;
      memory.remember("quest:card:101", true, false);
    }
    const reloaded = t.load();
    const openAt = (entry: string) => {
      t.at.entry = entry;
      return reloaded.recall("quest:card:101", false);
    };
    expect(openAt("entry-1")).toBe(false);
    expect(openAt("entry-2")).toBe(true);
    expect(openAt("entry-51")).toBe(true);
  });

  it("又動到舊的那一筆：它變成最新的，滿了先丟的是別筆", () => {
    const t = tab();
    const memory = t.load();
    for (let n = 1; n <= 50; n += 1) {
      t.at.entry = `entry-${n}`;
      memory.remember("quest:card:101", true, false);
    }
    t.at.entry = "entry-1";
    memory.remember("quest:card:202", true, false);
    t.at.entry = "entry-51";
    memory.remember("quest:card:101", true, false);
    const reloaded = t.load();
    t.at.entry = "entry-1";
    expect(reloaded.recall("quest:card:101", false)).toBe(true);
    t.at.entry = "entry-2";
    expect(reloaded.recall("quest:card:101", false)).toBe(false);
  });

  it("展開又收回去的紀錄不佔名額：逛 50 頁都開了又關，最早那頁的展開還在", () => {
    const t = tab();
    const memory = t.load();
    memory.remember("quest:card:101", true, false);
    for (let n = 2; n <= 51; n += 1) {
      t.at.entry = `entry-${n}`;
      memory.remember("train:card:1000", true, false);
      memory.remember("train:card:1000", false, false);
    }
    t.at.entry = "entry-1";
    expect(t.load().recall("quest:card:101", false)).toBe(true);
  });
});

describe("讀不到、寫不進去也不能出錯", () => {
  it.each([
    ["不是 JSON", "{oops"],
    ["是陣列", "[1,2]"],
    ["那一筆紀錄不是物件", JSON.stringify({ "entry-1": 5 })],
  ])("存壞了（%s）：當作沒記過，之後照常記", (_label, raw) => {
    const t = tab(fakeSessionStorage({ [STORE]: raw }));
    expect(t.load().recall("quest:card:101", false)).toBe(false);
    t.load().remember("quest:card:101", true, false);
    expect(t.load().recall("quest:card:101", false)).toBe(true);
  });

  it("瀏覽器不讓用 sessionStorage（隱私模式）：不會出錯，這次載入裡站內按返回也還記得", () => {
    const denied = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    const t = tab(denied);
    const memory = t.load();
    memory.remember("quest:card:101", true, false);
    t.at.entry = "entry-2";
    expect(memory.recall("quest:card:101", false)).toBe(false);
    t.at.entry = "entry-1";
    expect(memory.recall("quest:card:101", false)).toBe(true);
  });

  it("沒有 sessionStorage（伺服器上）：用預設值，記了也不出錯", () => {
    const memory = tab(null).load();
    expect(memory.recall("quest:card:101", false)).toBe(false);
    memory.remember("quest:card:101", true, false);
    expect(memory.recall("quest:card:101", false)).toBe(true);
  });
});

describe("哪一筆瀏覽紀錄：跟記捲動位置（reload-scroll）同一把 key", () => {
  const location = { pathname: "/plan/quest", search: "?x=1" };

  it("瀏覽器有 Navigation API：用紀錄的 key（同一個網址點進來兩次也分得開）", () => {
    expect(entryKeyOf({ navigation: { currentEntry: { key: "k-123" } }, location })).toBe("k-123");
  });

  it("沒有 Navigation API：用網址（不含 #）", () => {
    expect(entryKeyOf({ location })).toBe("/plan/quest?x=1");
    expect(entryKeyOf({ navigation: { currentEntry: null }, location })).toBe("/plan/quest?x=1");
  });
});

describe("伺服器先畫好的頁（懶人包）", () => {
  it("伺服器上、接手（hydration）時都先畫預設值，不讀記下的：接手時才跟伺服器畫的一樣，React 不會整頁重畫", async () => {
    // 這一筆紀錄記過「第 3 步展開」，瀏覽器的東西也都在：照理說讀得到
    vi.stubGlobal("sessionStorage", fakeSessionStorage({ [STORE]: JSON.stringify({ "entry-1": { "guide:step:2": true } }) }));
    vi.stubGlobal("navigation", { currentEntry: { key: "entry-1" } });
    vi.stubGlobal("location", { pathname: "/guide", search: "" });
    vi.resetModules();
    const { useVisitState } = await import("@/lib/visit-state");
    function Step() {
      const [open] = useVisitState("guide:step:2", false);
      return createElement("p", null, open ? "展開" : "收著");
    }
    expect(renderToString(createElement(Step))).toBe("<p>收著</p>");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
