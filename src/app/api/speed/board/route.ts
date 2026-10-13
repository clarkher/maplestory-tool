// src/app/api/speed/board/route.ts
import { ensureSchema, getSql, speedEnv } from "@/lib/speed/server/db";
import type { BoardRow } from "@/lib/speed/server/rules";

export const dynamic = "force-dynamic";

type Raw = {
  char_id: string;
  job: number | null;
  level: number;
  party_size: number;
  exp_per_10min: string | number;
  kills_per_10min: string | number | null;
  duration_sec: number;
  created_at: string | Date;
  show: boolean;
};

const TAIPEI_OFFSET_MS = 8 * 3600 * 1000;

/** 台灣時間的日期（台灣沒有夏令時間，固定 +8 小時）；半夜打的不會被算成前一天 */
function taipeiDate(value: string | Date): string {
  return new Date(new Date(value).getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}

function toBoard(rows: Raw[]): BoardRow[] {
  return rows.map(row => ({
    name: row.show ? row.char_id : null,
    job: row.job,
    level: row.level,
    expPer10: Number(row.exp_per_10min),
    minutes: Math.round(row.duration_sec / 60),
    date: taipeiDate(row.created_at),
    partySize: row.party_size,
    kills: row.kills_per_10min === null ? null : Number(row.kills_per_10min),
  }));
}

const EMPTY = { open: false, solo: [], party: [] };

/**
 * 一張圖的排行：單練、組隊各前 10。每個角色只留最好的一筆；
 * 單練照 10 分鐘經驗排；組隊照「全隊 10 分鐘打幾隻」排（沒算出打幾隻的不上榜）。
 * 公開與否看這個角色最新的一筆（之後改成不公開，舊紀錄也一起變匿名）。快取 5 分鐘。
 */
export async function GET(request: Request): Promise<Response> {
  const map = Number(new URL(request.url).searchParams.get("map"));
  if (!Number.isInteger(map) || map <= 0 || map > 999_999_999) return Response.json(EMPTY, { status: 400 });
  const sql = getSql();
  if (!sql) return Response.json(EMPTY);
  try {
    await ensureSchema(sql);
    const env = speedEnv();
    // latest 只查前 10 名的角色（走 env, char_id 索引），不用掃整張表。
    // 同分的先後固定：先達成的在前、再看 id（第 10 名的切線每次一樣）；最新一筆同一時間時 id 大的算最新。
    const [solo, party] = await Promise.all([
      sql`
        WITH best AS (
          SELECT DISTINCT ON (char_id) id, char_id, job, level, party_size, exp_per_10min, kills_per_10min, duration_sec, created_at
          FROM speed_runs
          WHERE env = ${env} AND map_id = ${map} AND ranked AND party_size = 1
          ORDER BY char_id, exp_per_10min DESC, created_at, id
        ), leaders AS (
          SELECT * FROM best ORDER BY exp_per_10min DESC, created_at, id LIMIT 10
        ), latest AS (
          SELECT DISTINCT ON (char_id) char_id, is_public FROM speed_runs
          WHERE env = ${env} AND char_id IN (SELECT char_id FROM leaders)
          ORDER BY char_id, created_at DESC, id DESC
        )
        SELECT leaders.*, latest.is_public AS show FROM leaders JOIN latest USING (char_id)
        ORDER BY leaders.exp_per_10min DESC, leaders.created_at, leaders.id`,
      sql`
        WITH best AS (
          SELECT DISTINCT ON (char_id) id, char_id, job, level, party_size, exp_per_10min, kills_per_10min, duration_sec, created_at
          FROM speed_runs
          WHERE env = ${env} AND map_id = ${map} AND ranked AND party_size > 1 AND kills_per_10min IS NOT NULL
          ORDER BY char_id, kills_per_10min DESC, created_at, id
        ), leaders AS (
          SELECT * FROM best ORDER BY kills_per_10min DESC, created_at, id LIMIT 10
        ), latest AS (
          SELECT DISTINCT ON (char_id) char_id, is_public FROM speed_runs
          WHERE env = ${env} AND char_id IN (SELECT char_id FROM leaders)
          ORDER BY char_id, created_at DESC, id DESC
        )
        SELECT leaders.*, latest.is_public AS show FROM leaders JOIN latest USING (char_id)
        ORDER BY leaders.kills_per_10min DESC, leaders.created_at, leaders.id`,
    ]);
    return Response.json(
      { open: true, solo: toBoard(solo as Raw[]), party: toBoard(party as Raw[]) },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } },
    );
  } catch (error) {
    console.error("speed/board", error);
    return Response.json(EMPTY, { status: 503 });
  }
}
