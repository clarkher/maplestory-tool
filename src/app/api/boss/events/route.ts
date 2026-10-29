// src/app/api/boss/events/route.ts
import { normalizeRoomCode } from "@/lib/boss/room-code";
import { ensureBossSchema, bossIpHash, getSql, speedEnv } from "@/lib/boss/server/db";
import { BAD, DB_ERR, DEAD, NO_DB, TOO_FAST, readJson } from "@/lib/boss/server/http";
import { BOSS_WRITES_PER_MIN, ONLINE_MS, checkEventBatch } from "@/lib/boss/server/rules";
import type { BossEvent, ServerKey } from "@/lib/boss/types";

export const dynamic = "force-dynamic";

const DEVICE_RE = /^[A-Za-z0-9-]{1,40}$/;
const GET_LIMIT = 500;

type Sql = NonNullable<ReturnType<typeof getSql>>;

/** 房間還活著：同環境有這間，而且 24 小時內建的、或 24 小時內有人記過事件 */
async function roomAlive(sql: Sql, room: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM boss_rooms r
    WHERE r.code = ${room} AND r.env = ${speedEnv()}
      AND (r.created_at > now() - interval '24 hours'
           OR EXISTS (SELECT 1 FROM boss_events e WHERE e.room = r.code AND e.env = r.env AND e.created_at > now() - interval '24 hours'))`;
  return rows.length > 0;
}

/** 記下這台裝置剛剛有出現（算在線人數用） */
async function touchPresence(sql: Sql, room: string, device: string): Promise<void> {
  await sql`INSERT INTO boss_presence (room, device, seen_at) VALUES (${room}, ${device}, now())
    ON CONFLICT (room, device) DO UPDATE SET seen_at = now()`;
}

type Stored = {
  seq: string | number;
  eid: string;
  server: string;
  boss: number;
  ch: number;
  kind: string;
  at_ms: string | number;
  target: string | null;
};

function toEvent(row: Stored): BossEvent {
  const base = { id: row.eid, server: row.server as ServerKey, boss: row.boss, ch: row.ch, at: Number(row.at_ms) };
  if (row.kind === "retract") return { ...base, kind: "retract", target: row.target ?? "" };
  return { ...base, kind: row.kind as "kill" | "empty" };
}

/**
 * 讀房間裡 seq 比 since 大的事件（最多 500 筆，由舊到新），回 { ok, events, seq, online }。
 * seq＝這次回的最大編號，沒有新事件就回傳進來的 since；online＝2 分鐘內出現過的裝置數。
 * device 格式對才記在線（不對就略過）。房間不存在或已失效回 404。
 */
export async function GET(request: Request): Promise<Response> {
  const sql = getSql();
  if (!sql) return Response.json(NO_DB, { status: 503 });
  const params = new URL(request.url).searchParams;
  const room = normalizeRoomCode(params.get("room") ?? "");
  if (!room) return Response.json(BAD, { status: 400 });
  const sinceRaw = params.get("since") ?? "0";
  if (!/^[0-9]{1,15}$/.test(sinceRaw)) return Response.json(BAD, { status: 400 });
  const since = Number(sinceRaw);
  const device = params.get("device") ?? "";
  try {
    await ensureBossSchema(sql);
    if (!(await roomAlive(sql, room))) return Response.json(DEAD, { status: 404 });
    if (DEVICE_RE.test(device)) await touchPresence(sql, room, device);
    const rows = (await sql`
      SELECT seq, eid, server, boss, ch, kind, (extract(epoch from at) * 1000)::bigint AS at_ms, target
      FROM boss_events
      WHERE room = ${room} AND env = ${speedEnv()} AND seq > ${since}::bigint
      ORDER BY seq ASC
      LIMIT ${GET_LIMIT}`) as Stored[];
    const online = (await sql`
      SELECT count(*)::int AS n FROM boss_presence
      WHERE room = ${room} AND seen_at > now() - ${ONLINE_MS / 1000}::int * interval '1 second'`) as { n: number }[];
    const seq = rows.length > 0 ? Number(rows[rows.length - 1].seq) : since;
    return Response.json({ ok: true, events: rows.map(toEvent), seq, online: online[0]?.n ?? 0 });
  } catch (error) {
    console.error("boss/events GET", error);
    return Response.json(DB_ERR, { status: 500 });
  }
}

/**
 * 記一批事件：body { room, device, events }，回 { ok, seq }（seq＝這批最大編號）。
 * 同一個位址一分鐘內的「送出次數」（一批算一次：同一句 INSERT 共用一個 now()，用 created_at 不同來數；
 * 回收間隔回報也一起算）達上限回 429。
 * 數次數跟寫入放進同一個 transaction：先對位址雜湊拿 advisory lock，再 INSERT … SELECT … WHERE（次數 < 上限），
 * 兩句分開是因為 READ COMMITTED 下每句開始才取快照，排隊等到鎖的請求第二句才看得到前一個剛 commit 的紀錄。
 */
export async function POST(request: Request): Promise<Response> {
  const sql = getSql();
  if (!sql) return Response.json(NO_DB, { status: 503 });
  const parsed = await readJson(request);
  if (!parsed.ok || typeof parsed.body !== "object" || parsed.body === null) return Response.json(BAD, { status: 400 });
  const body = parsed.body as Record<string, unknown>;
  const room = typeof body.room === "string" ? normalizeRoomCode(body.room) : null;
  const device = typeof body.device === "string" && DEVICE_RE.test(body.device) ? body.device : null;
  const events = checkEventBatch(body.events, Date.now());
  if (!room || !device || !events) return Response.json(BAD, { status: 400 });
  try {
    await ensureBossSchema(sql);
    if (!(await roomAlive(sql, room))) return Response.json(DEAD, { status: 404 });
    const hash = bossIpHash(request);
    const eids = events.map(e => e.id);
    const servers = events.map(e => e.server);
    const bosses = events.map(e => e.boss);
    const chs = events.map(e => e.ch);
    const kinds = events.map(e => e.kind);
    const ats = events.map(e => e.at);
    const targets = events.map(e => (e.kind === "retract" ? e.target : null));
    const [, written] = await sql.transaction(
      [
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${hash}::text, 0))`,
        sql`INSERT INTO boss_events (room, env, ip_hash, eid, server, boss, ch, kind, at, target)
          SELECT ${room}::text, ${speedEnv()}::text, ${hash}::text, u.eid, u.server, u.boss, u.ch, u.kind, to_timestamp(u.at / 1000.0), u.target
          FROM unnest(${eids}::text[], ${servers}::text[], ${bosses}::integer[], ${chs}::integer[], ${kinds}::text[], ${ats}::double precision[], ${targets}::text[])
            AS u(eid, server, boss, ch, kind, at, target)
          WHERE (SELECT count(DISTINCT created_at) FROM boss_events WHERE ip_hash = ${hash}::text AND created_at > now() - interval '1 minute')
              + (SELECT count(DISTINCT created_at) FROM boss_intervals WHERE ip_hash = ${hash}::text AND created_at > now() - interval '1 minute')
              < ${BOSS_WRITES_PER_MIN}::integer
          ON CONFLICT (room, eid) DO NOTHING
          RETURNING seq`,
      ],
      { isolationLevel: "ReadCommitted" },
    );
    const inserted = written as { seq: string | number }[];
    await touchPresence(sql, room, device);
    if (inserted.length > 0) return Response.json({ ok: true, seq: Math.max(...inserted.map(r => Number(r.seq))) });
    // 沒寫進任何一筆：被限流擋掉，或整批都是重送（之前已存過）。再數一次送出次數分辨；重送照樣回 ok＋目前最大編號
    const [recent] = (await sql`
      SELECT (SELECT count(DISTINCT created_at) FROM boss_events WHERE ip_hash = ${hash}::text AND created_at > now() - interval '1 minute')
           + (SELECT count(DISTINCT created_at) FROM boss_intervals WHERE ip_hash = ${hash}::text AND created_at > now() - interval '1 minute') AS n`) as { n: string | number }[];
    if (Number(recent.n) >= BOSS_WRITES_PER_MIN) return Response.json(TOO_FAST, { status: 429 });
    const [top] = (await sql`SELECT coalesce(max(seq), 0) AS seq FROM boss_events WHERE room = ${room} AND env = ${speedEnv()}`) as { seq: string | number }[];
    return Response.json({ ok: true, seq: Number(top.seq) });
  } catch (error) {
    console.error("boss/events POST", error);
    return Response.json(DB_ERR, { status: 500 });
  }
}
