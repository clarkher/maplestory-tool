import { describe, expect, it } from "vitest";
import { VICTORIA_PORT, defaultStart, needsBoat, victoriaReach } from "@/lib/route";
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

  it("起點跟維多利亞島之間沒有傳送門就要搭船或搭車；還在楓之島的人、楓之島的圖不算", () => {
    const reach = victoriaReach(graph);
    expect(needsBoat(FLORINA, reach, false)).toBe(true);
    expect(needsBoat(PERION, reach, false)).toBe(false);
    expect(needsBoat(FLORINA, reach, true)).toBe(false);
    expect(needsBoat(RAINBOW, reach, false)).toBe(false);
  });
});
