// src/lib/speed/server/db.ts
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * 練功測速的資料庫（Neon，Vercel 整合給 DATABASE_URL）。沒設就回 null，API 回 503「排行還沒開」。
 * 建表在第一次呼叫時做（CREATE … IF NOT EXISTS、ALTER … 補欄位，不刪資料、不改資料）；同一個執行個體只做一次。
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
      // CREATE TABLE 維持 10/13 第一次建表的欄位（正式機已經有這張表，只有全新的資料庫才真的建）；之後改的欄位一律寫在下面的 ALTER。
      // party_size＝1＋隊友數；party_levels／party_hitter 是玩家自己填的隊友等級跟誰在打怪；
      // kills_per_10min 是伺服器照組隊經驗公式回推的「全隊 10 分鐘打幾隻」（沒有這張圖的練功資料就 NULL）。
      // 一張表、補欄位、三個索引放進同一個 transaction，一次來回送出去；要嘛全成要嘛全不成，不會留下只建了一半的表。
      await sql.transaction([
        sql`CREATE TABLE IF NOT EXISTS speed_runs (
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
        )`,
        // 10/20 補的（每一句重跑都沒事，已經改過的不會再動）：
        // - char_id 可以空著：沒填角色 ID 也存（排行寫匿名玩家，用網路位址雜湊分組）
        // - coupon_mult：加倍券倍率（1.10～3.00，兩位小數）；沒開是 NULL
        // - coupon_min：這段裡有開加倍券的分鐘數；沒開是 NULL
        //   有開的話 exp_per_10min、kills_per_10min、ranked 存的是扣掉加倍後回推的；原始速度用 exp_gained ÷ duration_sec 算得回來
        // - edit_hash：存一筆時發給頁面的 token 的 SHA-256（只存雜湊），一天內拿 token 才改得到這筆的加倍券
        // ALTER 就算沒東西要改也會獨佔整張表一下（每個執行個體只有第一次呼叫時，整個 transaction 幾毫秒）。
        // ALTER 放在建索引前面：先拿到最強的鎖，兩個執行個體同時建表才不會各自先拿到索引的鎖、
        // 再互等對方放掉才能升級成 ALTER 的鎖（死結）。
        sql`ALTER TABLE speed_runs ALTER COLUMN char_id DROP NOT NULL`,
        sql`ALTER TABLE speed_runs ADD COLUMN IF NOT EXISTS coupon_mult real`,
        sql`ALTER TABLE speed_runs ADD COLUMN IF NOT EXISTS coupon_min integer`,
        sql`ALTER TABLE speed_runs ADD COLUMN IF NOT EXISTS edit_hash text`,
        sql`CREATE INDEX IF NOT EXISTS speed_runs_board ON speed_runs (env, map_id, ranked, exp_per_10min DESC)`,
        sql`CREATE INDEX IF NOT EXISTS speed_runs_char ON speed_runs (env, char_id, created_at DESC)`,
        sql`CREATE INDEX IF NOT EXISTS speed_runs_ip ON speed_runs (ip_hash, created_at DESC)`,
      ]);
    })();
    ready.catch(() => {
      ready = null;
    });
  }
  return ready;
}
