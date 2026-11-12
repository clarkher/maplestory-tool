/**
 * 楓葉武器衝卷規劃器的計算（v2.18）：三種衝法，精確列舉，不是模擬，每次數字一樣。
 * 規則照台服 11/12 公告：一天最多 100 枚、掉幣 21 天（2,100 枚）；武器 35 級 100 枚、43 級 200 枚，可衝 7 次；
 * 卷軸一張 100 枚（70%、15% 另付 30 萬楓幣）：100% +1、70% +2、15% +5。失敗只扣次數、不會爆。
 *
 * 楓谷幫手推薦（＝攻略文的懶人包）：每把先賭兩張 15%，中了剩下全衝 70%；兩張都沒中換一把新的。
 * 剩下的幣只夠「一把＋7 張」時，那把直接全衝 70%。43 級算出來平均 +11.642、+12 以上 52.6%（單元測試對答案）。
 */

import { LEAF_FIRST_SHOP_DAY } from "./calendar";

export type Rate = 100 | 70 | 15;
export type Strategy = "pick" | "s70" | "s100";

/** 加攻擊 → 機率 */
export type Dist = Map<number, number>;

export type PlanStep = {
  /** 第幾天換（DAY 1＝11/19），照每天 100 枚、幣夠就換的最早那天 */
  day: number;
  kind: "weapon" | "scroll";
  rate?: Rate;
  /** 第幾把（1 起） */
  target: number;
  /** 前面的 15% 沒中才會走到這一步 */
  ifMiss?: true;
  /** 這一步花幾枚 */
  coins: number;
};

export type Plan = {
  /** 最糟那條路（每次賭都沒中）照順序的每一步；中了以後怎麼走寫在畫面上 */
  steps: PlanStep[];
  /** 最後留下的那把加了多少攻擊 */
  outcome: Dist;
  /** 要另付 30 萬楓幣的卷（70%、15%）用幾張：平均、最多 */
  paidScrolls: { mean: number; max: number };
  /** 最糟那條路用掉的硬幣 */
  coinsMax: number;
  /** 推薦衝法賭幾把（最後那把全 70% 不算） */
  tries: number;
};

export const DAILY_COINS = 100;
export const TOTAL_COINS = 2100;
export const SLOTS = 7;
export const SCROLL_COINS = 100;
export const PAID_MESO = 300_000;
/** 每把賭幾張 15%（攻略文那支 session 算過：一把一把來的規則裡兩張最高） */
export const GAMBLE = 2;

const SCROLL: Record<Rate, [p: number, add: number]> = { 100: [1, 1], 70: [0.7, 2], 15: [0.15, 5] };

function addTo(target: Dist, key: number, p: number) {
  if (p > 0) target.set(key, (target.get(key) ?? 0) + p);
}

/** 一把照順序衝完這些卷 → 加攻擊的分布 */
export function scrollDist(rates: Rate[]): Dist {
  let dist: Dist = new Map([[0, 1]]);
  for (const rate of rates) {
    const [p, add] = SCROLL[rate];
    const next: Dist = new Map();
    for (const [k, v] of dist) {
      addTo(next, k + add, v * p);
      addTo(next, k, v * (1 - p));
    }
    dist = next;
  }
  return dist;
}

/** 照順序排日子：每天進帳 100 枚，幣夠就換，不會比前一步早；DAY 1 只能存，最早 DAY 2 換 */
function schedule(steps: Omit<PlanStep, "day">[]): PlanStep[] {
  let spent = 0;
  let day = LEAF_FIRST_SHOP_DAY;
  return steps.map(step => {
    spent += step.coins;
    day = Math.max(day, Math.ceil(spent / DAILY_COINS));
    return { ...step, day };
  });
}

