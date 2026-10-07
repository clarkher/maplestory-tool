/**
 * 怪物屬性抗性：上游 artale.json 的 elemental.values（{ fire: "weak", ice: "resist", … }）壓成 { f: "w", i: "r" }。
 * 代碼的約定見 src/lib/types.ts 的 Monster.el；怪物卡（src/lib/format.ts）跟職業規則（src/lib/job-rules.ts：
 * 火毒避開抗火的圖、冰雷找怕冰雷的圖）都靠這組代碼。
 *
 * 以前認不得的寫法取首字母存：上游的 resist 因此存成 r，怪物卡的對照表只認 s，畫面就寫出「冰 r」（2026-10-07 查到）。
 * 改成明確對照，上游出現認不得的寫法就讓重建失敗——資料自動更新不會合併上線，不再默默存成玩家看不懂的代碼。
 */

/**
 * 上游的屬性名 → 資料檔的鍵。dark 上游整理過的 values 目前還沒給（客戶端原始代碼裡有 4 隻混沌系怪帶暗屬性），
 * 先對好，補進來時重建不會停下來（2026-10-07 使用者選的）
 */
export const ELEMENT_KEY = { fire: "f", ice: "i", lightning: "l", poison: "p", holy: "h", dark: "d" };

/** 上游的抗性寫法 → 資料檔的值。strong 是管線原本對照表裡的寫法（實際資料沒出現過），跟 resist 同義 */
export const RESIST_CODE = { immune: "i", resist: "r", strong: "r", weak: "w" };

/** monster 是錯誤訊息裡的怪物（「8140000 白狼人」），方便回頭查上游 */
export function compactElemental(elemental, monster = "") {
  if (!elemental?.values) return undefined;
  const out = {};
  for (const [element, value] of Object.entries(elemental.values)) {
    if (!value || value === "normal") continue;
    // 用 hasOwn 查表：constructor、toString 這類物件內建的名字也要算認不得
    if (!Object.hasOwn(ELEMENT_KEY, element) || !Object.hasOwn(RESIST_CODE, value)) {
      throw new Error(
        `上游怪物 ${monster || "（未標示）"} 的屬性出現認不得的寫法「${element}: ${value}」，格式可能改了——` +
          "在 pipeline/lib/elemental.mjs 補對照、src/lib/format.ts 補字（新的抗性種類也看 src/lib/job-rules.ts 要不要算進去），再重建",
      );
    }
    out[ELEMENT_KEY[element]] = RESIST_CODE[value];
  }
  return Object.keys(out).length ? out : undefined;
}
