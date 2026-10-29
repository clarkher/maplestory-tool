// src/app/api/boss/rooms/route.ts
import { newRoomCode } from "@/lib/boss/room-code";
import { ensureBossSchema, bossIpHash, getSql, speedEnv } from "@/lib/boss/server/db";
import { ROOM_CREATES_PER_10MIN } from "@/lib/boss/server/rules";
import { BAD, DB_ERR, NO_DB, isJson } from "@/lib/boss/server/http";

export const dynamic = "force-dynamic";

/**
 * 開一間新房間，回 { ok, code }。撞號（主鍵衝突）最多重抽 5 次。
 * 沒設 DATABASE_URL 回 503；資料庫出錯回 500（不把錯誤內容送出去）。
 * 同一個位址 10 分鐘內開滿 5 間回 429。寫法同 events：先對位址雜湊拿 advisory lock，
 * 再 INSERT … SELECT … WHERE（次數 < 上限），數次數跟寫入在同一個 transaction，同時送也不會超過。
 */
export async function POST(request: Request): Promise<Response> {
  const sql = getSql();
  if (!sql) return Response.json(NO_DB, { status: 503 });
  // 開房間不需要內容：沒帶 body 或空 body 都可以；有帶的話一定要是 application/json 且解析得出來
  const text = await request.text();
  if (text.trim() !== "") {
    if (!isJson(request)) return Response.json(BAD, { status: 400 });
    try {
      JSON.parse(text);
    } catch {
      return Response.json(BAD, { status: 400 });
    }
  }
  try {
    await ensureBossSchema(sql);
    const hash = bossIpHash(request);
    const recentCount = () => sql`SELECT count(*) FROM boss_rooms WHERE ip_hash = ${hash}::text AND created_at > now() - interval '10 minutes'`;
    for (let i = 0; i < 5; i++) {
      const code = newRoomCode();
      const [, made] = await sql.transaction(
        [
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${hash}::text, 1))`,
          sql`INSERT INTO boss_rooms (code, env, ip_hash)
            SELECT ${code}::text, ${speedEnv()}::text, ${hash}::text
            WHERE (SELECT count(*) FROM boss_rooms WHERE ip_hash = ${hash}::text AND created_at > now() - interval '10 minutes')
                < ${ROOM_CREATES_PER_10MIN}::integer
            ON CONFLICT DO NOTHING
            RETURNING code`,
        ],
        { isolationLevel: "ReadCommitted" },
      );
      if ((made as unknown[]).length > 0) return Response.json({ ok: true, code });
      // 沒寫進去：開太多間被擋，或房號撞到（再抽一次）
      const [recent] = (await recentCount()) as { count: string | number }[];
      if (Number(recent.count) >= ROOM_CREATES_PER_10MIN) return Response.json({ ok: false, error: "開太多房間了，等一下再過來" }, { status: 429 });
    }
    return Response.json({ ok: false, error: "暫時開不了房間，等一下再過來" }, { status: 500 });
  } catch (error) {
    console.error("boss/rooms", error);
    return Response.json(DB_ERR, { status: 500 });
  }
}
