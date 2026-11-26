// src/app/api/speed/overview/route.ts
import trainingJson from "../../../../../public/data/training.json";
import { ensureSchema, getSql, speedEnv } from "@/lib/speed/server/db";
import { couponMult, taipeiDate, type OverviewMap } from "@/lib/speed/server/rules";
import type { TrainingRow } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 有練功資料的圖才列（跟 board 一樣：其他圖的紀錄進不了排行） */
const TRAINED = new Set((trainingJson as unknown as TrainingRow[]).map(row => row.m));
const CACHE = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" };
const EMPTY = { open: false, maps: [] as OverviewMap[] };

type Group = { map_id: number; map_name: string | null; runs: number | string; coupon_runs: number | string; min_level: number; max_level: number; latest_at: string | Date };
type Best = { map_id: number; job: number | null; level: number; exp_per_10min: number | string; coupon_mult: number | string | null; coupon_min: number | null };

/**
 * 大家的實測、依地圖總覽（v2.79，11/26 使用者選 A）：頁面一進來（不用分享畫面、手機也有）就列每張有紀錄的圖，
 * 點開再抓 /api/speed/board 看那張圖的前 10 名。
 * 只算進得了排行的（ranked：練滿 10 分鐘、有練功資料上限），只看這個環境；不選角色 ID、位址雜湊（總覽不掛名）。
 * 最快那筆只看單練（組隊的 10 分鐘經驗跟人數有關，不能直接比）；數字是扣掉加倍券的還原值，帶倍率給頁面標「加倍」（使用者選 1）。
 * 照筆數多到少排，同筆數最新的在前。快取 5 分鐘。
 */
export async function GET(): Promise<Response> {
  const sql = getSql();
  if (!sql) return Response.json(EMPTY);
  try {
    await ensureSchema(sql);
    const env = speedEnv();
    const [groups, bests] = await Promise.all([
      sql`
        SELECT map_id, max(map_name) AS map_name, count(*) AS runs, count(*) FILTER (WHERE coupon_mult IS NOT NULL) AS coupon_runs,
          min(level) AS min_level, max(level) AS max_level, max(created_at) AS latest_at
        FROM speed_runs
        WHERE env = ${env} AND ranked AND map_id IS NOT NULL
        GROUP BY map_id`,
      sql`
        SELECT DISTINCT ON (map_id) map_id, job, level, exp_per_10min, coupon_mult, coupon_min
        FROM speed_runs
        WHERE env = ${env} AND ranked AND map_id IS NOT NULL AND party_size = 1
        ORDER BY map_id, exp_per_10min DESC, created_at, id`,
    ]);
    const bestBy = new Map((bests as Best[]).map(row => [Number(row.map_id), row]));
    const maps: OverviewMap[] = (groups as Group[])
      .filter(row => TRAINED.has(Number(row.map_id)))
      .map(row => {
        const best = bestBy.get(Number(row.map_id));
        return {
          mapId: Number(row.map_id),
          mapName: row.map_name,
          runs: Number(row.runs),
          couponRuns: Number(row.coupon_runs),
          minLevel: row.min_level,
          maxLevel: row.max_level,
          latest: taipeiDate(row.latest_at),
          best: best
            ? { expPer10: Number(best.exp_per_10min), job: best.job, level: best.level, couponMult: couponMult(best.coupon_mult), couponMin: best.coupon_min ?? null }
            : null,
        };
      })
      .sort((a, b) => b.runs - a.runs || b.latest.localeCompare(a.latest) || a.mapId - b.mapId);
    return Response.json({ open: true, maps }, { headers: CACHE });
  } catch (error) {
    console.error("speed/overview", error);
    return Response.json(EMPTY, { status: 503 });
  }
}
