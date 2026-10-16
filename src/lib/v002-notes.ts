/**
 * V002（10/15）官方確定、但還沒有台服攻略可以排進推薦的內容：首頁主推卡下面多一行，不改主推。
 *
 * 2026-10-16 使用者選 1A「只放官方確定的」：女神的痕跡組隊任務官方寫了 51～70 等、6 人、最終獎勵女神手鐲
 * （【內容擴充】https://maplestoryclassic-event.beanfun.com/EventAd/EventAd?eventAdId=20209），
 * 但各職業幾等去打沒有玩家攻略，所以不進 pq.json（那裡的範圍是從攻略段落算的，會變成主推）。
 */
export const GODDESS_PQ = {
  /** 遊戲資料的任務「女神的痕跡」 */
  quest: "1203",
  /** 入口：天空之城的疑問之塔（溫莉） */
  entrance: 200080101,
  minLv: 51,
  maxLv: 70,
};

/** 這個等級要不要提女神的痕跡：{ text, quest: 任務卡連結 }，不在範圍回 null */
export function goddessPqNote(level: number): { text: string; quest: string } | null {
  if (level < GODDESS_PQ.minLv || level > GODDESS_PQ.maxLv) return null;
  return {
    text: "51～70 等可以打組隊任務「女神的痕跡」：到天空之城的疑問之塔找溫莉，要 6 個人，最終獎勵女神手鐲。台服打法還沒有人整理。",
    quest: `/db/quests?id=${GODDESS_PQ.quest}`,
  };
}