export function buildPlan(strategy: Strategy, weaponCost: 100 | 200): Plan {
  if (strategy !== "pick") {
    const rate: Rate = strategy === "s70" ? 70 : 100;
    const raw: Omit<PlanStep, "day">[] = [{ kind: "weapon", target: 1, coins: weaponCost }];
    for (let i = 0; i < SLOTS; i++) raw.push({ kind: "scroll", rate, target: 1, coins: SCROLL_COINS });
    const paid = rate === 100 ? 0 : SLOTS;
    return { steps: schedule(raw), outcome: scrollDist(Array(SLOTS).fill(rate)), paidScrolls: { mean: paid, max: paid }, coinsMax: weaponCost + SLOTS * SCROLL_COINS, tries: 0 };
  }

  // 賭一把最多花「武器＋兩張 15%」；賭完還要留得下最後那把「武器＋7 張 70%」
  const tryCost = weaponCost + GAMBLE * SCROLL_COINS;
  const lastCost = weaponCost + SLOTS * SCROLL_COINS;
  let tries = 0;
  for (let left = TOTAL_COINS; left - tryCost >= lastCost; left -= tryCost) tries++;

  const raw: Omit<PlanStep, "day">[] = [];
  for (let t = 1; t <= tries; t++) {
    raw.push({ kind: "weapon", target: t, coins: weaponCost, ...(t > 1 ? { ifMiss: true as const } : {}) });
    for (let i = 1; i <= GAMBLE; i++) raw.push({ kind: "scroll", rate: 15, target: t, coins: SCROLL_COINS, ...(t > 1 || i > 1 ? { ifMiss: true as const } : {}) });
  }
  const last = tries + 1;
  raw.push({ kind: "weapon", target: last, coins: weaponCost, ifMiss: true });
  for (let i = 0; i < SLOTS; i++) raw.push({ kind: "scroll", rate: 70, target: last, coins: SCROLL_COINS, ifMiss: true });

  // 第 t 把第 i 張 15% 中了：+5，剩下 7-i 次全 70%；之前全沒中的機率是 0.85^(之前賭過幾張)
  const outcome: Dist = new Map();
  const paid: Dist = new Map();
  let miss = 1;
  for (let t = 0; t < tries; t++) {
    for (let i = 1; i <= GAMBLE; i++) {
      const reach = miss * 0.15;
      for (const [k, v] of scrollDist(Array(SLOTS - i).fill(70))) addTo(outcome, k + 5, reach * v);
      // 這把中了：之前每把賭的兩張＋這把 7 張
      addTo(paid, GAMBLE * t + SLOTS, reach);
      miss *= 0.85;
    }
  }
  for (const [k, v] of scrollDist(Array(SLOTS).fill(70))) addTo(outcome, k, miss * v);
  addTo(paid, GAMBLE * tries + SLOTS, miss);

  const mean = [...paid].reduce((sum, [n, p]) => sum + n * p, 0);
  return { steps: schedule(raw), outcome, paidScrolls: { mean, max: GAMBLE * tries + SLOTS }, coinsMax: tries * tryCost + lastCost, tries };
}

export type Stats = {
  mean: number;
  best: number;
  worst: number;
  /** 最常拿到的加攻擊跟它的機率 */
  mode: number;
  modeP: number;
  /** 加攻擊 ≥ k 的機率 */
  atLeast: (k: number) => number;
  /** 由高到低每個拿得到的加攻擊 */
  values: number[];
};

export function statsOf(dist: Dist): Stats {
  const values = [...dist.keys()].sort((a, b) => b - a);
  let mean = 0;
  let mode = values[0];
  for (const k of values) {
    mean += k * dist.get(k)!;
    if (dist.get(k)! > dist.get(mode)!) mode = k;
  }
  const atLeast = (k: number) => values.filter(v => v >= k).reduce((sum, v) => sum + dist.get(v)!, 0);
  return { mean, best: values[0], worst: values[values.length - 1], mode, modeP: dist.get(mode)!, atLeast, values };
}

// ---------- 自己排（v2.18 使用者：「要可以自訂跟清空」） ----------

/** 自己排的一樣東西：哪天換、換武器還是卷軸、卷軸衝第幾把 */
export type PlanItem = { day: number; kind: "weapon" | "scroll"; rate?: Rate; target: number };

/** 硬幣最後能花的那天（12/16，DAY 28）；進帳只到 DAY 21 */
export const LAST_SHOP_DAY = 28;
export const COIN_DAYS = 21;

