/**
 * 經典版的 29 個職業：一轉 5 職＋二轉 12 職＋三轉 12 職（V002，2026-10-15 開放）。
 * 皇家騎士團、狂狼勇士、龍魔導士、影武者是客戶端資料裡有、經典版沒有的，不列。
 */

export type JobOption = {
  id: number;
  name: string;
  /** 所屬系別（一轉職業名） */
  line: string;
  /** 轉職教官，頭像用他的遊戲圖 */
  npcId: number;
  npcName: string;
};

export type JobLine = {
  base: number;
  line: string;
  npcId: number;
  npcName: string;
  branches: Array<[number, string]>;
  /** 三轉，順序跟 branches 一一對應（111 接 110）；名稱取自遊戲資料的技能書「〇〇之路」 */
  thirds: Array<[number, string]>;
};

export const JOB_LINES: JobLine[] = [
  { base: 100, line: "劍士", npcId: 1022000, npcName: "武術教練", branches: [[110, "狂戰士"], [120, "見習騎士"], [130, "槍騎兵"]], thirds: [[111, "十字軍"], [121, "騎士"], [131, "龍騎士"]] },
  { base: 200, line: "法師", npcId: 1032001, npcName: "漢斯", branches: [[210, "火毒巫師"], [220, "冰雷巫師"], [230, "僧侶"]], thirds: [[211, "魔導士（火毒）"], [221, "魔導士（冰雷）"], [231, "祭司"]] },
  { base: 300, line: "弓箭手", npcId: 1012100, npcName: "赫麗娜", branches: [[310, "獵人"], [320, "弩弓手"]], thirds: [[311, "遊俠"], [321, "狙擊手"]] },
  { base: 400, line: "盜賊", npcId: 1052001, npcName: "達克魯", branches: [[410, "刺客"], [420, "俠盜"]], thirds: [[411, "暗殺者"], [421, "神偷"]] },
  { base: 500, line: "海盜", npcId: 1090000, npcName: "卡伊琳", branches: [[510, "打手"], [520, "槍手"]], thirds: [[511, "格鬥家"], [521, "神槍手"]] },
];

export const JOB_OPTIONS: JobOption[] = JOB_LINES.flatMap(line => [
  { id: line.base, name: line.line, line: line.line, npcId: line.npcId, npcName: line.npcName },
  ...[...line.branches, ...line.thirds].map(([id, name]) => ({ id, name, line: line.line, npcId: line.npcId, npcName: line.npcName })),
]);

/**
 * 一個系別的二轉跟它接的三轉，一組一組列（刺客 → 暗殺者、俠盜 → 神偷）。
 * 選單照這個順序排，才看得出三轉是從哪個二轉來的（2026-10-06 使用者：「不曉得是從哪個職業二轉的」）。
 */
export function branchPairs(line: JobLine): Array<{ second: [number, string]; third: [number, string] }> {
  return line.branches.map((second, index) => ({ second, third: line.thirds[index] }));
}

/** 這個職業屬於哪個系別（一轉、二轉、三轉都算）；初心者、還沒選回 undefined */
export function jobLineOf(job: number): JobLine | undefined {
  if (job <= 0) return undefined;
  return JOB_LINES.find(line => line.base === baseJob(job));
}

/** 下拉選單裡三轉的名稱：名字本身有括號就併進去（魔導士（火毒）→ 魔導士（火毒・三轉）），其他加（三轉） */
export function thirdJobLabel(name: string): string {
  return name.endsWith("）") ? `${name.slice(0, -1)}・三轉）` : `${name}（三轉）`;
}

/** 查資料頁的職業篩選選單：每個系別一組（optgroup），一轉用系名當選項，每個二轉後面緊接它的三轉。 */
export type SkillJobGroup = { label: string; options: Array<{ id: number; name: string }> };

export function skillJobGroups(): SkillJobGroup[] {
  return JOB_LINES.map(line => ({
    label: `${line.line}系`,
    options: [
      { id: line.base, name: line.line },
      ...branchPairs(line).flatMap(({ second, third }) => [
        { id: second[0], name: second[1] },
        { id: third[0], name: thirdJobLabel(third[1]) },
      ]),
    ],
  }));
}

