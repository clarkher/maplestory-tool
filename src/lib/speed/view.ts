// src/lib/speed/view.ts
/**
 * 練功測速頁（src/app/plan/speed）畫面上的字跟要送出去的資料：純函式，頁面只管接線。
 */
import { formatNumber } from "@/lib/format";
import { jobOption } from "@/lib/jobs";
import type { MemberExp } from "./party-exp";
import type { RunPayload } from "./server/rules";
import type { SpeedParty } from "./settings";
import { durationMs, startManual, switchMode, type Mode, type Segment, type Step, type Tracker } from "./tracker";

/** 隊伍最多 6 人：自己＋其他 5 人；等級 1～120（跟 settings.ts、伺服器的檢查一樣） */
export const MAX_OTHERS = 5;
const MAX_LEVEL = 120;

/** 經驗占這一級的幾 %：用讀到的經驗 ÷ 經驗表算，不用畫面認的 % 數字（那幾位比較容易認錯）；表裡沒有這級回 null */
export function levelPercent(exp: number, level: number, toNext: number[]): number | null {
  const need = toNext[level];
  return need ? (exp / need) * 100 : null;
}

/** 職業名；初心者（0）不在轉職表裡，另外寫 */
export function jobName(job: number | null): string | null {
  if (job === null) return null;
  if (job === 0) return "初心者";
  return jobOption(job)?.name ?? null;
}

/** 隊友等級欄打的字：1～120 的整數才算，其他（空的、小數、超過）回 null */
export function partyLevel(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const level = Number(trimmed);
  return level >= 1 && level <= MAX_LEVEL ? level : null;
}

/**
 * 組隊卡的草稿 → 存進這台電腦（也拿來算經驗）的組隊設定，一定合法：
 * 空的、打到一半、超過範圍的格子不存（畫面上照樣留著），打怪的人照著挪到同一位隊友身上；
 * 打怪的那一格還沒填好就先算自己打。不能把不合法的等級存進去：重新整理時那一格會被濾掉，打怪的人就位移到別人身上。
 */
export function draftParty(on: boolean, drafts: string[], hitter: number): SpeedParty {
  const others: number[] = [];
  let kept = 0;
  drafts.forEach((text, i) => {
    const level = partyLevel(text);
    if (level === null || others.length >= MAX_OTHERS) return;
    others.push(level);
    if (hitter === i + 1) kept = others.length;
  });
  return { on, others, hitter: kept };
}

/** 刪掉第 removed 個隊友（others 的索引）後，打怪的人（0＝自己，i≥1＝others[i−1]）要指到誰 */
export function hitterAfterRemove(hitter: number, removed: number): number {
  const row = removed + 1;
  if (hitter === row) return 0;
  return hitter > row ? hitter - 1 : hitter;
}

export type SpeedStatus = "idle" | "waiting" | "reading" | "lost";

/**
 * 手動模式的按鈕：分享中（認得到或一時認不到畫面都算）還沒開始給「開始」；計時中一定給「停止」——
 * 畫面一張認不到就把「停止」藏起來，玩家會以為已經停了、也沒辦法停。
 */
export function manualControl(mode: Mode, manualOn: boolean, sharing: boolean): "start" | "stop" | null {
  if (mode !== "manual") return null;
  if (manualOn) return "stop";
  return sharing ? "start" : null;
}

/** 控制卡下面那行狀態。手動計時中認不到畫面要寫明「還在計時」，不能看起來像停了 */
export function statusLine(s: { status: SpeedStatus; bar: boolean; exp: boolean; mode: Mode; manualOn: boolean; running: boolean }): string {
  if (s.status === "idle") return "還沒分享畫面";
  if (s.status === "lost") return "分享停了，再按一次「分享遊戲畫面」";
  const counting = s.mode === "manual" && s.manualOn;
  const prefix = counting ? "手動計時中，" : "";
  if (s.status === "waiting" || !s.bar) return `${prefix}認不到遊戲畫面：選楓之谷的視窗、別縮到最小`;
  if (!s.exp) return `${prefix}讀不到經驗：視窗太小或被擋住，放大一點`;
  if (s.mode === "manual" && !s.manualOn) return "按「開始」就開始算";
  if (!s.running) return counting ? "手動計時中" : "等經驗一動就開始算";
  return "量中";
}

/** 算經驗、存紀錄實際用到的隊伍：沒勾、勾了但沒填隊友都是單練（null） */
function effectiveParty(party: SpeedParty): { others: number[]; hitter: number } | null {
  return party.on && party.others.length ? { others: party.others, hitter: party.hitter } : null;
}

/**
 * 兩個組隊設定算起來是不是同一支隊伍（勾不勾、隊友等級、誰在打）。頁面拿它判斷「練到一半換了隊伍」：
 * 換了就先把這段收掉、照原本的隊伍存，一段紀錄只會有一種隊伍。
 */
export function sameParty(a: SpeedParty, b: SpeedParty): boolean {
  const x = effectiveParty(a);
  const y = effectiveParty(b);
  if (!x || !y) return x === y;
  return x.hitter === y.hitter && x.others.length === y.others.length && x.others.every((level, i) => level === y.others[i]);
}

/**
 * 練到一半換了隊伍：先把這段收掉（closed，頁面照原本的隊伍存），一段紀錄只會有一種隊伍。
 * 自動模式等經驗再動才開新的一段；手動計時中馬上從現在開新的一段，計時不斷。隊伍算起來沒換、或沒在練回 null。
 */
export function splitOnPartyChange(t: Tracker, before: SpeedParty, next: SpeedParty, at: number): Step | null {
  if (!t.seg || sameParty(before, next)) return null;
  const step = switchMode(t, t.mode, at);
  return t.mode === "manual" && t.manualOn ? { tracker: startManual(step.tracker, at), closed: step.closed } : step;
}

