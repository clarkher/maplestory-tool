/**
 * 技能卡（查資料・技能）的「效果」那一行跟「各等級數值」，抽出來單獨測。
 *
 * 規則（2026-10-08 使用者看候選截圖選 B）：效果樣板有 #mpCon 這種代號時，改寫滿級那一級的遊戲原文；
 * 好幾級但上游沒有數值的（槍連擊、極速詠唱…8 個），一級一列放每一級的遊戲原文。數字一律照遊戲資料，不從句子硬拆、不編。
 */
import { jobTier, previousJob, stageJob, tierStartLevel } from "./jobs";
import { spAtLevel } from "./skill-plan";
import type { Skill } from "./types";

/**
 * table：照列每一級（第 i 列是 i+1 級；那一級沒有這個數值是 null，畫面寫「—」）。
 *   整列都沒有數值、遊戲有那一級的原文時，rowText 帶那一句（鍵是級數，例：隱身術 20 級），畫面那一列放原文。
 * text：好幾級、每一級都沒有數值（槍連擊、蓄能激發…），第 i 列是 i+1 級的遊戲原文，沒有原文的是 null（畫面寫「—」）。
 * sameText：好幾級沒有數值、每一級的原文都一樣（魔力淨化 16 級都是「增加一定量的MP的恢復量」），沒有每一級的數字可列；
 *   text 是那一句（效果行不是這一句時，卡片要把它寫出來）。
 * noLevels：遊戲資料沒有每一級的資料——skills.json 沒有 levels（神匠之魂等 7 個），或好幾級但數值、原文都沒有，
 *   卡片照實寫原因、不編數字。
 * noValues：只有一級、沒有數值（英雄共鳴、坐騎等 30 個），效果樣板本身就是完整句子，寫在「效果：」那行，不列表。
 */
export type SkillLevels =
  | { kind: "table"; fields: SkillField[]; rows: (number | null)[][]; rowText?: Record<number, string> }
  | { kind: "text"; rows: (string | null)[] }
  | { kind: "sameText"; count: number; text: string }
  | { kind: "noLevels" }
  | { kind: "noValues" };

/** 數值表的一欄：表頭用資料給的中文名；unit 是樣板裡那個代號後面接的單位（「攻擊力#damage%」→ %、「隱身#time秒」→ 秒） */
export type SkillField = { key: string; label: string; unit?: string };

/** 效果樣板裡的代號：# 後面接英文字母（#mpCon、#damage…） */
const TOKEN = /#[A-Za-z]/;

/**
 * 「效果」那一行：樣板沒有代號就照原句（英雄共鳴、魔力淨化）；有代號或沒有樣板，改寫滿級那一級的遊戲原文、
 * 標「滿級效果（N 級）」；找不到滿級原文就不放這一行（回 null），不露出代號。
 */
export function skillEffect(skill: Pick<Skill, "formula" | "levels" | "levelText">): { label: string; text: string } | null {
  const formula = skill.formula?.trim();
  if (formula && !TOKEN.test(formula)) return { label: "效果", text: formula };
  const max = skill.levels?.length ?? 0;
  const text = max ? skill.levelText?.[max] : undefined;
  return text ? { label: `滿級效果（${max} 級）`, text } : null;
}

/** 欄位是每一級出現過的數值，照第一次出現的順序；表頭用資料給的中文名，沒給就照原本的鍵 */
export function skillLevels(skill: Pick<Skill, "levels" | "labels" | "levelText" | "formula">): SkillLevels {
  const levels = skill.levels ?? [];
  if (!levels.length) return { kind: "noLevels" };
  const textOf = (index: number) => skill.levelText?.[index + 1] ?? null;
  const keys = new Set<string>();
  for (const level of levels) for (const key of Object.keys(level)) keys.add(key);
  const fields = [...keys];
  if (!fields.length) {
    if (levels.length === 1) return { kind: "noValues" };
    const texts = levels.map((_, index) => textOf(index));
    if (texts.every(text => text === null)) return { kind: "noLevels" };
    const [first] = texts;
    if (first !== null && texts.every(text => text === first)) return { kind: "sameText", count: levels.length, text: first };
    return { kind: "text", rows: texts };
  }
  const rowText: Record<number, string> = {};
  levels.forEach((level, index) => {
    const text = textOf(index);
    if (text && !Object.keys(level).length) rowText[index + 1] = text;
  });
  return {
    kind: "table",
    fields: fields.map(key => {
      const unit = skill.formula?.match(new RegExp(`#${key}(%|秒)`))?.[1];
      return { key, label: skill.labels?.[key] ?? key, ...(unit ? { unit } : {}) };
    }),
    rows: levels.map(level => fields.map(key => level[key] ?? null)),
    ...(Object.keys(rowText).length ? { rowText } : {}),
  };
}

