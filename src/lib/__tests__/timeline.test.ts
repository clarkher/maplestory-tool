import { describe, expect, it } from "vitest";
import type { MainPick, TrainOption } from "@/lib/now-plan";
import { bandsFor, spawnIndex } from "@/lib/route-planner";
import { pickTitle, timelinePlans, type TimelineInput } from "@/lib/timeline";
import type { GuideJob, GuidePq, GuideTrain, MapRecord, Monster, TrainingRow } from "@/lib/types";

const GIANT = 105040306;
const CLIFF = 101030109;
const FIRE = 106000110;
const SWAMP = 107000200;
const BOSS = 105090900;
const CUPID = 100000200;
const ISLAND = 40000;
const STAGE = 910340500;

const monster = (id: number, lv: number, map: number, count: number, extra: Partial<Monster> = {}): Monster =>
  ({ id, n: `怪${id}`, lv, exp: 100, hp: 100, pad: 0, pdd: 0, mad: 0, mdd: 0, acc: 0, eva: 0, spd: 0, maps: [map], sp: [[map, count, 0]], drops: [], ...extra }) as Monster;
const row = (m: number, lv: number, mob: number, sp: number, eff = 100): TrainingRow =>
  ({ m, sp, exp1: 3000, hp: 1000, eff, resp: 7, lv, lvMin: lv, lvMax: lv, mobs: [[mob, sp, 0]] });

const monsters = [
  monster(1, 75, GIANT, 30),
  monster(2, 73, CLIFF, 30),
  monster(3, 45, FIRE, 30, { el: { f: "r" } }),
  monster(4, 45, SWAMP, 30),
  monster(5, 45, BOSS, 1),
  monster(6, 3, ISLAND, 20),
];
const training = [row(GIANT, 75, 1, 30), row(CLIFF, 71, 2, 30), row(FIRE, 45, 3, 30), row(SWAMP, 45, 4, 30), row(BOSS, 45, 5, 1, 9999), row(ISLAND, 3, 6, 20)];
const maps: Record<string, Pick<MapRecord, "zh">> = {
  [GIANT]: { zh: "巨人之林" },
  [CLIFF]: { zh: "遺跡之峭壁" },
  [FIRE]: { zh: "火焰之地Ⅱ" },
  [SWAMP]: { zh: "沼澤地Ⅲ" },
  [BOSS]: { zh: "王的房間" },
  [CUPID]: { zh: "邱比特公園" },
  [ISLAND]: { zh: "嫩寶狩獵場Ⅰ" },
  [STAGE]: { zh: "第一次同行<最後的關隘>" },
};
const moon: GuidePq = { key: "moon", name: "月妙組隊任務", quest: "1200", entrance: CUPID, guide: "/guide#pq-moon", byJob: { 500: [13, 25] } };
const kerning: GuidePq = { key: "kerning", name: "超級綠水靈組隊任務", quest: "1201", entrance: 103000000, guide: "/guide#pq-kerning", byJob: { 500: [21, 30] } };

const segment = (partial: Partial<GuideTrain>): GuideTrain =>
  ({ from: 40, to: 50, kind: "solo", map: null, name: "", mobs: [], why: "", v: "tw", s: [], ...partial });
const guide = (job: number, train: GuideTrain[]): GuideJob =>
  ({ job, name: String(job), stat: [], builds: [], train, notes: [], gaps: [], notOpenYet: [] });
const option = (partial: Partial<TrainOption>): TrainOption =>
  ({ map: CLIFF, title: "遺跡之峭壁", party: false, source: "data", mobs: [[2, 30]], fit: { ok: true, factor: 1 }, level: 71, hops: 14, town: 102000000, ...partial });

const input = (partial: Partial<TimelineInput>): TimelineInput => ({
  job: 320,
  level: 95,
  bands: bandsFor(partial.job ?? 320),
  guides: new Map(),
  monsterIndex: new Map(monsters.map(entry => [entry.id, entry])),
  spawns: spawnIndex(monsters),
  maps,
  training,
  pqs: [moon, kerning],
  canGo: map => map !== STAGE,
  ...partial,
});

