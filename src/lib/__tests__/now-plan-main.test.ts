import { describe, expect, it } from "vitest";
import { INSTRUCTOR_MAPS, altPrefix, canGo, mainPick, pqFor, type TrainOption } from "@/lib/now-plan";
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

  it("沒有同等級的圖時加封頂提示；主推就是能練的最高圖時說這張已經是最好的", () => {
    const pick = mainPick({ ...base, level: 60, job: 100 });
    if (pick?.kind !== "map") throw new Error("應該是練功圖");
    expect(pick.ceiling).toEqual({ level: 45, best: true });
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
    expect(pick.ceiling).toEqual({ level: 45, best: true });
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

/* ------------------------------------------------------------------ 能練的最高圖、過期攻略、封頂（一套設計） */

type Spot = { id: number; lv: number; eff: number; hops?: number; sp?: number; mob?: Partial<Monster>; town?: boolean };

/** 每張圖一隻怪；hops 是從城鎮走幾張圖（中間塞沒有名字的通道），town: false 代表走不到 */
function world(spots: Spot[]) {
  const monsters = spots.map(spot => monster(spot.id, spot.lv, spot.id, spot.sp ?? 30, spot.mob));
  const training = spots.map(spot => ({ ...row(spot.id, spot.eff, spot.lv, spot.id, spot.sp ?? 30) }));
  const maps: Record<string, MapRecord> = { [TOWN]: { zh: "城鎮", st: "維多利亞", t: 1 } };
  const graph: Record<string, PortalEdge[]> = { [TOWN]: [] };
  const nearestTown: Record<string, [number, number]> = {};
  for (const spot of spots) {
    maps[spot.id] = { zh: `圖${spot.id}`, st: "維多利亞", ret: TOWN };
    if (spot.town === false) {
      graph[spot.id] = [[TOWN, "out00", 0, 0]];
      continue;
    }
    nearestTown[spot.id] = [TOWN, 0];
    let from = TOWN;
    for (let step = 1; step < (spot.hops ?? 1); step += 1) {
      const pass = spot.id * 100 + step;
      graph[from] = [...(graph[from] ?? []), [pass, "east00", 0, 0]];
      from = pass;
    }
    graph[from] = [...(graph[from] ?? []), [spot.id, "east00", 0, 0]];
  }
  return { monsters, training, maps, graph, nearestTown, common: commonWith() };
}

describe("主推大卡：能練的最高圖、過期攻略、封頂", () => {
  it("從城鎮要走 8 張圖以上的遊戲資料圖打七折", () => {
    const near = 300000001;
    const far = 300000002;
    const pick = mainPick({ ...world([{ id: near, lv: 45, eff: 100, hops: 1 }, { id: far, lv: 45, eff: 130, hops: 8 }]), level: 45, job: 100 });
    if (pick?.kind !== "map") throw new Error("應該是練功圖");
    expect(pick.option).toMatchObject({ map: near, hops: 1 });
    expect(pick.alt).toMatchObject({ map: far, hops: 8 });
  });

  it("走不到城鎮的遊戲資料圖不推（帶我去會找不到起點）", () => {
    const garage = 300000003;
    const open = 300000004;
    const pick = mainPick({ ...world([{ id: garage, lv: 45, eff: 900, town: false }, { id: open, lv: 45, eff: 100 }]), level: 45, job: 100 });
    if (pick?.kind !== "map") throw new Error("應該是練功圖");
    expect(pick.option.map).toBe(open);
    expect(pick.alt?.map).not.toBe(garage);
  });

  it("比現在低 10 級以上的攻略圖排在遊戲資料後面（冰雷 50 不再先推 39 等的圖）", () => {
    const old = 300000005;
    const fresh = 300000006;
    const top = 300000007;
    const guide = guideWith([segment({ map: old, name: "舊圖", from: 37, to: 55 })]);
    const pick = mainPick({ ...world([{ id: old, lv: 39, eff: 500 }, { id: fresh, lv: 50, eff: 100 }, { id: top, lv: 67, eff: 50 }]), level: 50, job: 220, guide });
    if (pick?.kind !== "map") throw new Error("應該是練功圖");
    expect(pick.option).toMatchObject({ map: fresh, source: "data" });
    expect(pick.alt).toMatchObject({ map: old, source: "guide" });
    expect(pick.ceiling).toBeUndefined();
  });

  it("Lv.90 沒有攻略段落、遊戲資料也排不出來時，主推能練的最高圖，封頂說這張已經是最好的", () => {
    const low = 300000008;
    const top = 300000009;
    const pick = mainPick({ ...world([{ id: low, lv: 60, eff: 300 }, { id: top, lv: 71, eff: 100 }]), level: 90, job: 210, guide: guideWith([]) });
    if (pick?.kind !== "map") throw new Error("應該是練功圖");
    expect(pick.option).toMatchObject({ map: top, source: "data" });
    expect(pick.ceiling).toEqual({ level: 71, best: true });
  });

  it("高等級遊戲資料排不出圖、只剩過期的攻略圖：主推攻略圖、備案是能練的最高圖、封頂不說最好", () => {
    // Lv.89 起連 Lv.71 的圖都低於遊戲資料的等級適配下限，遊戲資料一張都排不出來
    const giant = 300000010;
    const top = 300000011;
    const guide = guideWith([segment({ map: giant, name: "巨人之林", from: 80, to: 100, kind: "party" })]);
    const pick = mainPick({ ...world([{ id: giant, lv: 50, eff: 400 }, { id: top, lv: 71, eff: 100 }]), level: 90, job: 320, guide });
    if (pick?.kind !== "map") throw new Error("應該是練功圖");
    expect(pick.option).toMatchObject({ map: giant, source: "guide", party: true });
    expect(pick.alt).toMatchObject({ map: top, source: "data" });
    expect(pick.ceiling).toEqual({ level: 71, best: false });
  });

  it("等級跟能練的最高圖差不到 10 級，不加封頂（俠盜 62）", () => {
    const giant = 300000012;
    const mid = 300000013;
    const top = 300000014;
    const guide = guideWith([segment({ map: giant, name: "巨人之林", from: 60, to: 100, kind: "party" })]);
    const pick = mainPick({ ...world([{ id: giant, lv: 50, eff: 400 }, { id: mid, lv: 62, eff: 200 }, { id: top, lv: 71, eff: 100 }]), level: 62, job: 420, guide });
    if (pick?.kind !== "map") throw new Error("應該是練功圖");
    expect(pick.option).toMatchObject({ map: mid, source: "data" });
    expect(pick.ceiling).toBeUndefined();
  });

  it("僧侶 70 等還只推不死系，71 等起不套規則", () => {
    const undead = 300000015;
    const plain = 300000016;
    const spots = [{ id: undead, lv: 68, eff: 100, mob: { und: 1 as const } }, { id: plain, lv: 68, eff: 300 }];
    const at70 = mainPick({ ...world(spots), level: 70, job: 230 });
    const at71 = mainPick({ ...world(spots), level: 71, job: 230 });
    if (at70?.kind !== "map" || at71?.kind !== "map") throw new Error("應該是練功圖");
    expect(at70.option.map).toBe(undead);
    expect(at71.option.map).toBe(plain);
  });

  it("同一張圖不會同時是主推跟備案（攻略同一張圖寫了單人跟組隊兩段）", () => {
    const croc = 300000017;
    const other = 300000018;
    const guide = guideWith([
      segment({ map: croc, name: "鱷魚潭Ⅱ", from: 50, to: 55 }),
      segment({ map: croc, name: "鱷魚潭Ⅱ", from: 50, to: 55, kind: "party" }),
    ]);
    const pick = mainPick({ ...world([{ id: croc, lv: 52, eff: 300 }, { id: other, lv: 52, eff: 100 }]), level: 52, job: 110, guide });
    if (pick?.kind !== "map") throw new Error("應該是練功圖");
    expect(pick.option.map).toBe(croc);
    expect(pick.alt?.map).toBe(other);
  });
});

describe("主推卡的文字規則", () => {
  const option = (partial: Partial<TrainOption>): TrainOption =>
    ({ map: 1, title: "圖", party: false, source: "guide", mobs: [], fit: { ok: true, factor: 1 }, ...partial });

  it("備案前綴：主推單人、備案組隊才寫「有隊友：」，其他都寫「人多時：」", () => {
    expect(altPrefix(option({ party: false }), option({ party: true }))).toBe("有隊友：");
    expect(altPrefix(option({ party: true }), option({ party: false }))).toBe("人多時：");
    expect(altPrefix(option({ party: true }), option({ party: true }))).toBe("人多時：");
    expect(altPrefix(option({ party: false }), option({ party: false }))).toBe("人多時：");
  });

  it("有城鎮路線才給「帶我去」", () => {
    expect(canGo(option({ hops: 3, town: TOWN }))).toBe(true);
    expect(canGo(option({ hops: 0, town: TOWN }))).toBe(true);
    expect(canGo(option({}))).toBe(false);
  });
});
