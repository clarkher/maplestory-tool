import { describe, expect, it } from "vitest";
import { MAIN_TOWNS, VICTORIA_PORT, boatNote, defaultStart, findRoute, goNoteText, goStart, hubTowns, townChips, townsTitle, victoriaReach } from "@/lib/route";
import type { MapRecord, PortalEdge } from "@/lib/types";

const CUPID = 100000200;
const PERION = 102000000;
const FLORINA = 110000000;
const RAINBOW = 1010000;

describe("帶我去的預設起點", () => {
  const reaches = (allowed: number[]) => (from: number) => allowed.includes(from);

  it("最近的城鎮不是目的地：照舊從最近的城鎮出發", () => {
    expect(defaultStart(105040300, PERION, null, reaches([PERION]))).toEqual({ kind: "start", map: PERION });
  });

  it("目的地自己就是城鎮、沒記過起點：先問你在哪個城鎮，不說「你已經在目的地了」", () => {
    expect(defaultStart(CUPID, CUPID, null, reaches([]))).toEqual({ kind: "ask" });
  });

  it("目的地自己就是城鎮、記過起點而且走得到：從上次選的起點出發", () => {
    expect(defaultStart(CUPID, CUPID, PERION, reaches([PERION]))).toEqual({ kind: "start", map: PERION });
  });

  it("記過的起點就是目的地、或從那裡走不到：還是先問", () => {
    expect(defaultStart(CUPID, CUPID, CUPID, reaches([CUPID]))).toEqual({ kind: "ask" });
    expect(defaultStart(CUPID, CUPID, FLORINA, reaches([PERION]))).toEqual({ kind: "ask" });
  });

  it("沒有任何城鎮走得到：找不到起點", () => {
    expect(defaultStart(910340500, null, PERION, reaches([PERION]))).toEqual({ kind: "none" });
  });
});

describe("跨區要自己搭船或搭車", () => {
  const graph: Record<string, PortalEdge[]> = {
    [VICTORIA_PORT]: [[PERION, "east00", 0, 0]],
    [PERION]: [[CUPID, "west00", 0, 0], [VICTORIA_PORT, "west00", 0, 0]],
    [CUPID]: [[PERION, "east00", 0, 0]],
    [FLORINA]: [[110040000, "east00", 0, 0]],
    [RAINBOW]: [[1010004, "east00", 0, 0]],
  };

  it("維多利亞港走傳送門到得了的圖", () => {
    expect([...victoriaReach(graph)].sort()).toEqual([CUPID, PERION, VICTORIA_PORT].sort());
  });

  it("不在楓之島的人：起點跟維多利亞島之間沒有傳送門就要自己搭船或搭車（region）", () => {
    const reach = victoriaReach(graph);
    expect(boatNote(FLORINA, reach, false)).toBe("region");
    expect(boatNote(PERION, reach, false)).toBeUndefined();
    expect(boatNote(RAINBOW, reach, false)).toBeUndefined();
  });

  it("還在楓之島的人：起點不在楓之島就要先搭船到維多利亞島（island）；起點在楓之島不用", () => {
    const reach = victoriaReach(graph);
    expect(boatNote(PERION, reach, true)).toBe("island");
    expect(boatNote(FLORINA, reach, true)).toBe("island");
    expect(boatNote(RAINBOW, reach, true)).toBeUndefined();
  });
});

