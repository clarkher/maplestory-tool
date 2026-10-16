// src/app/api/speed/board/route.ts
import trainingJson from "../../../../../public/data/training.json";
import { ensureSchema, getSql, speedEnv } from "@/lib/speed/server/db";
import type { BoardRow } from "@/lib/speed/server/rules";
import type { TrainingRow } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 有練功資料的圖：只有這些圖的紀錄進得了排行（rules.ts toRow 要有上限），其他圖的排行一定是空的 */
const TRAINED = new Set((trainingJson as unknown as TrainingRow[]).map(row => row.m));
const CACHE = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" };

type Raw = {
  char_id: string;
  job: number | null;
  level: number;
  party_size: number;
  exp_per_10min: string | number;
  kills_per_10min: string | number | null;
  duration_sec: number;
  created_at: string | Date;
  /** 上榜那一筆有沒有勾公開 */
  best_public: boolean;
  /** 這個角色最新的一筆有沒有勾公開 */
  latest_public: boolean;
};

const TAIPEI_OFFSET_MS = 8 * 3600 * 1000;

/** 台灣時間的日期（台灣沒有夏令時間，固定 +8 小時）；半夜打的不會被算成前一天 */
function taipeiDate(value: string | Date): string {
  return new Date(new Date(value).getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}

function toBoard(rows: Raw[]): BoardRow[] {
  return rows.map(row => ({
    // 兩筆都公開才掛名：別人只能把你藏起來、不能幫你翻開
    name: row.best_public && row.latest_public ? row.char_id : null,
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
 * 網址只看 map，其他參數（存成功後頁面加的 v=，用來跳過 5 分鐘快取）不管；沒有練功資料的圖不查資料庫，直接回空的。
 * 單練照 10 分鐘經驗排；組隊照「全隊 10 分鐘打幾隻」排（沒算出打幾隻的不上榜）。
 * 掛名要「上榜那一筆」跟「這個角色最新的一筆」都勾公開，兩筆都是才顯示名字，其他寫匿名（10/13 使用者選 B）。
 * 為什麼：沒有登入，任何人都能用別人的角色 ID 送一筆；只看最新一筆的話，別人送一筆公開的就能把你原本不公開的成績翻開。
 * 這樣別人只能把你藏起來（送一筆不公開的），不能幫你翻開。之後本人改成不公開，舊紀錄也一起變匿名；
 * 以前不公開的成績，之後改公開也不會跟著掛名。兩筆各自的旗標由 SQL 帶出來（best_public、latest_public），在 toBoard 合起來判斷。快取 5 分鐘。
 */
export async function GET(request: Request): Promise<Response> {
  const map = Number(new URL(request.url).searchParams.get("map"));
  if (!Number.isInteger(map) || map <= 0 || map > 999_999_999) return Response.json(EMPTY, { status: 400 });
  const sql = getSql();
  if (!sql) return Response.json(EMPTY);
  if (!TRAINED.has(map)) return Response.json({ open: true, solo: [], party: [] }, { headers: CACHE });
  try {
    await ensureSchema(sql);
    const env = speedEnv();
    // latest 只查前 10 名的角色（走 env, char_id 索引），不用掃整張表。
    // 同分的先後固定：先達成的在前、再看 id（第 10 名的切線每次一樣）；最新一筆同一時間時 id 大的算最新。
    // 掛名的旗標：best 帶上榜那筆的 is_public（best_public），latest 帶最新一筆的（latest_public）。
    const [solo, party] = await Promise.all([
      sql`
        WITH best AS (
          SELECT DISTINCT ON (char_id) id, char_id, is_public AS best_public, job, level, party_size, exp_per_10min, kills_per_10min, duration_sec, created_at
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
        SELECT leaders.*, latest.is_public AS latest_public FROM leaders JOIN latest USING (char_id)
        ORDER BY leaders.exp_per_10min DESC, leaders.created_at, leaders.id`,
      sql`
        WITH best AS (
          SELECT DISTINCT ON (char_id) id, char_id, is_public AS best_public, job, level, party_size, exp_per_10min, kills_per_10min, duration_sec, created_at
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
        SELECT leaders.*, latest.is_public AS latest_public FROM leaders JOIN latest USING (char_id)
        ORDER BY leaders.kills_per_10min DESC, leaders.created_at, leaders.id`,
    ]);
    return Response.json(
      { open: true, solo: toBoard(solo as Raw[]), party: toBoard(party as Raw[]) },
      { headers: CACHE },
    );
  } catch (error) {
    console.error("speed/board", error);
    return Response.json(EMPTY, { status: 503 });
  }
}