describe("你在這一段＝主推卡", () => {
  const twoGiants = guide(320, [
    segment({ from: 80, to: 100, kind: "party", map: GIANT, name: "巨人之林／鱷魚潭Ⅱ（60～99 等玩家主要分布）", mobs: [1], why: "終盤" }),
    segment({ from: 50, to: 80, kind: "party", map: GIANT, name: "巨人之林（3～5 人團）", mobs: [1], why: "中段" }),
  ]);

  it("主推是遊戲資料的圖（弩弓手 95 的遺跡之峭壁）：標籤寫它，練功第一列就是它", () => {
    const pick: MainPick = { kind: "map", option: option({}) };
    const { activeIndex, plans, labels } = timelinePlans(input({ guides: new Map([[320, twoGiants]]), pick }));
    expect(labels[activeIndex]).toBe("遺跡之峭壁");
    expect(plans[activeIndex].rows[0]).toMatchObject({ map: CLIFF, title: "遺跡之峭壁", source: "data", go: CLIFF });
  });

  it("同一張圖好幾段併成一列、一顆去：有涵蓋你等級的段就寫那段的範圍", () => {
    const { activeIndex, plans } = timelinePlans(input({ guides: new Map([[320, twoGiants]]) }));
    const giants = plans[activeIndex].rows.filter(entry => entry.map === GIANT);
    expect(giants).toHaveLength(1);
    expect(giants[0]).toMatchObject({ title: "巨人之林", from: 80, to: 100, go: GIANT, why: "終盤" });
  });

  it("沒有涵蓋你等級的段時寫合起來的範圍", () => {
    const overlapping = guide(320, [
      segment({ from: 50, to: 70, kind: "party", map: GIANT, name: "巨人之林" }),
      segment({ from: 60, to: 80, kind: "party", map: GIANT, name: "巨人之林（3～5 人團）" }),
    ]);
    const { plans } = timelinePlans(input({ level: 95, guides: new Map([[320, overlapping]]) }));
    const sixty = plans.find(plan => plan.band.from === 60);
    expect(sixty?.rows.filter(entry => entry.map === GIANT)).toEqual([expect.objectContaining({ from: 50, to: 80 })]);
  });

  it("主推是攻略圖：那一列移到最前面，標籤寫主推的圖", () => {
    const pirate = guide(500, [
      segment({ from: 10, to: 20, map: SWAMP, name: "南部森林訓練場Ⅰ／弓箭手訓練場" }),
      segment({ from: 15, to: 25, map: GIANT, name: "小心掉落" }),
    ]);
    const pick: MainPick = { kind: "map", option: option({ map: GIANT, title: "巨人之林", source: "guide", guide: pirate.train[1] }) };
    const { activeIndex, plans, labels } = timelinePlans(input({ job: 500, level: 20, guides: new Map([[500, pirate]]), pick }));
    expect(labels[activeIndex]).toBe("巨人之林");
    expect(plans[activeIndex].rows.map(entry => entry.title)).toEqual(["巨人之林", "沼澤地Ⅲ"]);
  });

  it("主推是組隊任務：標籤跟第一列都寫組隊任務的名字（不寫「年糕」這種暱稱），去帶到入口", () => {
    const pirate = guide(500, [
      segment({ from: 10, to: 20, map: SWAMP, name: "南部森林訓練場Ⅰ" }),
      segment({ from: 13, to: 25, kind: "party", map: null, name: "月妙組隊任務「年糕」", pq: "moon" }),
    ]);
    const pick: MainPick = { kind: "pq", pq: moon, window: [13, 25], job: 500 };
    const { activeIndex, plans, labels } = timelinePlans(input({ job: 500, level: 20, guides: new Map([[500, pirate]]), pick }));
    expect(labels[activeIndex]).toBe("月妙組隊任務");
    expect(plans[activeIndex].rows[0]).toMatchObject({ title: "月妙組隊任務", pq: moon, go: CUPID, from: 13, to: 25 });
  });

  it("組隊任務段落顯示組隊任務的名字，不是關卡地圖名；關卡走不到就不給去", () => {
    const pirate = guide(500, [segment({ from: 21, to: 30, kind: "party", map: STAGE, name: "超級綠水靈組隊任務", pq: "kerning" })]);
    const { plans } = timelinePlans(input({ job: 500, level: 40, guides: new Map([[500, pirate]]), canGo: map => map !== 103000000 }));
    const band = plans.find(plan => plan.band.from === 21);
    expect(band?.rows[0]).toMatchObject({ title: "超級綠水靈組隊任務" });
    expect(band?.rows[0].go).toBeUndefined();
  });

  it("轉職卡：你在這一段的標籤寫「轉職」", () => {
    const { activeIndex, labels } = timelinePlans(input({ job: 0, level: 9, bands: bandsFor(0), pick: { kind: "advance", instructors: [] } }));
    expect(labels[activeIndex]).toBe("轉職");
  });

  it("主推是組隊任務、這段的段落比卡上窄：第一列寫卡上的範圍（劍士 18：卡 Lv.13–30，列不能寫 13–20），理由用那個組隊任務的段落", () => {
    const warrior = guide(100, [
      segment({ from: 13, to: 20, kind: "party", map: null, name: "月妙組隊任務（邱比特公園）", pq: "moon", why: "13~20 走月妙" }),
      segment({ from: 15, to: 20, map: SWAMP, name: "沼澤地" }),
    ]);
    const wide: GuidePq = { ...moon, byJob: { 100: [13, 30] } };
    const pick: MainPick = { kind: "pq", pq: wide, window: [13, 30], job: 100 };
    const { activeIndex, plans } = timelinePlans(input({ job: 100, level: 18, guides: new Map([[100, warrior]]), pqs: [wide, kerning], pick }));
    expect(plans[activeIndex].rows[0]).toMatchObject({ title: "月妙組隊任務", from: 13, to: 30, party: true, source: "guide", why: "13~20 走月妙", go: CUPID });
  });

  it("主推是某張圖的單人段落、同一張圖還有涵蓋你等級的組隊段落：第一列照主推那段寫（範圍、單人、理由）", () => {
    const solo = segment({ from: 47, to: 55, map: SWAMP, name: "沼澤地（單練）", why: "單練" });
    const berserker = guide(110, [segment({ from: 52, to: 65, kind: "party", map: SWAMP, name: "沼澤地（6 人團）", why: "組隊" }), solo]);
    const pick: MainPick = { kind: "map", option: option({ map: SWAMP, title: "沼澤地Ⅲ", source: "guide", guide: solo, party: false, mobs: [[4, 30]] }) };
    const { activeIndex, plans } = timelinePlans(input({ job: 110, level: 52, guides: new Map([[110, berserker]]), pick }));
    expect(plans[activeIndex].rows[0]).toMatchObject({ map: SWAMP, from: 47, to: 55, party: false, source: "guide", why: "單練" });
    expect(plans[activeIndex].rows.filter(entry => entry.map === SWAMP)).toHaveLength(1);
  });

  it("主推是遊戲資料的圖、這段的攻略也寫了同一張圖（後面幾級才用）：第一列照遊戲資料寫，不掛攻略的範圍、組隊、理由", () => {
    const brawler = guide(510, [
      segment({ from: 57, to: 70, kind: "party", map: GIANT, name: "巨人之林（3 人團）", why: "團練" }),
      segment({ from: 52, to: 57, map: SWAMP, name: "沼澤地" }),
    ]);
    const pick: MainPick = { kind: "map", option: option({ map: GIANT, title: "巨人之林", source: "data", mobs: [[1, 30]], row: row(GIANT, 75, 1, 30) }) };
    const { activeIndex, plans } = timelinePlans(input({ job: 510, level: 55, guides: new Map([[510, brawler]]), pick }));
    const first = plans[activeIndex].rows[0];
    expect(first).toMatchObject({ map: GIANT, source: "data", party: false, exp1: 3000 });
    expect(first.from).toBeUndefined();
    expect(first.why).toBeUndefined();
    expect(plans[activeIndex].usable).toBe(1);
  });

  it("主推的組隊任務不在這段的攻略清單裡（只重疊一級）：還是算攻略列——不說「這段還沒有玩家攻略」、不放遊戲資料替代，理由照那段攻略", () => {
    const warrior = guide(100, [segment({ from: 25, to: 30, kind: "party", map: null, name: "超級綠水靈組隊任務", pq: "kerning", why: "超綠" })]);
    const pick: MainPick = { kind: "pq", pq: { ...kerning, byJob: { 100: [25, 30] } }, window: [25, 30], job: 100 };
    const { activeIndex, plans } = timelinePlans(input({ job: 100, level: 30, guides: new Map([[100, warrior]]), pick }));
    const plan = plans[activeIndex];
    expect(plan.rows[0]).toMatchObject({ title: "超級綠水靈組隊任務", from: 25, to: 30, source: "guide", why: "超綠" });
    expect(plan.usable).toBe(1);
    expect(plan.blocked).toBe(false);
    expect(plan.fallback).toEqual([]);
  });

  it("這段的攻略圖全被職業規則擋掉、但主推是組隊任務：不說「攻略圖不適合你的職業（見上）」", () => {
    const fire = guide(210, [segment({ from: 30, to: 42, map: FIRE, name: "火焰之地Ⅱ" })]);
    const mage = guide(200, [segment({ from: 21, to: 30, kind: "party", map: null, name: "超級綠水靈組隊任務", pq: "kerning" })]);
    const pick: MainPick = { kind: "pq", pq: { ...kerning, byJob: { 200: [21, 30] } }, window: [21, 30], job: 200 };
    const { activeIndex, plans } = timelinePlans(input({ job: 210, level: 30, guides: new Map([[200, mage], [210, fire]]), pick }));
    const plan = plans[activeIndex];
    expect(plan.rows.map(entry => [entry.title, entry.warn])).toEqual([["超級綠水靈組隊任務", undefined], ["火焰之地Ⅱ", "怪抗火，火焰箭傷害打折"]]);
    expect(plan.blocked).toBe(false);
    expect(plan.usable).toBe(1);
  });

  it("主推是遊戲資料的圖、這段的攻略圖全被擋：照舊說「不適合你的職業（見上）」", () => {
    const fire = guide(210, [segment({ from: 40, to: 50, map: FIRE, name: "火焰之地Ⅱ" })]);
    const pick: MainPick = { kind: "map", option: option({ map: SWAMP, title: "沼澤地Ⅲ", source: "data", mobs: [[4, 30]] }) };
    const { activeIndex, plans } = timelinePlans(input({ job: 210, level: 45, bands: bandsFor(210), guides: new Map([[210, fire]]), pick }));
    const plan = plans[activeIndex];
    expect(plan.rows.map(entry => entry.map)).toEqual([SWAMP, FIRE]);
    expect(plan.usable).toBe(0);
    expect(plan.blocked).toBe(true);
  });

  it("主推卡的標題就是 pickTitle", () => {
    expect(pickTitle({ kind: "advance", instructors: [] })).toBe("轉職");
    expect(pickTitle({ kind: "pq", pq: moon, window: [13, 25], job: 500 })).toBe("月妙組隊任務");
    expect(pickTitle({ kind: "map", option: option({}) })).toBe("遺跡之峭壁");
  });
});