export type Evaluation = {
  /** 買了的每一把（照編號）：衝了哪些卷、加攻擊分布 */
  weapons: { target: number; day: number; rates: Rate[]; dist: Dist }[];
  /** 最後最好那把加了多少（每把各自衝，取最高） */
  outcome: Dist | null;
  paidScrolls: number;
  coinsUsed: number;
  /** 硬幣第一天不夠的那天、差幾枚 */
  short: { day: number; lack: number } | null;
  /** 排在 DAY 1（還不能換）、武器換到之前、或那把已經衝滿 7 次的卷 */
  invalid: PlanItem[];
};

/** 照日子、同一天武器先、再照排進去的順序 */
export function sortItems(items: PlanItem[]): PlanItem[] {
  return items.map((item, i) => ({ item, i })).sort((a, b) => a.item.day - b.item.day || (a.item.kind === "weapon" ? 0 : 1) - (b.item.kind === "weapon" ? 0 : 1) || a.i - b.i).map(x => x.item);
}

/** 幾把武器各自衝完，取最高那把的分布（各把獨立：把每把「≤ k」的機率乘起來） */
export function maxDist(dists: Dist[]): Dist {
  const keys = [...new Set(dists.flatMap(d => [...d.keys()]))].sort((a, b) => a - b);
  const cdf = (d: Dist, k: number) => [...d].reduce((sum, [v, p]) => (v <= k ? sum + p : sum), 0);
  const out: Dist = new Map();
  let prev = 0;
  for (const k of keys) {
    const c = dists.reduce((prod, d) => prod * cdf(d, k), 1);
    addTo(out, k, c - prev);
    prev = c;
  }
  return out;
}

export function evaluate(items: PlanItem[], weaponCost: 100 | 200): Evaluation {
  const sorted = sortItems(items);
  const weapons = new Map<number, { target: number; day: number; rates: Rate[] }>();
  const invalid: PlanItem[] = [];
  let paidScrolls = 0;
  let coinsUsed = 0;
  for (const item of sorted) {
    if (item.day < LEAF_FIRST_SHOP_DAY) {
      invalid.push(item);
      continue;
    }
    if (item.kind === "weapon") {
      if (!weapons.has(item.target)) weapons.set(item.target, { target: item.target, day: item.day, rates: [] });
      coinsUsed += weaponCost;
      continue;
    }
    coinsUsed += SCROLL_COINS;
    if (item.rate !== 100) paidScrolls++;
    const w = weapons.get(item.target);
    if (!w || w.rates.length >= SLOTS) invalid.push(item);
    else w.rates.push(item.rate!);
  }

  let short: Evaluation["short"] = null;
  let spent = 0;
  const byDay = new Map<number, number>();
  for (const item of sorted) if (item.day >= LEAF_FIRST_SHOP_DAY) byDay.set(item.day, (byDay.get(item.day) ?? 0) + (item.kind === "weapon" ? weaponCost : SCROLL_COINS));
  for (let day = 1; day <= LAST_SHOP_DAY && !short; day++) {
    spent += byDay.get(day) ?? 0;
    const income = DAILY_COINS * Math.min(day, COIN_DAYS);
    if (spent > income) short = { day, lack: spent - income };
  }

  const list = [...weapons.values()].sort((a, b) => a.target - b.target).map(w => ({ ...w, dist: scrollDist(w.rates) }));
  return { weapons: list, outcome: list.length ? maxDist(list.map(w => w.dist)) : null, paidScrolls, coinsUsed, short, invalid };
}

/** 這天再換這樣東西，硬幣撐不撐得住（後面排好的也算進去）：撐不住按鈕就不給按（使用者 11/12：「幣不夠不能按超過」） */
export function affordable(items: PlanItem[], item: PlanItem, weaponCost: 100 | 200): boolean {
  return evaluate([...items, item], weaponCost).short === null;
}

/** 推薦衝法的步驟轉成可以自己改的清單（「沒中才換」的標記拿掉：改過就照排的全部換、全部衝） */
export function toItems(steps: PlanStep[]): PlanItem[] {
  return steps.map(({ day, kind, rate, target }) => (rate ? { day, kind, rate, target } : { day, kind, target }));
}
