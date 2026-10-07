"use client";

import {
  loadGraph, loadGuideCommon, loadMaps, loadMeta, loadMonsters, loadNearestTown, loadQuests, loadTraining,
  peekGraph, peekGuide, peekGuideCommon, peekMaps, peekMeta, peekMonsters, peekNearestTown, peekQuests, peekTraining,
} from "./data";
import { jobLineage } from "./planner";
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
  const routable = new Set<number>(Object.keys(parts.graph).map(Number));
  for (const edges of Object.values(parts.graph)) for (const [target] of edges) routable.add(target);
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

/** 這些攻略裡，這次瀏覽已經載過的那幾份 */
export function cachedGuides(jobs: number[]): Map<number, GuideJob> {
  const found = new Map<number, GuideJob>();
  for (const job of jobs) {
    const guide = peekGuide(job);
    if (guide) found.set(job, guide);
  }
  return found;
}
