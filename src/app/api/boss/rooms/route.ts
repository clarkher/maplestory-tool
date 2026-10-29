// src/app/api/boss/rooms/route.ts
import { newRoomCode } from "@/lib/boss/room-code";
import { ensureBossSchema, getSql, speedEnv } from "@/lib/boss/server/db";
import { BAD, DB_ERR, NO_DB, isJson } from "@/lib/boss/server/http";

export const dynamic = "force-dynamic";

/**
 * 開一間新房間，回 { ok, code }。撞號（主鍵衝突）最多重抽 5 次。
 * 沒設 DATABASE_URL 回 503；資料庫出錯回 500（不把錯誤內容送出去）。
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
    for (let i = 0; i < 5; i++) {
      const code = newRoomCode();
      const made = await sql`INSERT INTO boss_rooms (code, env) VALUES (${code}, ${speedEnv()}) ON CONFLICT DO NOTHING RETURNING code`;
      if (made.length > 0) return Response.json({ ok: true, code });
    }
    return Response.json({ ok: false, error: "暫時開不了房間，等一下再過來" }, { status: 500 });
  } catch (error) {
    console.error("boss/rooms", error);
    return Response.json(DB_ERR, { status: 500 });
  }
}