/** 數字：阿拉伯數字，或後面接「名」「次」「個」的中文數字（「對兩名怪物」「三次攻擊」「五個分身」） */
const NUMBER = /\d+(?:\.\d+)?|[一二兩三四五六七八九十]+(?=[名次個])/g;

/**
 * 文字表（槍連擊這類一級一列放原文的）每一列要標出來的數字：跟上一級同一個位置的數字不一樣的才標，
 * 往下掃一眼就知道升這一級多了什麼。第 1 級（prev 是 null）不標；數字變多（蓄能激發 4 級多了一句）多出來的算變了。
 */
export function changedParts(prev: string | null, cur: string): { text: string; changed: boolean }[] {
  if (prev === null) return [{ text: cur, changed: false }];
  const before = prev.match(NUMBER) ?? [];
  const parts: { text: string; changed: boolean }[] = [];
  let last = 0;
  let index = 0;
  for (const match of cur.matchAll(NUMBER)) {
    if (match.index > last) parts.push({ text: cur.slice(last, match.index), changed: false });
    parts.push({ text: match[0], changed: before[index] !== match[0] });
    last = match.index + match[0].length;
    index++;
  }
  if (last < cur.length) parts.push({ text: cur.slice(last), changed: false });
  return parts;
}

const TIER_NAME = { 1: "一轉", 2: "二轉", 3: "三轉" } as const;

/**
 * 存了角色時，這個技能你現在最多點得到第幾級：這一轉拿到的點數（轉職 1 點、之後每級 3 點，跟首頁技能條同一套，
 * skill-plan.ts）全點這招能到的級數。已經過了的那一轉照那一轉拿到的點數算（一轉、二轉的點數都夠把單一技能點滿）。
 * 不是自己的職業線、還沒轉到的那一轉、初心者技能、還沒存角色：回 null，卡片不標。
 */
export function reachableLevel(
  skill: Pick<Skill, "job" | "levels">,
  profile: { job: number; level: number },
): { level: number; sp: number; full: boolean; tier: string } | null {
  const max = skill.levels?.length ?? 0;
  if (skill.job <= 0 || !max || profile.job < 0 || profile.level <= 0) return null;
  // 現在實際在哪一轉，往上一轉一路找到一轉：技能的職業要在這條線上
  const line: number[] = [];
  for (let job = stageJob(profile.job, profile.level); job > 0; job = previousJob(job)) line.push(job);
  const at = line.indexOf(skill.job);
  if (at < 0) return null;
  const sp = at === 0 ? spAtLevel(skill.job, profile.level) : spAtLevel(skill.job, tierStartLevel(line[at - 1]));
  const tier = jobTier(skill.job);
  return { level: Math.min(max, sp), sp, full: sp >= max, tier: tier ? TIER_NAME[tier] : "" };
}

/**
 * 上游壞掉的技能圖示（2026-10-08 查：整張是綠色雜訊）。向下跳躍 1006 跟皇家騎士團版的同一個技能 10001006 是同一張圖——
 * 初心者技能 1000～1005、1007、1009 兩版的圖檔逐位元組一樣，只有 1006 這張壞了——改用那一張。
 * 木妖的弱點攻擊 9001 在客戶端圖集裡對不出是哪一張（肥肥 9000、綠水靈 9002 跟皇家騎士團版也不同），找不到可靠的圖就不放，
 * 不放壞掉的圖。上游同步會整個覆蓋 public/assets/skills，所以不改檔案、在這裡換。
 */
const ICON_FROM: Record<number, number> = { 1006: 10001006 };
const NO_ICON = new Set([9001]);

/** 技能圖示的網址；圖是壞的、又找不到可靠替代的回 undefined（清單、卡片就不放圖） */
export function skillIcon(id: number): string | undefined {
  if (NO_ICON.has(id)) return undefined;
  return `/assets/skills/${ICON_FROM[id] ?? id}.png`;
}
