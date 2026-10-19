import type { MainPick } from "@/lib/now-plan";

/**
 * V002（10/15）官方確定、但還沒有台服攻略可以排進推薦的內容：首頁主推卡下面多一行，不改主推。
 *
 * 2026-10-16 使用者選 1A「只放官方確定的」：女神的痕跡組隊任務官方寫了 51～70 等、6 人、最終獎勵女神手鐲
 * （【內容擴充】https://maplestoryclassic-event.beanfun.com/EventAd/EventAd?eventAdId=20209），
 * 但各職業幾等去打沒有玩家攻略，所以不進 pq.json（那裡的範圍是從攻略段落算的，會變成主推）。
 *
 * v1.08（2026-10-19）起女神組隊進了 pq.json，劍士三職、刺客、俠盜、僧侶 51～70 主推它；
 * 主推是女神組隊時這行不顯示（goddessNoteFor），其他職業照舊提醒。
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
    text: "51～70 等可以打組隊任務「女神的痕跡」：到天空之城的疑問之塔找溫莉，要 6 個人，最終獎勵女神手鐲。",
    quest: `/db/quests?id=${GODDESS_PQ.quest}`,
  };
}

/**
 * 首頁要不要放這一行：主推已經是女神組隊（pq.json 的 1203）就不放，免得跟上面那張主推卡重複；
 * 其他情況照 goddessPqNote（51～70 等才有）。pick 傳首頁主推卡拿到的那個。
 */
export function goddessNoteFor(level: number, pick: MainPick | undefined): { text: string; quest: string } | null {
  if (pick?.kind === "pq" && pick.pq.quest === GODDESS_PQ.quest) return null;
  return goddessPqNote(level);
}
