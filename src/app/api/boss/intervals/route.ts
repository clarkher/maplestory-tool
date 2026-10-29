// src/app/api/boss/intervals/route.ts
import { ensureBossSchema, bossIpHash, getSql, speedEnv } from "@/lib/boss/server/db";
import { BAD, DB_ERR, NO_DB, TOO_FAST, readJson } from "@/lib/boss/server/http";
import { BOSS_WRITES_PER_MIN, MIN_REPORT_SAMPLES, checkInterval } from "@/lib/boss/server/rules";

export const dynamic = "force-dynamic";

/**
 * 玩家回報「這隻野王實際隔多久回收」：body { server, boss, seconds }，回 { ok }。
 * 限流跟記事件共用同一個次數（一分鐘 30 次），寫法同 events：advisory lock ＋ INSERT … SELECT … WHERE。
 */
export async function POST(request: Request): Promise<Response> {
  const sql = getSql();
  if (!sql) return Response.json(NO_DB, { status: 503 });
  const parsed = await readJson(request);
  if (!parsed.ok) return Response.json(BAD, { status: 400 });
  const item = checkInterval(parsed.body);
  if (!item) return Response.json(BAD, { status: 400 });
  try {
    await ensureBossSchema(sql);
    const hash = bossIpHash(request);
    const [, written] = await sql.transaction(
      [
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${hash}::text, 0))`,
        sql`INSERT INTO boss_intervals (env, ip_hash, server, boss, seconds)
          SELECT ${speedEnv()}::text, ${hash}::text, ${item.server}::text, ${item.boss}::integer, ${item.seconds}::integer
          WHERE (SELECT count(DISTINCT created_at) FROM boss_events WHERE ip_hash = ${hash}::text AND created_at > now() - interval '1 minute')
              + (SELECT count(DISTINCT created_at) FROM boss_intervals WHERE ip_hash = ${hash}::text AND created_at > now() - interval '1 minute')
              < ${BOSS_WRITES_PER_MIN}::integer
          RETURNING id`,
      ],
      { isolationLevel: "ReadCommitted" },
    );
    if ((written as unknown[]).length === 0) return Response.json(TOO_FAST, { status: 429 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("boss/intervals POST", error);
    return Response.json(DB_ERR, { status: 500 });
  }
}

/**
 * 各隻野王的回收間隔中位數（兩個伺服器合在一起、同環境），只回筆數 >= 20 的。
 * 回 { ok, stats: { [boss]: { n, median } } }，median 是分鐘（四捨五入的整數）。
 */
export async function GET(): Promise<Response> {
  const sql = getSql();
  if (!sql) return Response.json(NO_DB, { status: 503 });
  try {
    await ensureBossSchema(sql);
    const rows = (await sql`
      SELECT boss, count(*)::int AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds) AS med
      FROM boss_intervals
      WHERE env = ${speedEnv()}
      GROUP BY boss
      HAVING count(*) >= ${MIN_REPORT_SAMPLES}::integer`) as { boss: number; n: number; med: number | string }[];
    const stats: Record<string, { n: number; median: number }> = {};
    for (const r of rows) stats[String(r.boss)] = { n: r.n, median: Math.round(Number(r.med) / 60) };
    return Response.json({ ok: true, stats });
  } catch (error) {
    console.error("boss/intervals GET", error);
    return Response.json(DB_ERR, { status: 500 });
  }
}
