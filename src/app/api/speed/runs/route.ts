// src/app/api/speed/runs/route.ts
import { createHash } from "node:crypto";
import monsterJson from "../../../../../public/data/monsters.json";
import trainingJson from "../../../../../public/data/training.json";
import { ensureSchema, getSql, speedEnv } from "@/lib/speed/server/db";
import { checkRun, mapCap, RATE_LIMIT_PER_MIN, toRow } from "@/lib/speed/server/rules";
import type { Monster, TrainingRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const MONSTERS = monsterJson as unknown as Monster[];
const TRAINING = trainingJson as unknown as TrainingRow[];
const MONSTER_BY_ID = new Map(MONSTERS.map(monster => [monster.id, monster]));

// TODO(練功測速)：正式機在 Vercel 設 SPEED_SALT；沒設時用這個預設值（只拿來擋同一個位址一直送）
const SALT = process.env.SPEED_SALT ?? "maplebook-speed";

function ipHash(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHash("sha256").update(`${SALT}:${ip}`).digest("hex").slice(0, 32);
}

/**
 * 存一筆練功紀錄。檢查 → 數這個位址這一分鐘送幾次 → 算 10 分鐘經驗、進不進排行、全隊 10 分鐘打幾隻 → 寫入。
 * 沒設 DATABASE_URL 回 503「排行還沒開」；資料庫自己出錯回 500（不把錯誤內容送出去）。
 */
export async function POST(request: Request): Promise<Response> {
  const sql = getSql();
  if (!sql) return Response.json({ ok: false, error: "排行還沒開" }, { status: 503 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "格式不對" }, { status: 400 });
  }
  const checked = checkRun(body);
  if (!checked.ok) return Response.json(checked, { status: 400 });
  const run = checked.run;
  try {
    await ensureSchema(sql);
    const hash = ipHash(request);
    const [{ count }] = (await sql`SELECT count(*)::int AS count FROM speed_runs WHERE ip_hash = ${hash} AND created_at > now() - interval '1 minute'`) as { count: number }[];
    if (count >= RATE_LIMIT_PER_MIN) return Response.json({ ok: false, error: "送太快了，等一下再存" }, { status: 429 });
    const trainingRow = run.mapId === null ? undefined : TRAINING.find(item => item.m === run.mapId);
    const row = toRow(run, run.mapId === null ? null : mapCap(run.mapId, TRAINING, MONSTERS), trainingRow, MONSTER_BY_ID);
    // 開始時間統一寫成 UTC 的標準格式（頁面送來的寫法 JS 讀得懂，資料庫不一定）
    const startedAt = new Date(row.startedAt).toISOString();
    await sql`INSERT INTO speed_runs (env, map_id, map_name, level, job, char_id, is_public, party_size, party_levels, party_hitter, mode, started_at, duration_sec, exp_gained, exp_per_10min, kills_per_10min, level_ups, deaths, ranked, ip_hash, client_ver)
      VALUES (${speedEnv()}, ${row.mapId}, ${row.mapName}, ${row.level}, ${row.job}, ${row.charId}, ${row.isPublic}, ${row.partySize}, ${row.partyLevels}::integer[], ${row.partyHitter}, ${row.mode}, ${startedAt}, ${row.durationSec}, ${row.expGained}, ${row.expPer10}, ${row.killsPer10}, ${row.levelUps}, ${row.deaths}, ${row.ranked}, ${hash}, ${row.clientVer})`;
    return Response.json({ ok: true, ranked: row.ranked });
  } catch (error) {
    console.error("speed/runs", error);
    return Response.json({ ok: false, error: "排行暫時連不上，等一下再存" }, { status: 500 });
  }
}
