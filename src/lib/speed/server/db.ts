// src/lib/speed/server/db.ts
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * 練功測速的資料庫（Neon，Vercel 整合給 DATABASE_URL）。沒設就回 null，API 回 503「排行還沒開」。
 * 建表在第一次呼叫時做（CREATE … IF NOT EXISTS，不刪不改）；同一個執行個體只做一次。
 */
export function getSql(): NeonQueryFunction<false, false> | null {
  const url = process.env.DATABASE_URL;
  return url ? neon(url) : null;
}

/** 排行只看同一個環境：測試機（preview）的資料不會混進正式機 */
export function speedEnv(): string {
  return process.env.VERCEL_ENV ?? "development";
}

let ready: Promise<void> | null = null;

export function ensureSchema(sql: NeonQueryFunction<false, false>): Promise<void> {
  if (!ready) {
    ready = (async () => {
      // 表還沒在任何地方建過，欄位一次到位（之後要加欄位再另外 ALTER ADD COLUMN IF NOT EXISTS）。
      // party_size＝1＋隊友數；party_levels／party_hitter 是玩家自己填的隊友等級跟誰在打怪；
      // kills_per_10min 是伺服器照組隊經驗公式回推的「全隊 10 分鐘打幾隻」（沒有這張圖的練功資料就 NULL）。
      await sql`CREATE TABLE IF NOT EXISTS speed_runs (
        id bigserial PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        env text NOT NULL,
        map_id integer,
        map_name text,
        level integer NOT NULL,
        job integer,
        char_id text NOT NULL,
        is_public boolean NOT NULL DEFAULT false,
        party_size integer NOT NULL,
        party_levels integer[] NOT NULL DEFAULT '{}',
        party_hitter integer NOT NULL DEFAULT 0,
        mode text NOT NULL,
        started_at timestamptz NOT NULL,
        duration_sec integer NOT NULL,
        exp_gained bigint NOT NULL,
        exp_per_10min bigint NOT NULL,
        kills_per_10min real,
        level_ups integer NOT NULL DEFAULT 0,
        deaths integer NOT NULL DEFAULT 0,
        ranked boolean NOT NULL,
        ip_hash text NOT NULL,
        client_ver text
      )`;
      await sql`CREATE INDEX IF NOT EXISTS speed_runs_board ON speed_runs (env, map_id, ranked, exp_per_10min DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS speed_runs_char ON speed_runs (env, char_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS speed_runs_ip ON speed_runs (ip_hash, created_at DESC)`;
    })();
    ready.catch(() => {
      ready = null;
    });
  }
  return ready;
}