const BY_ID = new Map(JOB_OPTIONS.map(job => [job.id, job]));

/** 二轉開放的等級 */
export const SECOND_JOB_LEVEL = 30;
/** 三轉的等級：先照舊版 70 等，開機公告出來確認；要改只改這個常數（pipeline/lib/guides.mjs 有同一個數字） */
export const THIRD_JOB_LEVEL = 70;

export function baseJob(job: number): number {
  return job > 0 ? Math.floor(job / 100) * 100 : 0;
}

export type JobTier = 0 | 1 | 2 | 3;

/** 第幾轉：初心者與不認得的代碼 0、一轉（100）1、二轉（110）2、三轉（111）3 */
export function jobTier(job: number): JobTier {
  if (job <= 0 || !BY_ID.has(job)) return 0;
  if (job % 100 === 0) return 1;
  return job % 10 === 0 ? 2 : 3;
}

export function isSecondJob(job: number): boolean {
  return jobTier(job) === 2;
}

export function isThirdJob(job: number): boolean {
  return jobTier(job) === 3;
}

/** 一轉的等級：法師 8 等，其他 10 等 */
export function advancementLevel(job: number): number {
  return baseJob(job) === 200 ? 8 : 10;
}

/** 上一轉：三轉 111 → 二轉 110 → 一轉 100 → 0 */
export function previousJob(job: number): number {
  const tier = jobTier(job);
  if (tier === 3) return job - (job % 10);
  if (tier === 2) return baseJob(job);
  return 0;
}

/** 這一轉從幾等開始：三轉 70、二轉 30、一轉 8（法師）或 10 */
export function tierStartLevel(job: number): number {
  const tier = jobTier(job);
  if (tier === 3) return THIRD_JOB_LEVEL;
  if (tier === 2) return SECOND_JOB_LEVEL;
  return advancementLevel(job);
}

/** 本機存過的舊代碼（例如皇家騎士團 1110）不在經典版，當作初心者；-1 是還沒選職業 */
export function normalizeJob(job: number): number {
  if (job < 0) return -1;
  return BY_ID.has(job) ? job : 0;
}

/**
 * 這個等級實際是哪一轉：還沒到轉職等級就是初心者（0）；
 * 選了三轉職業但還沒到 70 等用二轉的，選了二轉職業但還沒到 30 等用一轉的。
 */
export function stageJob(job: number, level: number): number {
  if (job <= 0 || level < advancementLevel(job)) return 0;
  const tier = jobTier(job);
  if (tier === 3 && level < THIRD_JOB_LEVEL) return stageJob(previousJob(job), level);
  if (tier === 2 && level < SECOND_JOB_LEVEL) return baseJob(job);
  return job;
}

export function jobOption(job: number): JobOption | undefined {
  return BY_ID.get(job);
}

/** 選了這個職業最低要幾等：初心者／還沒選 1、法師 8、其他一轉 10、二轉 30、三轉 70 */
export function minLevelFor(job: number): number {
  if (job <= 0) return 1;
  return tierStartLevel(job);
}

/**
 * 本機存過的不可能組合改成實際那一轉，等級不動（三轉 50 → 二轉；二轉 25 → 一轉；一轉 5 → 初心者）。
 * 不認得的舊代碼原樣回傳（交給 normalizeJob）。
 */
export function consistentJob(job: number, level: number): number {
  if (job <= 0 || level <= 0 || jobTier(job) === 0) return job;
  return stageJob(job, level);
}

/**
 * 選了某個職業後的角色資料：等級不夠就調到該職業最低等級，並回傳要給玩家看的提示（沒調就是 null）。
 * typed 是輸入框裡打了、但被原本職業擋下的等級（狂戰士狀態下打 25）：新職業允許就直接套用；
 * 不允許就照舊。呼叫端把輸入框改成回傳的 next.level，輸入框跟標題就不會對不起來。
 */
