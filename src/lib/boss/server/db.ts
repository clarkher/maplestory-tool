// src/lib/boss/server/db.ts
// 野王計時的資料表。沿用練功測速的連線（getSql／speedEnv）；只做 CREATE … IF NOT EXISTS，不刪、不改資料。
import { createHash } from "node:crypto";
import type { NeonQueryFunction } from "@neondatabase/serverless";

export { getSql, speedEnv } from "@/lib/speed/server/db";

// 跟練功測速共用同一個 SALT 預設值（正式機要設 SPEED_SALT）
const SALT = process.env.SPEED_SALT ?? "maplebook-speed";

/** 網路位址只存雜湊，混當天（UTC）日期，隔天算出來不同 */
export function bossIpHash(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${SALT}:${day}:${ip}`).digest("hex").slice(0, 32);
}

let ready: Promise<void> | null = null;

export function ensureBossSchema(sql: NeonQueryFunction<false, false>): Promise<void> {
  if (!ready) {
    ready = (async () => {
      // 四張表加索引（含後來補的欄位）放進同一個 transaction：要嘛全成要嘛全不成
      await sql.transaction([
        sql`CREATE TABLE IF NOT EXISTS boss_rooms (
            code text PRIMARY KEY,
            env text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS boss_events (
            seq bigserial PRIMARY KEY,
            room text NOT NULL,
            env text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            ip_hash text NOT NULL,
            eid text NOT NULL,
            server text NOT NULL,
            boss integer NOT NULL,
            ch integer NOT NULL,
            kind text NOT NULL,
            at timestamptz NOT NULL,
            target text
        )`,
        sql`CREATE TABLE IF NOT EXISTS boss_presence (
            room text,
            device text,
            seen_at timestamptz NOT NULL,
            PRIMARY KEY (room, device)
        )`,
        sql`CREATE TABLE IF NOT EXISTS boss_intervals (
            id bigserial PRIMARY KEY,
            env text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            ip_hash text NOT NULL,
            server text NOT NULL,
            boss integer NOT NULL,
            seconds integer NOT NULL
        )`,
        sql`CREATE INDEX IF NOT EXISTS boss_events_room ON boss_events (room, seq)`,
        sql`CREATE INDEX IF NOT EXISTS boss_events_ip ON boss_events (ip_hash, created_at)`,
        // 同一間房間同一個事件編號只存一筆：客戶端重送沒送成功的事件不會重複
        sql`CREATE UNIQUE INDEX IF NOT EXISTS boss_events_room_eid ON boss_events (room, eid)`,
        sql`CREATE INDEX IF NOT EXISTS boss_intervals_ip ON boss_intervals (ip_hash, created_at)`,
        sql`CREATE INDEX IF NOT EXISTS boss_intervals_env_boss ON boss_intervals (env, boss)`,
        // v1.18 收尾：開房間限流要記位址雜湊（舊的房間這欄是空的，不影響）
        sql`ALTER TABLE boss_rooms ADD COLUMN IF NOT EXISTS ip_hash text`,
        sql`CREATE INDEX IF NOT EXISTS boss_rooms_ip ON boss_rooms (ip_hash, created_at)`,
      ]);
    })();
    ready.catch(() => {
      ready = null;
    });
  }
  return ready;
}