/** 練功計算用的隊伍人數：勾了組隊才算隊友 */
export function partySize(party: SpeedParty): number {
  return party.on ? 1 + party.others.length : 1;
}

/** 怪物卡的「組隊每隻」那行：第一個是你，其他寫等級；打怪的人後面標「打」，吸不到經驗的寫「吸不到」 */
export function partyKillLine(members: MemberExp[]): string {
  const parts = members.map((member, i) => {
    const who = i === 0 ? "你" : `Lv.${member.level}`;
    const value = member.effective ? `+${formatNumber(Math.round(member.total))}` : "吸不到";
    return `${who} ${value}${member.hitter ? "（打）" : ""}`;
  });
  return `組隊每隻：${parts.join("、")}`;
}

/** 大數字卡的回推那行；levels 是 [自己, ...隊友]。算不出來（backCalc 是 null）或沒有隊友就不出這行 */
export function backCalcLine(back: { kills: number; per10: number[] } | null, levels: number[]): string | null {
  if (!back || levels.length < 2) return null;
  const mates = levels.slice(1).map((level, i) => {
    const value = Math.round(back.per10[i + 1] ?? 0);
    const amount = value > 0 ? `約 ${formatNumber(value)}` : "吸不到";
    return i === 0 ? `Lv.${level} 隊友${value > 0 ? ` 10 分鐘${amount}` : amount}` : `Lv.${level} ${amount}`;
  });
  return `回推：全隊 10 分鐘約打 ${formatNumber(Math.round(back.kills))} 隻；${mates.join("、")}`;
}

/** 連續幾張「有狀態列、讀不到經驗」就把等級提示清掉（提示的等級錯了會一直讀不到） */
export const HINT_RESET_AFTER = 10;
export type HintState = { nullRun: number; cleared: boolean };

/**
 * 每張讀數之後，讀畫面的等級提示要不要換（hints 是 null＝不用動）：
 * - 讀到經驗：照 tracker 給（現在這級、下一級）。提示清掉過的話，要等 tracker 真的接受一張讀數才換回去，
 *   不然錯的等級又被送回去，又讀不到。
 * - 有狀態列但讀不到經驗：連續第 10 張送一次空的提示，讓讀畫面不靠等級自己猜。
 * - 沒有狀態列（不是遊戲畫面）：不算在連續裡。
 */
export function nextHints(
  state: HintState,
  reading: { bar: boolean; exp: boolean },
  tracker: { accepted: boolean; hints: number[] },
): { state: HintState; hints: number[] | null } {
  if (reading.exp) {
    if (state.cleared && !tracker.accepted) return { state: { nullRun: 0, cleared: true }, hints: null };
    return { state: { nullRun: 0, cleared: false }, hints: tracker.hints };
  }
  if (!reading.bar) return { state: { nullRun: 0, cleared: state.cleared }, hints: null };
  const nullRun = state.nullRun + 1;
  if (nullRun >= HINT_RESET_AFTER && !state.cleared) return { state: { nullRun, cleared: true }, hints: [] };
  return { state: { nullRun, cleared: state.cleared }, hints: null };
}

/** 存一筆送給 /api/speed/runs 的內容。組隊送其他隊員等級跟誰在打（伺服器自己算隊伍人數，不送 partySize） */
export function runBody(
  seg: Segment,
  where: { mapId: number | null; mapName: string | null },
  context: { charId: string; isPublic: boolean; party: SpeedParty; profileJob: number; clientVer: string },
): RunPayload {
  const { party } = context;
  return {
    mapId: where.mapId,
    mapName: where.mapName,
    level: seg.startLevel,
    job: seg.job ?? (context.profileJob >= 0 ? context.profileJob : null),
    charId: context.charId,
    isPublic: context.isPublic,
    partyLevels: party.on ? [...party.others] : [],
    partyHitter: party.on ? party.hitter : 0,
    mode: seg.mode,
    startedAt: new Date(seg.startedAt).toISOString(),
    durationSec: Math.round(durationMs(seg) / 1000),
    expGained: seg.gained,
    levelUps: seg.levelUps,
    deaths: seg.deaths,
    clientVer: context.clientVer,
  };
}

/** 存的結果：伺服器回的（含狀態碼），或沒送出去的原因 */
export type SaveOutcome =
  | { kind: "noId" }
  | { kind: "short" }
  | { kind: "network" }
  | { kind: "response"; status: number; ok: boolean; ranked?: boolean; error?: string };

/** 「上一段」後面那句：存了沒、進排行沒，沒進寫為什麼 */
export function saveNote(outcome: SaveOutcome, run: { durationSec: number; mapId: number | null }): string {
  if (outcome.kind === "noId") return "沒填角色 ID，這段沒存進排行。";
  if (outcome.kind === "short") return "不到 5 分鐘，沒存。";
  if (outcome.kind === "network") return "沒存到：網路不通，等一下再過來。";
  if (outcome.ok) {
    if (outcome.ranked) return "存好了，已列入這張圖的排行。";
    if (run.durationSec < 600) return "存好了。不到 10 分鐘，不列排行。";
    if (run.mapId === null) return "存好了。認不出地圖，不列排行。";
    return "存好了。這張圖不列排行（不是練功地圖，或超過這張圖打得到的上限）。";
  }
  if (outcome.status === 503) return "排行還沒開，這段沒存到。";
  if (outcome.error?.includes("開始時間")) return "沒存到：電腦時間跟標準時間差太多，校正一下時間再試。";
  return `沒存到：${outcome.error ?? "等一下再過來"}。`;
}