describe("升級路線的標籤跟內容一致", () => {
  it("攻略圖全被職業規則擋掉（火毒的火焰之地）：標籤寫遊戲資料替代的第一張圖，被擋的照列、寫原因；王圖不當替代", () => {
    const fire = guide(210, [segment({ from: 40, to: 50, map: FIRE, name: "火焰之地Ⅱ" })]);
    const { plans, labels } = timelinePlans(input({ job: 210, level: 90, bands: bandsFor(210), guides: new Map([[210, fire]]) }));
    const index = plans.findIndex(plan => plan.band.from === 40);
    expect(plans[index].rows).toEqual([expect.objectContaining({ map: FIRE, warn: "怪抗火，火焰箭傷害打折" })]);
    expect(plans[index].fallback.map(entry => entry.map)).toEqual([SWAMP]);
    expect(labels[index]).toBe("沼澤地Ⅲ");
  });

  it("100–120 那段沒有攻略時，遊戲資料替代查這段真正的中點，不是寫死的 Lv.99（否則 Lv.110+ 的圖全部查不到）", () => {
    const DEEP = 108000100;
    const deepMonster = monster(90, 114, DEEP, 30);
    const deepMaps: Record<string, Pick<MapRecord, "zh">> = { ...maps, [DEEP]: { zh: "深境祕地" } };
    const deepTraining = [...training, row(DEEP, 114, 90, 30)];
    const { plans } = timelinePlans(input({
      job: 100,
      level: 50,
      bands: bandsFor(100),
      monsterIndex: new Map([...monsters, deepMonster].map(entry => [entry.id, entry])),
      spawns: spawnIndex([...monsters, deepMonster]),
      maps: deepMaps,
      training: deepTraining,
    }));
    const band = plans.find(plan => plan.band.from === 100);
    // 寫死 Lv.99 時：巨人之林／遺跡之峭壁／火焰之地／沼澤地（Lv.45–75）跟新圖（Lv.114）全部不在合理範圍內，查出來是空的
    expect(band?.fallback.map(entry => entry.map)).toEqual([DEEP]);
  });

  it("你在 100–120 這段、這段沒有攻略時，遊戲資料替代用你現在的等級查，不是段落中點（跟 warnOf 同一套）", () => {
    const DEEP = 108000200;
    const deepMonster = monster(91, 124, DEEP, 30);
    const deepMaps: Record<string, Pick<MapRecord, "zh">> = { ...maps, [DEEP]: { zh: "深淵裂隙" } };
    const deepTraining = [...training, row(DEEP, 124, 91, 30)];
    const { activeIndex, plans } = timelinePlans(input({
      job: 100,
      level: 118,
      bands: bandsFor(100),
      monsterIndex: new Map([...monsters, deepMonster].map(entry => [entry.id, entry])),
      spawns: spawnIndex([...monsters, deepMonster]),
      maps: deepMaps,
      training: deepTraining,
    }));
    expect(plans[activeIndex].band).toEqual({ from: 100, to: 120 });
    // 段落中點是 110（跟你在的 Lv.118 差 8 級，查不到 Lv.124 的圖）；用你現在的等級 118 查才找得到
    expect(plans[activeIndex].fallback.map(entry => entry.map)).toEqual([DEEP]);
  });

  it("段落比所有開放的練功圖高 10 級以上、沒有攻略（100–120、90–100）：替代改列能練的最高圖（不會只剩一句「以下是遊戲資料推算」），並寫封頂提示", () => {
    // 這份測試資料最高的練功圖是巨人之林（Lv.75）：照段落中點 110／95 查，每張圖都低太多，以前查出來是空的
    const { plans } = timelinePlans(input({ job: 320, level: 50, bands: bandsFor(320) }));
    for (const from of [90, 100]) {
      const band = plans.find(plan => plan.band.from === from);
      expect(band?.usable).toBe(0);
      expect(band?.fallback.map(entry => entry.map)).toEqual([GIANT, CLIFF]);
      // 封頂提示寫那張圖最高等的怪（跟主推卡同一種寫法），段落提示不說「這張已經是你能去最好的」
      expect(band?.ceiling).toEqual({ level: 75, top: 75, best: false });
    }
  });

  it("段落跟能練的最高圖差不到 10 級：照段落中點查、不加封頂提示", () => {
    const { plans } = timelinePlans(input({ job: 320, level: 50, bands: bandsFor(320) }));
    const band = plans.find(plan => plan.band.from === 70);
    expect(band?.fallback.map(entry => entry.map)).toEqual([GIANT, CLIFF]);
    expect(band?.ceiling).toBeUndefined();
  });

  it("你在 100–120 這段、主推就是能練的最高圖：第一列是主推，替代列其他圖，封頂提示照樣寫；最高圖城鎮走不到就不算", () => {
    const pick: MainPick = { kind: "map", option: option({ map: GIANT, title: "巨人之林", mobs: [[1, 30]], level: 75 }) };
    const { activeIndex, plans } = timelinePlans(input({ job: 320, level: 105, bands: bandsFor(320), pick }));
    expect(plans[activeIndex].rows.map(entry => entry.map)).toEqual([GIANT]);
    expect(plans[activeIndex].fallback.map(entry => entry.map)).toEqual([CLIFF]);
    expect(plans[activeIndex].ceiling).toEqual({ level: 75, top: 75, best: false });
    // 巨人之林城鎮走不到：能練的最高圖改算遺跡之峭壁（Lv.71）；巨人之林照樣列在替代裡（不給去），
    // 所以提示寫的等級取列出來的怪最高的（Lv75），不會「最高到 Lv.73」旁邊擺 Lv75 的怪
    const unreachable = timelinePlans(input({ job: 320, level: 50, bands: bandsFor(320), canGo: map => map !== GIANT && map !== STAGE }));
    const band = unreachable.plans.find(plan => plan.band.from === 100);
    expect(band?.fallback.map(entry => [entry.map, entry.go])).toEqual([[GIANT, undefined], [CLIFF, CLIFF]]);
    expect(band?.ceiling).toEqual({ level: 71, top: 75, best: false });
  });

  it("有能用的攻略的段不放替代、不加封頂提示", () => {
    const warrior = guide(320, [segment({ from: 100, to: 120, map: GIANT, name: "巨人之林" })]);
    const { plans } = timelinePlans(input({ job: 320, level: 50, bands: bandsFor(320), guides: new Map([[320, warrior]]) }));
    const band = plans.find(plan => plan.band.from === 100);
    expect(band?.usable).toBe(1);
    expect(band?.fallback).toEqual([]);
    expect(band?.ceiling).toBeUndefined();
  });

  it("還沒二轉的人看 30 等以後的段：照內容寫標籤，不寫「二轉後排給你」", () => {
    const warrior = guide(100, [segment({ from: 30, to: 40, map: SWAMP, name: "沼澤地Ⅰ～Ⅲ（鱷魚）" })]);
    const { plans, labels } = timelinePlans(input({ job: 100, level: 18, bands: bandsFor(100), guides: new Map([[100, warrior]]) }));
    expect(labels[plans.findIndex(plan => plan.band.from === 30)]).toBe("沼澤地Ⅲ");
    expect(labels[plans.findIndex(plan => plan.band.from === 40)]).toBeUndefined();
    expect(labels).not.toContain("二轉後排給你");
  });

  it("同一張圖不在相鄰兩段重複當標籤，沒有別的可用時寫「同上一段」", () => {
    const warrior = guide(110, [segment({ from: 30, to: 50, map: SWAMP, name: "沼澤地" })]);
    const { plans, labels } = timelinePlans(input({ job: 110, level: 60, bands: bandsFor(110), guides: new Map([[110, warrior]]) }));
    expect(labels[plans.findIndex(plan => plan.band.from === 30)]).toBe("沼澤地Ⅲ");
    expect(labels[plans.findIndex(plan => plan.band.from === 40)]).toBe("同上一段");
  });

  it("沒選二轉的初心者：楓之島以外的段寫「轉職後排給你」", () => {
    const { labels } = timelinePlans(input({ job: 0, level: 5, bands: bandsFor(0) }));
    expect(labels.slice(1).every(label => label === "轉職後排給你")).toBe(true);
  });
});