describe("帶我去：還可能在楓之島的初心者（round 3 B）", () => {
  const BEACH_FIELD = 110040000;
  const MUSHROOM = 10000;
  const ISLAND_FIELD = 40000;
  const graph: Record<string, PortalEdge[]> = {
    [VICTORIA_PORT]: [[PERION, "east00", 0, 0]],
    [PERION]: [[CUPID, "west00", 0, 0], [VICTORIA_PORT, "west00", 0, 0]],
    [CUPID]: [[PERION, "east00", 0, 0]],
    [FLORINA]: [[BEACH_FIELD, "east00", 0, 0]],
    [BEACH_FIELD]: [[FLORINA, "west00", 0, 0]],
    [MUSHROOM]: [[ISLAND_FIELD, "east00", 0, 0]],
    [ISLAND_FIELD]: [[MUSHROOM, "west00", 0, 0]],
  };
  const reach = victoriaReach(graph);
  const run = (target: number, suggested: number | null, options: { picked?: number; remembered?: number; novice?: boolean } = {}) =>
    goStart({
      target,
      picked: options.picked ?? null,
      suggested,
      remembered: options.remembered ?? null,
      novice: options.novice ?? true,
      reaches: from => findRoute(graph, from, target).ok,
      reach,
    });

  it("目的地在維多利亞島、沒自己選起點：從維多利亞港出發，路線上面說要先搭船到維多利亞港", () => {
    expect(run(CUPID, PERION)).toEqual({ choice: { kind: "start", map: VICTORIA_PORT }, notes: ["island"] });
  });

  it("目的地是城鎮也一樣從維多利亞港出發，不先問；記住的起點（別的角色選的）不用", () => {
    expect(run(PERION, PERION, { remembered: CUPID })).toEqual({ choice: { kind: "start", map: VICTORIA_PORT }, notes: ["island"] });
  });

  it("目的地就是維多利亞港：說搭船就會到，不給「你已經在目的地了」的路線（先問在哪個城鎮）", () => {
    expect(run(VICTORIA_PORT, VICTORIA_PORT)).toEqual({ choice: { kind: "ask" }, notes: ["port"] });
    expect(run(VICTORIA_PORT, VICTORIA_PORT, { remembered: PERION })).toEqual({ choice: { kind: "ask" }, notes: ["port"] });
  });

  it("維多利亞港走不到目的地（黃金海灘那邊）：照最近的城鎮出發，島上跟跨區兩句都說", () => {
    expect(run(BEACH_FIELD, FLORINA)).toEqual({ choice: { kind: "start", map: FLORINA }, notes: ["island", "region"] });
  });

  it("沒有維多利亞島的城鎮走得到、目的地自己就是那邊的城鎮（黃金海灘）：先問，問句上面放島上那句再放跨區那句（跨區那句講目的地）", () => {
    expect(run(FLORINA, FLORINA)).toEqual({ choice: { kind: "ask" }, notes: ["island", "region"] });
    expect(run(FLORINA, FLORINA, { novice: false })).toEqual({ choice: { kind: "ask" }, notes: ["region"] });
  });

  it("在這頁自己選了起點：照用，不說島上的事；選的起點跟維多利亞島之間沒有傳送門時照樣說跨區", () => {
    expect(run(CUPID, PERION, { picked: PERION })).toEqual({ choice: { kind: "start", map: PERION }, notes: [] });
    expect(run(BEACH_FIELD, FLORINA, { picked: FLORINA })).toEqual({ choice: { kind: "start", map: FLORINA }, notes: ["region"] });
    expect(run(CUPID, PERION, { picked: MUSHROOM })).toEqual({ choice: { kind: "start", map: MUSHROOM }, notes: [] });
  });

  it("目的地在楓之島：照一般規則（最近的城鎮），不說搭船", () => {
    expect(run(ISLAND_FIELD, MUSHROOM)).toEqual({ choice: { kind: "start", map: MUSHROOM }, notes: [] });
  });

  it("提示的字", () => {
    expect(goNoteText("island", "維多利亞港")).toBe("你還在楓之島的話，要先搭船到維多利亞港，再照下面的路線走。");
    expect(goNoteText("port", "")).toBe("你還在楓之島的話，搭船就會到維多利亞港。");
    expect(goNoteText("region", "黃金海灘")).toBe("黃金海灘跟維多利亞島的城鎮之間沒有傳送門，這段要自己搭船或搭車過去。");
  });

  it("不是初心者：照舊——最近的城鎮、目的地是城鎮時用記住的起點或先問；起點跟維多利亞島沒有傳送門才說跨區，不說島上的事", () => {
    expect(run(CUPID, PERION, { novice: false })).toEqual({ choice: { kind: "start", map: PERION }, notes: [] });
    expect(run(PERION, PERION, { novice: false, remembered: CUPID })).toEqual({ choice: { kind: "start", map: CUPID }, notes: [] });
    expect(run(VICTORIA_PORT, VICTORIA_PORT, { novice: false })).toEqual({ choice: { kind: "ask" }, notes: [] });
    expect(run(BEACH_FIELD, FLORINA, { novice: false })).toEqual({ choice: { kind: "start", map: FLORINA }, notes: ["region"] });
  });
});

