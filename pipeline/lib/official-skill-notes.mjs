/**
 * 官方公告改了、遊戲資料（說明）還沒跟上的技能：卡片多放一行官方公告的數字（buildSkills 寫進 skills.json 的 note）。
 *
 * 只收官方白紙黑字公告過的；每筆寫 stale：遊戲說明還符合這個樣子才放（說明哪天改了就自動不放，不跟遊戲自己的字重複）。
 * 2026-10-16 使用者選 3A：脫離戰場冷卻官方 10/15【系統與職業平衡調整】改成 1.5 秒，上游 2.0.0 的說明還寫 3 秒。
 */
export const OFFICIAL_SKILL_NOTES = {
  5201006: {
    text: "官方 10/15 公告：再次使用等待時間從 3 秒改成 1.5 秒（遊戲說明還沒改）",
    stale: /等待時間\s*[：:]\s*3\s*秒/,
    source: "https://maplestoryclassic-event.beanfun.com/EventAd/EventAd?eventAdId=20210",
  },
};

/** 這個技能卡片要不要多一行官方公告：{ t: 字, s: 官方出處 }，不用就 undefined */
export function officialSkillNote(id, desc) {
  const entry = OFFICIAL_SKILL_NOTES[id];
  if (!entry || !entry.stale.test(desc ?? "")) return undefined;
  return { t: entry.text, s: entry.source };
}
