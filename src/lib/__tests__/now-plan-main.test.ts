import { describe, expect, it } from "vitest";
import { INSTRUCTOR_MAPS, mainPick, pqFor } from "@/lib/now-plan";
import type { GuideCommon, GuideJob, GuidePq, GuideTrain, MapRecord, Monster, PortalEdge, TrainingRow } from "@/lib/types";

const TOWN = 100000000;
const UNDEAD_MAP = 100010001;
const PLAIN_MAP = 100010002;
const BOSS_MAP = 100010003;

const monster = (id: number, lv: number, map: number, count: number, extra: Partial<Monster> = {}): Monster =>
  ({ id, n: `怪${id}`, lv, exp: 10, hp: 100, pad: 0, pdd: 0, mad: 0, mdd: 0, acc: 0, eva: 0, spd: 0, maps: [map], sp: [[map, count, 0]], drops: [], ...extra }) as Monster;
const row = (m: number, eff: number, lv: number, mob: number, sp: number): TrainingRow =>
  ({ m, sp, exp1: 3000, hp: 1000, eff, resp: 7, lv, lvMin: lv, lvMax: lv, mobs: [[mob, sp, 0]] });

const monsters = [monster(1, 45, UNDEAD_MAP, 30, { und: 1 }), monster(2, 45, PLAIN_MAP, 30), monster(3, 80, BOSS_MAP, 1)];
const training = [row(UNDEAD_MAP, 100, 45, 1, 30), row(PLAIN_MAP, 200, 45, 2, 30), row(BOSS_MAP, 0.2, 80, 3, 1)];
const maps: Record<string, MapRecord> = {
  [TOWN]: { zh: "城鎮", st: "維多利亞", t: 1 },
  [UNDEAD_MAP]: { zh: "不死圖", st: "維多利亞", ret: TOWN },
  [PLAIN_MAP]: { zh: "普通圖", st: "維多利亞", ret: TOWN },
  [BOSS_MAP]: { zh: "王圖", st: "維多利亞", ret: TOWN },
};
const graph: Record<string, PortalEdge[]> = {
  [TOWN]: [[UNDEAD_MAP, "east00", 0, 0]],
  [UNDEAD_MAP]: [[PLAIN_MAP, "east00", 0, 0], [TOWN, "west00", 0, 0]],
  [PLAIN_MAP]: [[BOSS_MAP, "east00", 0, 0], [UNDEAD_MAP, "west00", 0, 0]],
  [BOSS_MAP]: [[PLAIN_MAP, "west00", 0, 0]],
};
const nearestTown: Record<string, [number, number]> = { [UNDEAD_MAP]: [TOWN, 0], [PLAIN_MAP]: [TOWN, 0], [BOSS_MAP]: [TOWN, 0] };
const commonWith = (pq: GuidePq[] = []): GuideCommon => ({
  researchedAt: "",
  builtAt: "",
  expTable: { toNext: Array.from({ length: 121 }, () => 1000), conflicts: [], v: "tw", s: [] },
  mustDo: [],
  notWorth: [],
  pq,
});
const segment = (partial: Partial<GuideTrain>): GuideTrain =>
  ({ from: 40, to: 50, kind: "solo", map: null, name: "", mobs: [], why: "", v: "tw", s: [], ...partial });
const guideWith = (train: GuideTrain[]): GuideJob =>
  ({ job: 100, name: "劍士", stat: [], builds: [], train, notes: [], gaps: [], notOpenYet: [] });
const base = { training, monsters, maps, graph, nearestTown, common: commonWith() };