describe("城鎮按鈕（跨區、問起點時；round 3 B2／F）", () => {
  const HENESYS = 100000000;
  const HOUSE = 100000001;
  const UNNAMED_TOWN = 101000001;
  const UNNAMED_FIELD = 101000002;
  const HILL = 100010000;
  const PORT_FIELD = 104010000;
  const SLEEPY = 105040300;
  const SLEEPY_FIELD = 105040301;
  const BEACH = 110040000;
  const maps: Record<string, MapRecord> = {
    [HENESYS]: { zh: "弓箭手村", st: "維多利亞", t: 1, ret: HENESYS },
    // 民宅：客戶端也標成城鎮、回城點是自己，但沒有別張圖回到這裡
    [HOUSE]: { zh: "弓箭手村民宅", st: "維多利亞", t: 1, ret: HOUSE },
    [UNNAMED_TOWN]: { zh: "", st: "", t: 1, ret: UNNAMED_TOWN },
    [UNNAMED_FIELD]: { zh: "", st: "", ret: UNNAMED_TOWN },
    [HILL]: { zh: "弓箭手村東部小山", st: "維多利亞", t: 1, ret: HENESYS },
    [CUPID]: { zh: "邱比特公園", st: "維多利亞", t: 1, ret: HENESYS },
    [VICTORIA_PORT]: { zh: "維多利亞港", st: "維多利亞", t: 1, ret: VICTORIA_PORT },
    [PORT_FIELD]: { zh: "維多利亞港郊外", st: "維多利亞", ret: VICTORIA_PORT },
    [SLEEPY]: { zh: "奇幻村", st: "迷霧森林", t: 1, ret: SLEEPY },
    [SLEEPY_FIELD]: { zh: "螞蟻洞", st: "迷霧森林", ret: SLEEPY },
    [FLORINA]: { zh: "黃金海灘", st: "黃金海岸", t: 1, ret: FLORINA },
    [BEACH]: { zh: "海龜沙灘", st: "黃金海岸", ret: FLORINA },
  };
  const both = (a: number, b: number): Record<string, PortalEdge[]> => ({ [a]: [[b, "east00", 0, 0]], [b]: [[a, "west00", 0, 0]] });
  const link = (...pairs: Array<[number, number]>) => {
    const graph: Record<string, PortalEdge[]> = {};
    for (const [a, b] of pairs) for (const [key, edges] of Object.entries(both(a, b))) graph[key] = [...(graph[key] ?? []), ...edges];
    return graph;
  };
  const graph = link(
    [VICTORIA_PORT, HENESYS], [HENESYS, CUPID], [HENESYS, HOUSE], [HENESYS, UNNAMED_TOWN], [HENESYS, HILL], [HENESYS, SLEEPY],
    [SLEEPY, SLEEPY_FIELD], [VICTORIA_PORT, PORT_FIELD], [UNNAMED_TOWN, UNNAMED_FIELD], [FLORINA, BEACH],
  );

  it("真的城鎮：有中文名、客戶端標成城鎮、回城點是自己、而且有別張圖回到這裡（民宅、沒有名字的、回城點在別處的都不算）", () => {
    expect(hubTowns(maps)).toEqual([HENESYS, VICTORIA_PORT, SLEEPY, FLORINA]);
  });

  it("只給走得到目的地的城鎮；照 first 排前面，其他照順序", () => {
    expect(townChips(maps, graph, CUPID)).toEqual([HENESYS, VICTORIA_PORT, SLEEPY]);
    expect(townChips(maps, graph, CUPID, { first: [VICTORIA_PORT] })).toEqual([VICTORIA_PORT, HENESYS, SLEEPY]);
  });

  it("維多利亞港走不到目的地時不會排第一（黃金海灘那邊只剩黃金海灘）", () => {
    expect(townChips(maps, graph, BEACH, { first: [VICTORIA_PORT] })).toEqual([FLORINA]);
  });

  it("問起點時不給目的地本身（選了只會「你已經在目的地了」）", () => {
    expect(townChips(maps, graph, HENESYS, { first: [VICTORIA_PORT], exceptTarget: true })).toEqual([VICTORIA_PORT, SLEEPY]);
    expect(townChips(maps, graph, HENESYS)).toEqual([HENESYS, VICTORIA_PORT, SLEEPY]);
  });

  it("問起點的按鈕：維多利亞港、弓箭手村、魔法森林、勇士之村、墮落城市排前面（地圖資料沒有的跳過），再接其他走得到的城鎮", () => {
    expect(MAIN_TOWNS).toEqual([VICTORIA_PORT, 100000000, 101000000, 102000000, 103000000]);
    expect(townChips(maps, graph, CUPID, { first: MAIN_TOWNS, exceptTarget: true })).toEqual([VICTORIA_PORT, HENESYS, SLEEPY]);
  });

  it("標題寫城鎮所在區域的中文名（地圖資料的區域名，城鎮裡最多的那個）；沒有就寫「目的地附近的城鎮」", () => {
    expect(townsTitle(maps, [VICTORIA_PORT, HENESYS, SLEEPY])).toBe("維多利亞的城鎮");
    expect(townsTitle(maps, [FLORINA])).toBe("黃金海岸的城鎮");
    expect(townsTitle(maps, [UNNAMED_TOWN])).toBe("目的地附近的城鎮");
    expect(townsTitle(maps, [])).toBe("目的地附近的城鎮");
  });
});
