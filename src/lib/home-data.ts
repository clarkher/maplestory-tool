"use client";

import {
  loadGraph, loadGuideCommon, loadMaps, loadMeta, loadMonsters, loadNearestTown, loadQuests, loadTraining,
  peekGraph, peekGuide, peekGuideCommon, peekMaps, peekMeta, peekMonsters, peekNearestTown, peekQuests, peekTraining,
} from "./data";
import { JOB_LINES, jobLineOf } from "./jobs";
import { jobLineage } from "./planner";
import { sessionMemo } from "./session-memo";
import type { GuideCommon, GuideJob, MapRecord, Meta, Monster, PortalEdge, Quest, TrainingRow } from "./types";

/** 首頁（我的路線）要的遊戲資料 */
export type HomeData = {
  maps: Record<string, MapRecord>;
  monsters: Monster[];
  quests: Quest[];
  training: TrainingRow[];
  common: GuideCommon;
  meta: Meta;
  /** 傳送門資料走得到的地圖；組隊任務內部的圖不在裡面，不給「帶我去」 */
  routable: Set<number>;
  graph: Record<string, PortalEdge[]>;
  nearestTown: Record<string, [number, number]>;
};

function withRoutable(parts: Omit<HomeData, "routable">): HomeData {
  // 換頁回首頁不重算：同一份傳送門資料直接拿上次算好的（session-memo）；withRoutable 本身也放進依賴，開發時改了這支檔會重算
  const routable = sessionMemo("home:routable", [withRoutable, parts.graph], () => {
    const reachable = new Set<number>(Object.keys(parts.graph).map(Number));
    for (const edges of Object.values(parts.graph)) for (const [target] of edges) reachable.add(target);
    return reachable;
  });
  return { ...parts, routable };
}

/** 八個檔一起載，有一個載不到就整個算失敗（首頁顯示讀取失敗） */
export function loadHomeData(): Promise<HomeData> {
  return Promise.all([loadMaps(), loadMonsters(), loadQuests(), loadTraining(), loadGuideCommon(), loadMeta(), loadGraph(), loadNearestTown()])
    .then(([maps, monsters, quests, training, common, meta, graph, nearestTown]) =>
      withRoutable({ maps, monsters, quests, training, common, meta, graph, nearestTown }));
}

/**
 * 這次瀏覽都載過就同步拿到：從別頁換回首頁，第一個畫面就是完整路線，不先畫「幫你排路線…」。
 * 少一份就是 null，要等 loadHomeData（直接從查資料頁進站、第一次開首頁時就是這樣）。
 */
export function peekHomeData(): HomeData | null {
  const maps = peekMaps();
  const monsters = peekMonsters();
  const quests = peekQuests();
  const training = peekTraining();
  const common = peekGuideCommon();
  const meta = peekMeta();
  const graph = peekGraph();
  const nearestTown = peekNearestTown();
  if (!maps || !monsters || !quests || !training || !common || !meta || !graph || !nearestTown) return null;
  return withRoutable({ maps, monsters, quests, training, common, meta, graph, nearestTown });
}

/** 這個職業整條線要用的攻略：路線前面幾段用的是上一轉的內容（三轉 111 → 111、110、100）；初心者、還沒選職業不用 */
export function guideJobs(job: number): number[] {
  return jobLineage(job).filter(code => code > 0);
}

/**
 * 打開「換其他職業」時先在背景載的攻略：選單上看得到的職業鈕——五個一轉，加上現在這一系的二轉、三轉。
 * 點下去時攻略已經在了，主推卡不用先放骨架（換到別的一轉，選單換成那一系，再載那一系的）。
 */
export function guidesToPrefetch(job: number): number[] {
  const line = jobLineOf(job);
  const shown = line ? [...line.branches, ...line.thirds].map(([code]) => code) : [];
  return [...JOB_LINES.map(entry => entry.base), ...shown];
}

/** 這些攻略裡，這次瀏覽已經載過的那幾份 */
export function cachedGuides(jobs: number[]): Map<number, GuideJob> {
  const found = new Map<number, GuideJob>();
  for (const job of jobs) {
    const guide = peekGuide(job);
    if (guide) found.set(job, guide);
  }
  return found;
}

/**
 * 首頁掛上、換職業的那一次渲染就決定好攻略：整條線這次瀏覽都載過就直接用（ready），
 * 不然先放骨架（loading），不會拿上一個職業的狀態先畫一張不對的主推卡。
 * 要的都已經在畫面上（shown）就沿用同一份 Map，整條路線不用重算。初心者、還沒選職業不用攻略，狀態照舊是 loading。
 */
export function guidesFor(job: number, shown: Map<number, GuideJob>): { guides: Map<number, GuideJob>; status: "ready" | "loading" } {
  const wanted = guideJobs(job);
  const cached = cachedGuides(wanted);
  const fresh = [...cached].filter(([code, guide]) => shown.get(code) !== guide);
  const guides = fresh.length ? new Map([...shown, ...fresh]) : shown;
  return { guides, status: wanted.length > 0 && cached.size === wanted.length ? "ready" : "loading" };
}

/** 首頁攻略的狀態：跟著哪個職業、畫面上有哪些攻略、載好了沒 */
export type GuideState = { job: number; guides: Map<number, GuideJob>; status: "loading" | "ready" | "failed" };

/**
 * 攻略其實都載好了，畫面卻還停在讀取中或讀取失敗（剛好在這次渲染之後才載好，或失敗後被打開選單時的預載重抓成功）：
 * 換成載好的。其他情況（已經載好、職業對不上、還有沒載好的）回傳同一份，不重畫。
 */
export function settleGuides(state: GuideState, job: number): GuideState {
  if (state.job !== job || state.status === "ready") return state;
  const next = guidesFor(job, state.guides);
  return next.status === "ready" ? { job, ...next } : state;
}