describe("升級路線的去", () => {
  it("城鎮走不到的圖不給去（跟主推卡同一個條件）", () => {
    const fire = guide(220, [segment({ from: 40, to: 50, map: SWAMP, name: "沼澤地" })]);
    const { plans } = timelinePlans(input({ job: 220, level: 45, bands: bandsFor(220), guides: new Map([[220, fire]]), canGo: () => false }));
    expect(plans.find(plan => plan.band.from === 40)?.rows[0].go).toBeUndefined();
  });

  it("被職業規則擋掉的攻略圖不給去：照列、寫原因，只當資訊（火毒 90 的火焰之地Ⅱ）", () => {
    const fire = guide(210, [segment({ from: 40, to: 50, map: FIRE, name: "火焰之地Ⅱ" }), segment({ from: 40, to: 50, map: SWAMP, name: "沼澤地" })]);
    const { plans } = timelinePlans(input({ job: 210, level: 90, bands: bandsFor(210), guides: new Map([[210, fire]]) }));
    const rows = plans.find(plan => plan.band.from === 40)?.rows ?? [];
    expect(rows.map(entry => [entry.map, entry.warn, entry.go])).toEqual([
      [FIRE, "怪抗火，火焰箭傷害打折", undefined],
      [SWAMP, undefined, SWAMP],
    ]);
  });

  it("離開楓之島之後，楓之島的圖不給去", () => {
    const pick: MainPick = { kind: "map", option: option({ map: ISLAND, title: "嫩寶狩獵場Ⅰ" }) };
    const onIsland = timelinePlans(input({ job: 0, level: 5, bands: bandsFor(0), pick }));
    expect(onIsland.plans[onIsland.activeIndex].rows[0]).toMatchObject({ map: ISLAND, go: ISLAND });
    const left = timelinePlans(input({ job: 100, level: 12, bands: bandsFor(100), pick }));
    expect(left.plans[left.activeIndex].rows[0]).toMatchObject({ map: ISLAND });
    expect(left.plans[left.activeIndex].rows[0].go).toBeUndefined();
  });
});
