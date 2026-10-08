/**
 * 技能卡（查資料・技能）的「各等級數值」表，抽出來單獨測。
 */
import type { Skill } from "./types";

/**
 * table：照列每一級（第 i 列是 i+1 級；那一級沒有這個數值是 null，畫面寫「—」）。
 * noLevels：遊戲資料沒有分等級的資料（skills.json 沒有 levels，例如神匠之魂），卡片照實寫原因、不編數字。
 * noValues：有分等級、但每一級都沒有數值，不列表。只有一級的（英雄共鳴等 31 個）效果寫在「效果：」那行；
 * 多級的（槍連擊、蓄能激發等）上游每一級其實有文字說明，只是建置時沒留，卡片目前沒有每一級的數值——不能寫「遊戲資料沒有」。
 */
export type SkillLevels =
  | { kind: "table"; fields: { key: string; label: string }[]; rows: (number | null)[][] }
  | { kind: "noLevels" }
  | { kind: "noValues" };

/** 欄位是每一級出現過的數值，照第一次出現的順序；表頭用資料給的中文名，沒給就照原本的鍵 */
export function skillLevels(skill: Pick<Skill, "levels" | "labels">): SkillLevels {
  const levels = skill.levels ?? [];
  if (!levels.length) return { kind: "noLevels" };
  const keys = new Set<string>();
  for (const level of levels) for (const key of Object.keys(level)) keys.add(key);
  const fields = [...keys];
  if (!fields.length) return { kind: "noValues" };
  return {
    kind: "table",
    fields: fields.map(key => ({ key, label: skill.labels?.[key] ?? key })),
    rows: levels.map(level => fields.map(key => level[key] ?? null)),
  };
}
