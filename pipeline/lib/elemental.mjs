/**
 * 怪物屬性抗性：上游 artale.json 的 elemental.values（{ fire: "weak", ice: "resist", … }）壓成 { f: "w", i: "r" }。
 * 代碼的約定見 src/lib/types.ts 的 Monster.el；怪物卡（src/lib/format.ts）跟職業規則（src/lib/job-rules.ts：
 * 火毒避開抗火的圖、冰雷找怕冰雷的圖）都靠這組代碼。
 *
 * 以前認不得的寫法取首字母存：上游的 resist 因此存成 r，怪物卡的對照表只認 s，畫面就寫出「冰 r」（2026-10-07 查到）。
 * 改成明確對照，上游出現認不得的寫法就讓重建失敗——資料自動更新不會合併上線，不再默默存成玩家看不懂的代碼。
 */

/** 上游的屬性名 → 資料檔的鍵 */
const ELEMENT_KEY = { fire: "f", ice: "i", lightning: "l", poison: "p", holy: "h" };

/** 上游的抗性寫法 → 資料檔的值。strong 是管線原本對照表裡的寫法（實際資料沒出現過），跟 resist 同義 */
const RESIST_CODE = { immune: "i", resist: "r", strong: "r", weak: "w" };

export function compactElemental(elemental) {
  if (!elemental?.values) return undefined;
  const out = {};
  for (const [element, value] of Object.entries(elemental.values)) {
    if (!value || value === "normal") continue;
    const key = ELEMENT_KEY[element];
    const code = RESIST_CODE[value];
    if (!key || !code) {
      throw new Error(`上游怪物屬性出現認不得的寫法「${element}: ${value}」，格式可能改了——在 pipeline/lib/elemental.mjs 補對照、src/lib/format.ts 補字，再重建`);
    }
    out[key] = code;
  }
  return Object.keys(out).length ? out : undefined;
}
