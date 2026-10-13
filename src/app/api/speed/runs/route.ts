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

// TODO(練功測速)：正式機上線前一定要在 Vercel 設 SPEED_SALT（隨便一串別人猜不到的字）。
// 沒設時用這個預設值，位址雜湊只擋得住一般的灌資料，擋不住有心人拿原始碼反推位址（IPv4 的組合有限）。
const SALT = process.env.SPEED_SALT ?? "maplebook-speed";

/**
 * 網路位址只存雜湊，而且雜湊裡混了當天的日期（UTC）：同一個位址隔天算出來不一樣，紀錄不能跨天認出同一個人。
 * 擋灌資料只看一分鐘內，跨日（UTC 午夜）那一分鐘最多多放一輪，沒關係。
 */
function ipHash(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${SALT}:${day}:${ip}`).digest("hex").slice(0, 32);
}

const isJson = (request: Request): boolean => (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() === "application/json";

/**
 * 存一筆練功紀錄。檢查 → 算 10 分鐘經驗、進不進排行、全隊 10 分鐘打幾隻 → 擋同位址一分鐘送太多 → 寫入。
 * 沒設 DATABASE_URL 回 503「排行還沒開」；資料庫自己出錯回 500（不把錯誤內容送出去）。
 */
export async function POST(request: Request): Promise<Response> {
  const sql = getSql();
  if (!sql) return Response.json({ ok: false, error: "排行還沒開" }, { status: 503 });
  // 只收 application/json：網頁表單從別的網站丟過來的簡單請求（text/plain 之類）不用預檢，這裡直接擋掉
  if (!isJson(request)) return Response.json({ ok: false, error: "格式不對" }, { status: 400 });
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
    const trainingRow = run.mapId === null ? undefined : TRAINING.find(item => item.m === run.mapId);
    const row = toRow(run, run.mapId === null ? null : mapCap(run.mapId, TRAINING, MONSTERS), trainingRow, MONSTER_BY_ID);
    // 「數這一分鐘送了幾次」跟「寫進去」不能分開送：同時來 100 個請求，全都數到 0 就全寫進去了。
    // 所以放進同一個 transaction、分兩句：
    //   1. 先對這個位址的雜湊拿 advisory lock（同一個位址的請求在這裡排隊，transaction 結束自動放）；
    //   2. 再 INSERT … SELECT … WHERE（這一分鐘的筆數 < 上限）。
    // 一定要兩句：READ COMMITTED 下每一句開始時才取資料快照，排隊等到鎖的請求，第二句才看得到前一個剛 commit 的紀錄。
    // INSERT … SELECT 的參數沒有欄位可以推型別，每個都要明講；RETURNING 是空的就是被上限擋掉。
    const [, written] = await sql.transaction(
      [
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${hash}::text, 0))`,
        sql`INSERT INTO speed_runs (env, map_id, map_name, level, job, char_id, is_public, party_size, party_levels, party_hitter, mode, started_at, duration_sec, exp_gained, exp_per_10min, kills_per_10min, level_ups, deaths, ranked, ip_hash, client_ver)
          SELECT ${speedEnv()}::text, ${row.mapId}::integer, ${row.mapName}::text, ${row.level}::integer, ${row.job}::integer, ${row.charId}::text, ${row.isPublic}::boolean, ${row.partySize}::integer, ${row.partyLevels}::integer[], ${row.partyHitter}::integer, ${row.mode}::text, ${row.startedAt}::timestamptz, ${row.durationSec}::integer, ${row.expGained}::bigint, ${row.expPer10}::bigint, ${row.killsPer10}::real, ${row.levelUps}::integer, ${row.deaths}::integer, ${row.ranked}::boolean, ${hash}::text, ${row.clientVer}::text
          WHERE (SELECT count(*) FROM speed_runs WHERE ip_hash = ${hash} AND created_at > now() - interval '1 minute') < ${RATE_LIMIT_PER_MIN}::integer
          RETURNING id`,
      ],
      { isolationLevel: "ReadCommitted" },
    );
    if (written.length === 0) return Response.json({ ok: false, error: "送太快了，等一下再存" }, { status: 429 });
    return Response.json({ ok: true, ranked: row.ranked });
  } catch (error) {
    console.error("speed/runs", error);
    return Response.json({ ok: false, error: "排行暫時連不上，等一下再存" }, { status: 500 });
  }
}