export function profileWithJob(
  profile: { level: number; job: number },
  job: number,
  typed?: number,
): { next: { level: number; job: number }; note: string | null } {
  if (typed !== undefined && typed > 0 && typed !== profile.level && levelHint(job, typed) === null) {
    return { next: { job, level: typed }, note: null };
  }
  const need = minLevelFor(job);
  if (profile.level > 0 && profile.level < need) return { next: { job, level: need }, note: `${jobName(job)} ${need} 等起，等級改成 ${need}` };
  return { next: { ...profile, job }, note: null };
}

/** 提示裡的職業名 */
function jobName(job: number): string {
  return job === 0 ? "初心者" : jobOption(job)?.name ?? "這個職業";
}

/** 打的等級比職業最低等級還低時的提示；沒問題回 null */
export function levelHint(job: number, level: number): string | null {
  const need = minLevelFor(job);
  if (level >= need) return null;
  return `${jobOption(job)?.name ?? "這個職業"}至少 ${need} 等`;
}

/** 輸入框裡的字轉成數字；沒有數字回 NaN */
function digitsOf(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, "");
  return digits ? Number(digits) : Number.NaN;
}

/**
 * 打字當下要不要套用：只套用這個職業允許、又沒超過上限的等級，其他先等，也不給提示——
 * 要打 15 先打了 1，不能閃一下「弩弓手至少 30 等」。真正的檢查在離開輸入框時（commitLevelText）。
 */
export function typedLevel(raw: string, job: number, cap: number): number | null {
  const value = digitsOf(raw);
  if (!Number.isFinite(value) || value < 1 || value > cap || levelHint(job, value) !== null) return null;
  return value;
}

/**
 * 離開輸入框或按 Enter 時，輸入框跟標題要對得起來：
 * 空白、不是數字、小於 1 → 默默改回現在的等級；超過上限 → 改成上限並說一聲；
 * 比職業最低等級低 → 原本的提示（狂戰士至少 30 等），等級不動；其他照打的套用。
 */
export function commitLevelText(raw: string, profile: { level: number; job: number }, cap: number): { level: number; hint: string | null } {
  const value = digitsOf(raw);
  if (!Number.isFinite(value) || value < 1) return { level: profile.level, hint: null };
  if (value > cap) return { level: cap, hint: `目前等級上限 Lv.${cap}` };
  const tooLow = levelHint(profile.job, value);
  if (tooLow) return { level: profile.level, hint: tooLow };
  return { level: value, hint: null };
}

/**
 * 換職業，並處理手滑：選的職業把等級拉高時（劍士 18 → 狂戰士 → 30），記住拉高前的等級（raisedFrom）；
 * 之後點的職業允許那個等級，就改回去、忘掉；還是不允許，等級就是那個職業的最低等級（不是上一次被拉高的等級）、
 * 照樣說「〇〇 N 等起，等級改成 N」並繼續記著（打 5 → 狂戰士 30 → 法師：法師 8，不是 30；狂戰士 → 見習騎士提示不會消失）。
 * 輸入框裡另外打的等級（typed，見 profileWithJob）優先，打了就不再還原。
 * 呼叫端把回傳的 raisedFrom 存起來，下次換職業時傳回來；玩家自己改等級（打字、加減）時要清掉。
 */
export function pickJobKeepingLevel(
  profile: { level: number; job: number },
  job: number,
  typed: number | undefined,
  raisedFrom: number | null,
): { next: { level: number; job: number }; note: string | null; raisedFrom: number | null } {
  const typedApplies = typed !== undefined && typed > 0 && typed !== profile.level && levelHint(job, typed) === null;
  if (!typedApplies && raisedFrom !== null) {
    if (levelHint(job, raisedFrom) === null) return { next: { job, level: raisedFrom }, note: null, raisedFrom: null };
    const need = minLevelFor(job);
    return { next: { job, level: need }, note: `${jobName(job)} ${need} 等起，等級改成 ${need}`, raisedFrom };
  }
  const { next, note } = profileWithJob(profile, job, typed);
  if (typedApplies) return { next, note, raisedFrom: null };
  const raised = profile.level > 0 && next.level > profile.level;
  return { next, note, raisedFrom: raised ? raisedFrom ?? profile.level : raisedFrom };
}