describe("主推大卡", () => {
  it("初心者 8 等起：列五個轉職教官，法師 8 等、其他 10 等", () => {
    const pick = mainPick({ ...base, level: 8, job: 0 });
    expect(pick?.kind).toBe("advance");
    if (pick?.kind !== "advance") return;
    expect(pick.instructors.map(entry => [entry.line, entry.level, entry.map])).toEqual([
      ["劍士", 10, INSTRUCTOR_MAPS[100]],
      ["法師", 8, INSTRUCTOR_MAPS[200]],
      ["弓箭手", 10, INSTRUCTOR_MAPS[300]],
      ["盜賊", 10, INSTRUCTOR_MAPS[400]],
      ["海盜", 10, INSTRUCTOR_MAPS[500]],
    ]);
  });

  it("沒有攻略時照遊戲資料排，王圖不進來，附從城鎮走幾張圖", () => {
    const pick = mainPick({ ...base, level: 45, job: 100 });
    expect(pick?.kind).toBe("map");
    if (pick?.kind !== "map") return;
    expect(pick.option).toMatchObject({ map: PLAIN_MAP, source: "data", town: TOWN, hops: 2 });
    expect(pick.alt?.map).toBe(UNDEAD_MAP);
    expect([pick.option.map, pick.alt?.map]).not.toContain(BOSS_MAP);
  });

  it("僧侶 45 等只推有不死系的圖，卡片寫原因", () => {
    const pick = mainPick({ ...base, level: 45, job: 230 });
    if (pick?.kind !== "map") throw new Error("應該是練功圖");
    expect(pick.option.map).toBe(UNDEAD_MAP);
    expect(pick.option.fit.note).toBe("不死系佔 100%，群體治癒補得到");
    expect(pick.alt).toBeUndefined();
  });

  it("攻略有寫這個等級就排第一；主推單人時，備案是組隊段落", () => {
    const guide = guideWith([
      segment({ map: UNDEAD_MAP, name: "不死圖" }),
      segment({ map: PLAIN_MAP, name: "普通圖", kind: "party" }),
    ]);
    const pick = mainPick({ ...base, level: 45, job: 100, guide });
    if (pick?.kind !== "map") throw new Error("應該是練功圖");
    expect(pick.option).toMatchObject({ map: UNDEAD_MAP, source: "guide" });
    expect(pick.alt).toMatchObject({ map: PLAIN_MAP, party: true });
  });

  it("跨 15 級以上的攻略段落排在窄的後面", () => {
    const guide = guideWith([
      segment({ map: UNDEAD_MAP, name: "不死圖", from: 43, to: 94 }),
      segment({ map: PLAIN_MAP, name: "普通圖", from: 44, to: 48 }),
    ]);
    const pick = mainPick({ ...base, level: 45, job: 100, guide });
    if (pick?.kind !== "map") throw new Error("應該是練功圖");
    expect(pick.option.map).toBe(PLAIN_MAP);
  });

  it("沒有同等級的圖時加封頂提示", () => {
    const pick = mainPick({ ...base, level: 60, job: 100 });
    if (pick?.kind !== "map") throw new Error("應該是練功圖");
    expect(pick.ceiling).toBe(45);
  });

  it("等級在組隊任務範圍內就主推組隊任務", () => {
    const moon: GuidePq = { key: "moon", name: "月妙組隊任務", entrance: TOWN, guide: "/guide", byJob: { 100: [13, 20] } };
    const pick = mainPick({ ...base, common: commonWith([moon]), level: 15, job: 100 });
    expect(pick).toMatchObject({ kind: "pq", window: [13, 20] });
    expect(mainPick({ ...base, common: commonWith([moon]), level: 21, job: 100 })?.kind).not.toBe("pq");
  });

  it("剛好跨 15 級的攻略段落也算太寬，排在窄的後面", () => {
    const guide = guideWith([
      segment({ map: UNDEAD_MAP, name: "不死圖", from: 40, to: 55 }),
      segment({ map: PLAIN_MAP, name: "普通圖", from: 44, to: 48, kind: "party" }),
    ]);
    const pick = mainPick({ ...base, level: 45, job: 100, guide });
    if (pick?.kind !== "map") throw new Error("應該是練功圖");
    expect(pick.option.map).toBe(PLAIN_MAP);
  });

  it("封頂只看這個職業能練的圖（僧侶不會被一般圖的等級騙）", () => {
    const HIGH_MAP = 100010004;
    const pick = mainPick({
      ...base,
      level: 56,
      job: 230,
      training: [...training, row(HIGH_MAP, 300, 58, 4, 30)],
      monsters: [...monsters, monster(4, 58, HIGH_MAP, 30)],
      maps: { ...maps, [HIGH_MAP]: { zh: "高等圖", st: "維多利亞", ret: TOWN } },
    });
    if (pick?.kind !== "map") throw new Error("應該是練功圖");
    expect(pick.option.map).toBe(UNDEAD_MAP);
    expect(pick.ceiling).toBe(45);
  });
});

describe("組隊任務範圍", () => {
  const moon: GuidePq = { key: "moon", name: "月妙組隊任務", entrance: 1, guide: "/guide", byJob: { 100: [13, 30], 110: [31, 35] } };
  const kerning: GuidePq = { key: "kerning", name: "超級綠水靈組隊任務", entrance: 2, guide: "/guide", byJob: { 100: [25, 30] } };

  it("同時落在兩個範圍，選起始等級高的", () => {
    expect(pqFor(commonWith([moon, kerning]), 100, 26)?.pq.key).toBe("kerning");
    expect(pqFor(commonWith([moon, kerning]), 100, 18)?.pq.key).toBe("moon");
  });

  it("二轉後先看二轉職業自己的範圍", () => {
    expect(pqFor(commonWith([moon, kerning]), 110, 33)?.window).toEqual([31, 35]);
    expect(pqFor(commonWith([moon, kerning]), 110, 36)).toBeUndefined();
  });

  it("回傳範圍是哪個職業的攻略寫的：二轉用到一轉的範圍時是一轉職業", () => {
    const thief: GuidePq = { key: "kerning", name: "超級綠水靈組隊任務", entrance: 2, guide: "/guide", byJob: { 400: [21, 30] } };
    expect(pqFor(commonWith([thief]), 420, 30)).toMatchObject({ job: 400, window: [21, 30] });
    expect(pqFor(commonWith([moon, kerning]), 110, 33)).toMatchObject({ job: 110 });
  });
});
