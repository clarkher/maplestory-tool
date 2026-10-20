// src/app/api/speed/runs/route.ts
import { createHash, randomBytes } from "node:crypto";
import monsterJson from "../../../../../public/data/monsters.json";
import trainingJson from "../../../../../public/data/training.json";
import { ensureSchema, getSql, speedEnv } from "@/lib/speed/server/db";
import { checkCoupon, checkRun, mapCap, RATE_LIMIT_PER_MIN, toRow, type Coupon, type RunPayload, type RunRow } from "@/lib/speed/server/rules";
import type { Monster, TrainingRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const MONSTERS = monsterJson as unknown as Monster[];
const TRAINING = trainingJson as unknown as TrainingRow[];
const MONSTER_BY_ID = new Map(MONSTERS.map(monster => [monster.id, monster]));

// TODO(練功測速)：正式機上線前一定要在 Vercel 設 SPEED_SALT（隨便一串別人猜不到的字）。
// 沒設時用這個預設值，位址雜湊只擋得住一般的灌資料，擋不住有心人拿原始碼反推位址（IPv4 的組合有限）。
const SALT = process.env.SPEED_SALT ?? "maplebook-speed";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/**
 * 網路位址只存雜湊，而且雜湊裡混了當天的日期（UTC）：同一個位址隔天算出來不一樣，紀錄不能跨天認出同一個人。
 * 擋灌資料只看一分鐘內，跨日（UTC 午夜）那一分鐘最多多放一輪，沒關係。
 */
function ipHash(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  return sha256(`${SALT}:${day}:${ip}`).slice(0, 32);
}

const isJson = (request: Request): boolean => (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() === "application/json";

/** 讀 JSON 內容：不是 application/json、或解析失敗回 ok: false（呼叫的回 400「格式不對」） */
async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  // 只收 application/json：網頁表單從別的網站丟過來的簡單請求（text/plain 之類）不用預檢，這裡直接擋掉
  if (!isJson(request)) return { ok: false };
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

/** 算好要存的欄位：這張圖的經驗上限、練功資料、怪物表都帶上（存一筆跟補填加倍券用同一套） */
function rowOf(run: RunPayload, coupon: Coupon | null = null): RunRow {
  const trainingRow = run.mapId === null ? undefined : TRAINING.find(item => item.m === run.mapId);
  return toRow(run, run.mapId === null ? null : mapCap(run.mapId, TRAINING, MONSTERS), trainingRow, MONSTER_BY_ID, coupon);
}

const BAD = { ok: false, error: "格式不對" } as const;

/**
 * 存一筆練功紀錄。檢查 → 算 10 分鐘經驗、進不進排行、全隊 10 分鐘打幾隻 → 擋同位址一分鐘送太多 → 寫入。
 * 成功回 { ok, ranked, id, token }：id 是這筆的編號（字串，bigint 怕超過 JS 數字），token 是 128 位元隨機字（32 個 16 進位字），
 * 一天內拿 id＋token 呼叫 PATCH 補填加倍券；資料庫只存 token 的 SHA-256（edit_hash），偷看資料庫也拿不到 token。
 * 存的當下一律當沒開加倍券（coupon_mult、coupon_min 是 NULL）：一段存好才問，沒回答也不會漏存。
 * 沒設 DATABASE_URL 回 503「排行還沒開」；資料庫自己出錯回 500（不把錯誤內容送出去）。
 */
export async function POST(request: Request): Promise<Response> {
  const sql = getSql();
  if (!sql) return Response.json({ ok: false, error: "排行還沒開" }, { status: 503 });
  const parsed = await readJson(request);
  if (!parsed.ok) return Response.json(BAD, { status: 400 });
  const checked = checkRun(parsed.body);
  if (!checked.ok) return Response.json(checked, { status: 400 });
  const run = checked.run;
  try {
    await ensureSchema(sql);
    const hash = ipHash(request);
    const row = rowOf(run);
    const token = randomBytes(16).toString("hex");
    const editHash = sha256(token);
    // 「數這一分鐘送了幾次」跟「寫進去」不能分開送：同時來 100 個請求，全都數到 0 就全寫進去了。
    // 所以放進同一個 transaction、分兩句：
    //   1. 先對這個位址的雜湊拿 advisory lock（同一個位址的請求在這裡排隊，transaction 結束自動放）；
    //   2. 再 INSERT … SELECT … WHERE（這一分鐘的筆數 < 上限）。
    // 一定要兩句：READ COMMITTED 下每一句開始時才取資料快照，排隊等到鎖的請求，第二句才看得到前一個剛 commit 的紀錄。
    // INSERT … SELECT 的參數沒有欄位可以推型別，每個都要明講；RETURNING 是空的就是被上限擋掉。
    const [, written] = await sql.transaction(
      [
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${hash}::text, 0))`,
        sql`INSERT INTO speed_runs (env, map_id, map_name, level, job, char_id, is_public, party_size, party_levels, party_hitter, mode, started_at, duration_sec, exp_gained, exp_per_10min, kills_per_10min, level_ups, deaths, ranked, ip_hash, client_ver, coupon_mult, coupon_min, edit_hash)
          SELECT ${speedEnv()}::text, ${row.mapId}::integer, ${row.mapName}::text, ${row.level}::integer, ${row.job}::integer, ${row.charId}::text, ${row.isPublic}::boolean, ${row.partySize}::integer, ${row.partyLevels}::integer[], ${row.partyHitter}::integer, ${row.mode}::text, ${row.startedAt}::timestamptz, ${row.durationSec}::integer, ${row.expGained}::bigint, ${row.expPer10}::bigint, ${row.killsPer10}::real, ${row.levelUps}::integer, ${row.deaths}::integer, ${row.ranked}::boolean, ${hash}::text, ${row.clientVer}::text, ${row.couponMult}::real, ${row.couponMin}::integer, ${editHash}::text
          WHERE (SELECT count(*) FROM speed_runs WHERE ip_hash = ${hash} AND created_at > now() - interval '1 minute') < ${RATE_LIMIT_PER_MIN}::integer
          RETURNING id`,
      ],
      { isolationLevel: "ReadCommitted" },
    );
    const inserted = written as { id: string | number }[];
    if (inserted.length === 0) return Response.json({ ok: false, error: "送太快了，等一下再存" }, { status: 429 });
    return Response.json({ ok: true, ranked: row.ranked, id: String(inserted[0].id), token });
  } catch (error) {
    console.error("speed/runs", error);
    return Response.json({ ok: false, error: "排行暫時連不上，等一下再存" }, { status: 500 });
  }
}

/** 正整數字串、不補 0，最大到 Postgres bigint 的上限（超過的資料庫會報錯，先擋掉） */
const ID_PATTERN = /^[1-9][0-9]{0,18}$/;
const BIGINT_MAX = 9223372036854775807n;
const TOKEN_PATTERN = /^[0-9a-f]{32}$/i;

/** PATCH 要改哪一筆：id、token 格式對才查資料庫；token 一律轉小寫（存的雜湊是照小寫算的） */
function checkTarget(body: unknown): { ok: true; id: string; token: string; coupon: unknown } | { ok: false } {
  if (!body || typeof body !== "object") return { ok: false };
  const b = body as Record<string, unknown>;
  if (typeof b.id !== "string" || !ID_PATTERN.test(b.id) || BigInt(b.id) > BIGINT_MAX) return { ok: false };
  if (typeof b.token !== "string" || !TOKEN_PATTERN.test(b.token)) return { ok: false };
  return { ok: true, id: b.id, token: b.token.toLowerCase(), coupon: b.coupon };
}

/** 資料庫裡那一筆（Neon 回的樣子：bigint 是字串、時間可能是 Date 或字串） */
type Stored = {
  map_id: number | null;
  map_name: string | null;
  level: number;
  job: number | null;
  char_id: string | null;
  is_public: boolean;
  party_levels: number[] | null;
  party_hitter: number;
  mode: "auto" | "manual";
  started_at: string | Date;
  duration_sec: number;
  exp_gained: string | number;
  level_ups: number;
  deaths: number;
  client_ver: string | null;
};

function storedRun(row: Stored): RunPayload {
  return {
    mapId: row.map_id,
    mapName: row.map_name,
    level: row.level,
    job: row.job,
    charId: row.char_id,
    isPublic: row.is_public,
    partyLevels: row.party_levels ?? [],
    partyHitter: row.party_hitter,
    mode: row.mode,
    startedAt: new Date(row.started_at).toISOString(),
    durationSec: row.duration_sec,
    expGained: Number(row.exp_gained),
    levelUps: row.level_ups,
    deaths: row.deaths,
    clientVer: row.client_ver ?? "",
  };
}

const NOT_FOUND = { ok: false, error: "找不到這筆紀錄（超過一天就不能改了）" } as const;

/**
 * 補填加倍券（10/20）：一段存好之後頁面問「這段有開加倍券嗎？」，回答了就送 { id, token, coupon: { mult, minutes } | null }。
 * 只認同一個環境、token 的雜湊對得上、24 小時內存的那一筆；找不到回 404。
 * 照存的那筆重算 10 分鐘經驗、全隊打幾隻、進不進排行（跟存一筆同一套，經驗上限照原始速度擋），
 * 只改 coupon_mult、coupon_min、exp_per_10min、kills_per_10min、ranked 這五欄，其他欄位不動。
 * 成功回 { ok, ranked, expPer10 }（expPer10 是回推後的真實速度）。
 * 沒設 DATABASE_URL 回 503；格式不對、加倍券不合規則回 400；資料庫出錯回 500（不把錯誤內容送出去）。
 * 不另外擋送太快：token 是 128 位元隨機字，猜不到；猜錯的只花一句用主鍵查的 SELECT。
 */
export async function PATCH(request: Request): Promise<Response> {
  const sql = getSql();
  if (!sql) return Response.json({ ok: false, error: "排行還沒開" }, { status: 503 });
  const parsed = await readJson(request);
  if (!parsed.ok) return Response.json(BAD, { status: 400 });
  const target = checkTarget(parsed.body);
  if (!target.ok) return Response.json(BAD, { status: 400 });
  const editHash = sha256(target.token);
  try {
    await ensureSchema(sql);
    const found = (await sql`
      SELECT map_id, map_name, level, job, char_id, is_public, party_levels, party_hitter, mode, started_at, duration_sec, exp_gained, level_ups, deaths, client_ver
      FROM speed_runs
      WHERE env = ${speedEnv()} AND id = ${target.id}::bigint AND edit_hash = ${editHash} AND created_at > now() - interval '1 day'`) as Stored[];
    if (found.length === 0) return Response.json(NOT_FOUND, { status: 404 });
    const run = storedRun(found[0]);
    const coupon = checkCoupon(target.coupon, run.durationSec);
    if (!coupon.ok) return Response.json(coupon, { status: 400 });
    const row = rowOf(run, coupon.coupon);
    // 條件再帶一次 edit_hash：只改得到 token 對得上的那筆。RETURNING 是空的＝找到之後剛好不見了，當找不到
    const changed = await sql`
      UPDATE speed_runs SET coupon_mult = ${row.couponMult}::real, coupon_min = ${row.couponMin}::integer, exp_per_10min = ${row.expPer10}::bigint, kills_per_10min = ${row.killsPer10}::real, ranked = ${row.ranked}::boolean
      WHERE id = ${target.id}::bigint AND edit_hash = ${editHash}
      RETURNING id`;
    if (changed.length === 0) return Response.json(NOT_FOUND, { status: 404 });
    return Response.json({ ok: true, ranked: row.ranked, expPer10: row.expPer10 });
  } catch (error) {
    console.error("speed/runs PATCH", error);
    return Response.json({ ok: false, error: "排行暫時連不上，等一下再存" }, { status: 500 });
  }
}
