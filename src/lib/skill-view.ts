/**
 * 技能卡（查資料・技能）的「效果」那一行跟「各等級數值」，抽出來單獨測。
 *
 * 規則（2026-10-08 使用者看候選截圖選 B）：效果樣板有 #mpCon 這種代號時，改寫滿級那一級的遊戲原文；
 * 好幾級但上游沒有數值的（槍連擊、極速詠唱…8 個），一級一列放每一級的遊戲原文。數字一律照遊戲資料，不從句子硬拆、不編。
 */
import type { Skill } from "./types";

/**
 * table：照列每一級（第 i 列是 i+1 級；那一級沒有這個數值是 null，畫面寫「—」）。
 *   整列都沒有數值、遊戲有那一級的原文時，rowText 帶那一句（鍵是級數，例：隱身術 20 級），畫面那一列放原文。
 * text：好幾級、每一級都沒有數值（槍連擊、蓄能激發…），第 i 列是 i+1 級的遊戲原文，沒有原文的是 null（畫面寫「—」）。
 * sameText：好幾級沒有數值、每一級的原文都一樣（魔力淨化 16 級都是「增加一定量的MP的恢復量」），沒有每一級的數字可列。
 * noLevels：遊戲資料沒有每一級的資料——skills.json 沒有 levels（神匠之魂等 7 個），或好幾級但數值、原文都沒有，
 *   卡片照實寫原因、不編數字。
 * noValues：只有一級、沒有數值（英雄共鳴、坐騎等 30 個），效果樣板本身就是完整句子，寫在「效果：」那行，不列表。
 */
export type SkillLevels =
  | { kind: "table"; fields: { key: string; label: string }[]; rows: (number | null)[][]; rowText?: Record<number, string> }
  | { kind: "text"; rows: (string | null)[] }
  | { kind: "sameText"; count: number }
  | { kind: "noLevels" }
  | { kind: "noValues" };

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
export function skillLevels(skill: Pick<Skill, "levels" | "labels" | "levelText">): SkillLevels {
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
    if (texts.every(text => text === texts[0])) return { kind: "sameText", count: levels.length };
    return { kind: "text", rows: texts };
  }
  const rowText: Record<number, string> = {};
  levels.forEach((level, index) => {
    const text = textOf(index);
    if (text && !Object.keys(level).length) rowText[index + 1] = text;
  });
  return {
    kind: "table",
    fields: fields.map(key => ({ key, label: skill.labels?.[key] ?? key })),
    rows: levels.map(level => fields.map(key => level[key] ?? null)),
    ...(Object.keys(rowText).length ? { rowText } : {}),
  };
}
