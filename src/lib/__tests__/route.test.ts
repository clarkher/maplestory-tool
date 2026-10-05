import { describe, expect, it } from "vitest";
import { VICTORIA_PORT, boatNote, defaultStart, findRoute, goNoteText, goStart, victoriaReach } from "@/lib/route";
import type { PortalEdge } from "@/lib/types";

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

  it("維多利亞港走不到、目的地自己就是那邊的城鎮：先問，不說要照下面的路線走", () => {
    expect(run(FLORINA, FLORINA)).toEqual({ choice: { kind: "ask" }, notes: [] });
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
