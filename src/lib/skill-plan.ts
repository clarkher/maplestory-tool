import { advancementLevel, isSecondJob, SECOND_JOB_LEVEL } from "./jobs";
import type { GuideBuild, GuideSkillStep } from "./types";

/**
 * 某職業在某等級「這一轉」總共拿到幾點技能點。
 * 一轉：轉職當下 1 點，之後每級 3 點；二轉：30 等 1 點，之後每級 3 點。
 * 開服後玩家整理的點法總數對得上（例如一轉 61 點、法師 67 點、二轉到 70 等 121 點）。
 */
export function availableSp(job: number, level: number): number {
  if (job <= 0) return 0;
  if (isSecondJob(job) && level >= SECOND_JOB_LEVEL) return 1 + 3 * (level - SECOND_JOB_LEVEL);
  const start = advancementLevel(job);
  if (level < start) return 0;
  return 1 + 3 * (level - start);
}

/**
 * 只算「這一轉」自己的點數：轉職前是 0。
 * 跟 availableSp 的差別在二轉職業未滿 30 等時：availableSp 回一轉點數（畫面上的技能條要用），
 * 這裡回 0（切等級段時要用，否則二轉第一段會從一轉的 58 點開始算）。
 */
export function spAtLevel(stage: number, level: number): number {
  if (stage <= 0) return 0;
  const start = isSecondJob(stage) ? SECOND_JOB_LEVEL : advancementLevel(stage);
  return level < start ? 0 : 1 + 3 * (level - start);
}

export type StepState = "done" | "now" | "next" | "later";

export type PlannedStep = GuideSkillStep & {
  /** 這一步之前這個技能已經幾級 */
  from: number;
  /** 這一步要花的點數 */
  cost: number;
  /** 點法開頭累計到這一步開始前／結束後用掉的點數 */
  start: number;
  end: number;
  state: StepState;
};

export type BuildProgress = {
  steps: PlannedStep[];
  total: number;
  /** 目前正在點的那一步；全部點完時沒有 */
  current?: PlannedStep & { reached: number };
  finished: boolean;
};

/**
 * 依「已經拿到幾點」推算點法走到哪一步。
 * 同一個技能在點法裡可能出現兩次（先點 3 級、之後補滿），所以每一步只算差額。
 * 「現在」是你最新那一點落在的那一步（第 sp 點；還沒有點數時看第 1 點）：剛好點完一步時，
 * 最新的點數就是用來點完它的，它還是現在。以前把它算成點完、改指下一步，
 * 海盜 Lv.10 只有 1 點卻叫你點衝擊拳（那 1 點其實要給雙子星攻擊）。
 */
export function buildProgress(build: GuideBuild, sp: number): BuildProgress {
  const level = new Map<string, number>();
  const target = Math.max(sp, 1);
  let spent = 0;
  let nowIndex = -1;
  let reached = 0;

  const steps = build.steps.map((step, index) => {
    const key = step.id === null ? `name:${step.name}` : String(step.id);
    const from = level.get(key) ?? 0;
    const cost = Math.max(0, step.to - from);
    level.set(key, Math.max(from, step.to));
    const start = spent;
    spent += cost;
    if (nowIndex < 0 && cost > 0 && start < target && target <= spent) {
      nowIndex = index;
      reached = from + Math.max(0, sp - start);
    }
    return { ...step, from, cost, start, end: spent };
  });

  const planned: PlannedStep[] = steps.map((step, index) => ({
    ...step,
    state:
      nowIndex < 0 || index < nowIndex ? "done"
        : index === nowIndex ? "now"
          : index === nowIndex + 1 ? "next"
            : "later",
  }));

  return {
    steps: planned,
    total: spent,
    current: nowIndex < 0 ? undefined : { ...planned[nowIndex], reached },
    finished: nowIndex < 0,
  };
}

/**
 * 某一段等級會點到的步驟：這段開始時有 spFrom 點、結束時有 spTo 點，
 * 點法裡累計點數落在這個範圍內的步驟都算。
 */
export function stepsBetween(build: GuideBuild, spFrom: number, spTo: number): PlannedStep[] {
  return buildProgress(build, 0).steps.filter(step => step.cost > 0 && step.start < spTo && step.end > spFrom);
}

/**
 * 主流點法。一轉的攻略常同時有好幾條主流（海盜分打手線、槍手線），
 * 有指定二轉職業時挑名稱提到它的那條；都沒提到就用第一條主流，研究沒標主流時用第一條。
 */
export function mainBuild(builds: GuideBuild[], prefer?: string): GuideBuild | undefined {
  const main = builds.filter(build => build.main);
  return (prefer ? main.find(build => build.label.includes(prefer)) : undefined) ?? main[0] ?? builds[0];
}
