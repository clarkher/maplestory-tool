// src/lib/speed/__tests__/api.test.ts
// 資料庫換成假的（記下送出去的每一句 SQL 跟參數），不連真的 Neon。
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Monster, TrainingRow } from "@/lib/types";
import monsterJson from "../../../../public/data/monsters.json";
import trainingJson from "../../../../public/data/training.json";
import { mapCap, toRow, type BoardRow, type Coupon, type RunPayload } from "../server/rules";

type Call = { text: string; values: unknown[]; tx?: number };
const db = vi.hoisted(() => ({
  /** 實際送到資料庫的每一句（在 transaction 裡的帶 tx 編號）。tagged template 本身是惰性的，只有被 await 或丟進 transaction 才算送出 */
  calls: [] as { text: string; values: unknown[]; tx?: number }[],
  txCount: 0,
  txOptions: [] as unknown[],
  /** advisory lock 的假實作：同一把鎖同一時間只有一個 transaction 能進，跟 Postgres 的 pg_advisory_xact_lock 一樣 */
  locks: new Map<string, Promise<void>>(),
  reply: (_text: string, _values: unknown[]): unknown[] | Error | Promise<unknown[] | Error> => [],
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => {
    const normalize = (strings: TemplateStringsArray) => strings.join("?").replace(/\s+/g, " ").trim();
    const run = async (text: string, values: unknown[], tx?: number): Promise<unknown[]> => {
      db.calls.push({ text, values, tx });
      const result = await db.reply(text, values);
      if (result instanceof Error) throw result;
      return result;
    };
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = normalize(strings);
      return {
        queryData: { text, values },
        then: (resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) => run(text, values).then(resolve, reject),
      };
    };
    sql.transaction = async (queries: { queryData: { text: string; values: unknown[] } }[], options?: unknown) => {
      const tx = ++db.txCount;
      db.txOptions.push(options);
      let release = () => {};
      try {
        const results: unknown[][] = [];
        for (const { text, values } of queries.map(query => query.queryData)) {
          if (text.includes("pg_advisory_xact_lock")) {
            const key = String(values[0]);
            const previous = db.locks.get(key) ?? Promise.resolve();
            const mine = new Promise<void>(resolve => {
              release = resolve;
            });
            db.locks.set(key, previous.then(() => mine));
            await previous;
          }
          results.push(await run(text, values, tx));
        }
        return results;
      } finally {
        release();
      }
    };
    return sql;
  },
}));

const monsters = monsterJson as unknown as Monster[];
const training = trainingJson as unknown as TrainingRow[];

/** 每個測試都重新載入，db.ts 裡「建表只做一次」的記號才不會留到下一個測試 */
async function load() {
  vi.resetModules();
  const runs = await import("@/app/api/speed/runs/route");
  const board = await import("@/app/api/speed/board/route");
  const dbModule = await import("@/lib/speed/server/db");
  return { POST: runs.POST, PATCH: runs.PATCH, GET: board.GET, ...dbModule };
}

const MAP = 105040303;
const payload: RunPayload = {
  mapId: MAP, mapName: "森林迷宮III", level: 46, job: 220, charId: "芙莉蓮熊芙莉", isPublic: true, partyLevels: [], partyHitter: 0, mode: "auto",
  startedAt: "2026-10-13T10:00:00.000Z", durationSec: 900, expGained: 150_000, levelUps: 0, deaths: 0, clientVer: "v0.95",
};

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://x/api/speed/runs", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

const get = (query: string) => new Request(`http://x/api/speed/board${query}`);

function patch(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://x/api/speed/runs", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const MONSTER_BY_ID = new Map(monsters.map(monster => [monster.id, monster]));
/** 跟 runs/route.ts 一樣的算法：這張圖的上限、練功資料、怪物表都帶上 */
const expectedRow = (run: RunPayload, coupon: Coupon | null = null) =>
  toRow(run, run.mapId === null ? null : mapCap(run.mapId, training, monsters), training.find(item => item.m === run.mapId), MONSTER_BY_ID, coupon);

/** 回覆：INSERT 那句回一列（寫進去了），其他回空 */
function quiet(text: string): unknown[] {
  return text.startsWith("INSERT") ? [{ id: 1 }] : [];
}

/** INSERT 那句：欄位名跟參數一一對起來，順序排錯就會對不上 */
function insertCall(calls: Call[]): Call {
  const call = calls.find(item => item.text.startsWith("INSERT INTO speed_runs"));
  if (!call) throw new Error("沒有送出 INSERT");
  return call;
}

function inserted(calls: Call[]): Record<string, unknown> {
  const call = insertCall(calls);
  const columns = /\(([^)]*)\) SELECT/.exec(call.text)![1].split(",").map(name => name.trim());
  // SELECT 的每個位置都要明講型別（INSERT … SELECT 不會幫參數推型別）
  const selectList = /\) SELECT (.*?) WHERE \(SELECT count/.exec(call.text)![1];
  expect(selectList.match(/\?::[a-z]+(\[\])?/g)).toHaveLength(columns.length);
  expect(selectList.match(/\?/g)).toHaveLength(columns.length);
  // 後面還有兩個參數：這個位址的雜湊、每分鐘上限
  expect(call.values).toHaveLength(columns.length + 2);
  return Object.fromEntries(columns.map((name, index) => [name, call.values[index]]));
}

/** 在假的資料庫裡模擬「INSERT 的 WHERE 看到的是這句開始時的資料」：先數、讓出時間給別的請求、再寫入 */
function simulatedRateLimit(): string[] {
  const rows: string[] = [];
  db.reply = async (text, values) => {
    if (!text.startsWith("INSERT")) return [];
    const hash = values[values.length - 2] as string;
    const limit = values[values.length - 1] as number;
    const seen = rows.filter(item => item === hash).length;
    await new Promise(resolve => setTimeout(resolve, 1));
    if (seen >= limit) return [];
    rows.push(hash);
    return [{ id: rows.length }];
  };
  return rows;
}

const savedEnv = { url: process.env.DATABASE_URL, vercel: process.env.VERCEL_ENV };
beforeEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.VERCEL_ENV;
  db.calls.length = 0;
  db.txCount = 0;
  db.txOptions.length = 0;
  db.locks.clear();
  db.reply = quiet;
  vi.spyOn(console, "error").mockImplementation(() => {});
  // 存一筆只收最近 7 天內開始的（rules.ts checkRun）：把「現在」固定在 payload.startedAt 後 5 分鐘，測試才不會隔幾天就過期
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T10:05:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const [key, value] of [["DATABASE_URL", savedEnv.url], ["VERCEL_ENV", savedEnv.vercel]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("還沒建資料庫", () => {
  it("存一筆回 503「排行還沒開」", async () => {
    const { POST } = await load();
    const response = await POST(post("{}"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "排行還沒開" });
    expect(db.calls).toHaveLength(0);
  });

  it("補填加倍券（PATCH）也回 503「排行還沒開」", async () => {
    const { PATCH } = await load();
    const response = await PATCH(patch({ id: "1", token: "0".repeat(32), coupon: null }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "排行還沒開" });
    expect(db.calls).toHaveLength(0);
  });

  it("排行回 open: false、空的", async () => {
    const { GET } = await load();
    const response = await GET(get("?map=105040303"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ open: false, solo: [], party: [] });
    expect(db.calls).toHaveLength(0);
  });

  it.each(["?map=abc", "?map=0", "?map=-5", "?map=1.5", "?map=", "", "?map=1000000000"])("地圖參數 %s 回 400", async query => {
    const { GET } = await load();
    const response = await GET(get(query));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ open: false, solo: [], party: [] });
  });
});

describe("資料庫（假的）：建表", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://fake";
  });

  it("欄位照 10/13 的版本：組隊等級、誰在打怪、10 分鐘打幾隻", async () => {
    const { ensureSchema, getSql } = await load();
    await ensureSchema(getSql()!);
    const create = db.calls[0].text;
    expect(create).toContain("CREATE TABLE IF NOT EXISTS speed_runs");
    expect(create).toContain("party_size integer NOT NULL");
    expect(create).toContain("party_levels integer[] NOT NULL DEFAULT '{}'");
    expect(create).toContain("party_hitter integer NOT NULL DEFAULT 0");
    expect(create).toContain("kills_per_10min real");
    expect(create).not.toMatch(/kills_per_10min real NOT NULL/);
    expect(db.calls.filter(call => !call.text.startsWith("CREATE TABLE") && !call.text.startsWith("ALTER TABLE")).every(call => call.text.startsWith("CREATE INDEX IF NOT EXISTS"))).toBe(true);
  });

  it("10/20 的欄位用 ALTER 補上（冪等）：角色 ID 可以空著、加倍券倍率跟分鐘數、改這筆用的雜湊", async () => {
    const { ensureSchema, getSql } = await load();
    await ensureSchema(getSql()!);
    expect(db.calls.filter(call => call.text.startsWith("ALTER")).map(call => call.text)).toEqual([
      "ALTER TABLE speed_runs ALTER COLUMN char_id DROP NOT NULL",
      "ALTER TABLE speed_runs ADD COLUMN IF NOT EXISTS coupon_mult real",
      "ALTER TABLE speed_runs ADD COLUMN IF NOT EXISTS coupon_min integer",
      "ALTER TABLE speed_runs ADD COLUMN IF NOT EXISTS edit_hash text",
    ]);
    // 建表沒有刪資料、改資料
    for (const call of db.calls) expect(call.text).not.toMatch(/\b(DELETE|UPDATE|TRUNCATE)\b/i);
  });

  it("一張表、補欄位、三個索引放在同一個 transaction 送（一次來回、要嘛全成要嘛全不成）；ALTER 在索引前面", async () => {
    const { ensureSchema, getSql } = await load();
    await ensureSchema(getSql()!);
    expect(db.calls).toHaveLength(8);
    expect(db.txCount).toBe(1);
    expect(db.calls.every(call => call.tx === 1)).toBe(true);
    // 先拿最強的鎖（ALTER）再建索引：兩個執行個體同時建表時，不會各自先拿到索引的鎖、再互等對方放掉才能升級成 ALTER 的鎖（死結）
    expect(db.calls.map(call => call.text.split(" ").slice(0, 2).join(" "))).toEqual([
      "CREATE TABLE", "ALTER TABLE", "ALTER TABLE", "ALTER TABLE", "ALTER TABLE", "CREATE INDEX", "CREATE INDEX", "CREATE INDEX",
    ]);
  });

  it("同一個執行個體只建一次；失敗了下一次會再試", async () => {
    const { ensureSchema, getSql } = await load();
    await Promise.all([ensureSchema(getSql()!), ensureSchema(getSql()!)]);
    await ensureSchema(getSql()!);
    expect(db.calls.filter(call => call.text.startsWith("CREATE TABLE")).length).toBe(1);
    expect(db.txCount).toBe(1);

    const again = await load();
    db.calls.length = 0;
    db.txCount = 0;
    db.reply = () => new Error("連不上");
    await expect(again.ensureSchema(again.getSql()!)).rejects.toThrow("連不上");
    db.reply = quiet;
    await again.ensureSchema(again.getSql()!);
    expect(db.calls.filter(call => call.text.startsWith("CREATE TABLE")).length).toBe(2);
    expect(db.txCount).toBe(2);
  });

  it("沒有設定 DATABASE_URL 就沒有 sql；環境名稱照 VERCEL_ENV、沒有就 development", async () => {
    delete process.env.DATABASE_URL;
    const { getSql, speedEnv } = await load();
    expect(getSql()).toBeNull();
    expect(speedEnv()).toBe("development");
    process.env.VERCEL_ENV = "preview";
    expect(speedEnv()).toBe("preview");
  });
});

describe("資料庫（假的）：存一筆", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://fake";
  });

  it("不是 JSON 回 400、格式不對的不碰資料庫", async () => {
    const { POST } = await load();
    const response = await POST(post("不是 JSON"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "格式不對" });
    expect(db.calls).toHaveLength(0);
  });

  it.each([
    ["text/plain;charset=UTF-8", "網頁表單（不用預檢的跨站簡單請求）會是這種"],
    ["application/x-www-form-urlencoded", "表單"],
    ["multipart/form-data; boundary=x", "表單"],
    ["application/jsonp", "長得像但不是"],
    ["", "沒寫"],
  ])("Content-Type 是「%s」就算內容是對的 JSON 也回 400 格式不對（%s）、不碰資料庫", async contentType => {
    const { POST } = await load();
    const request = new Request("http://x/api/speed/runs", { method: "POST", body: JSON.stringify(payload), headers: contentType ? { "content-type": contentType } : {} });
    if (!contentType) request.headers.delete("content-type");
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "格式不對" });
    expect(db.calls).toHaveLength(0);
  });

  it.each(["application/json", "application/json; charset=utf-8", "Application/JSON;charset=UTF-8"])("Content-Type 是「%s」可以", async contentType => {
    const { POST } = await load();
    expect((await POST(post(payload, { "content-type": contentType }))).status).toBe(200);
  });

  it("欄位不合規則回 400 加原因、不碰資料庫", async () => {
    const { POST } = await load();
    const response = await POST(post({ ...payload, durationSec: 100 }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("時間");
    expect(db.calls).toHaveLength(0);
  });

  it("單練：先建表，再用一個 transaction 送兩句——先鎖這個位址、再「沒超過上限才」INSERT；進排行", async () => {
    const { POST } = await load();
    const response = await POST(post(payload, { "x-forwarded-for": "1.2.3.4" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, ranked: true });
    expect(db.calls[0].text).toContain("CREATE TABLE");
    const writes = db.calls.filter(call => call.tx === 2);
    expect(db.txCount).toBe(2);
    expect(writes).toHaveLength(2);
    expect(writes[0].text).toBe("SELECT pg_advisory_xact_lock(hashtextextended(?::text, 0))");
    expect(writes[1].text.startsWith("INSERT INTO speed_runs")).toBe(true);
    expect(writes[1].text).toMatch(/WHERE \(SELECT count\(\*\) FROM speed_runs WHERE ip_hash = \? AND created_at > now\(\) - interval '1 minute'\) < \?::integer RETURNING id$/);
    // 沒有另外一句先數次數的查詢（那就是會被同時送的請求繞過去的寫法）
    expect(db.calls.filter(call => call.text.startsWith("SELECT count"))).toHaveLength(0);
    // 第二句要在第一句拿到鎖之後才開始算：兩句是各自獨立的 statement，READ COMMITTED 下第二句才會看到別人剛 commit 的紀錄
    expect(db.txOptions[1]).toEqual({ isolationLevel: "ReadCommitted" });

    const row = inserted(db.calls);
    expect(row).toMatchObject({
      env: "development", map_id: 105040303, map_name: "森林迷宮III", level: 46, job: 220, char_id: "芙莉蓮熊芙莉", is_public: true,
      party_size: 1, mode: "auto", duration_sec: 900, exp_gained: 150_000, exp_per_10min: 100_000, level_ups: 0, deaths: 0, ranked: true,
      party_hitter: 0, client_ver: "v0.95",
    });
    expect(row.party_levels).toEqual([]);
    expect(new Date(row.started_at as string).toISOString()).toBe("2026-10-13T10:00:00.000Z");
    // 單練也算得出 10 分鐘打幾隻（這張圖有練功資料）
    expect(row.kills_per_10min).toBe(toRow(payload, mapCap(MAP, training, monsters), training.find(item => item.m === MAP), new Map(monsters.map(monster => [monster.id, monster]))).killsPer10);
    expect(typeof row.kills_per_10min).toBe("number");
  });

  it("組隊：隊友等級、誰在打怪、隊伍人數、全隊 10 分鐘打幾隻都存下來", async () => {
    const { POST } = await load();
    const party = { partyLevels: [44, 47], partyHitter: 2 };
    const response = await POST(post({ ...payload, ...party }));
    expect(await response.json()).toMatchObject({ ok: true, ranked: true });
    const row = inserted(db.calls);
    expect(row).toMatchObject({ party_size: 3, party_hitter: 2 });
    expect(row.party_levels).toEqual([44, 47]);
    const expected = toRow({ ...payload, ...party }, mapCap(MAP, training, monsters), training.find(item => item.m === MAP), new Map(monsters.map(monster => [monster.id, monster])));
    expect(expected.killsPer10).toBeGreaterThan(0);
    expect(row.kills_per_10min).toBe(expected.killsPer10);
  });

  it("沒有練功資料的圖：照存，打幾隻是 null，但算不出上限所以不進排行", async () => {
    // Task 9 修正第 1 輪、裁決 I3：原本這裡預期 ranked: true，亂編的地圖編號會灌上排行，改成不進排行
    const { POST } = await load();
    const response = await POST(post({ ...payload, mapId: 999_999_999, mapName: "不存在的圖" }));
    expect(await response.json()).toMatchObject({ ok: true, ranked: false });
    expect(inserted(db.calls).ranked).toBe(false);
    expect(inserted(db.calls).kills_per_10min).toBeNull();
  });

  it("沒有地圖：照存，但不進排行", async () => {
    const { POST } = await load();
    const response = await POST(post({ ...payload, mapId: null, mapName: null }));
    expect(await response.json()).toMatchObject({ ok: true, ranked: false });
    const row = inserted(db.calls);
    expect(row).toMatchObject({ map_id: null, map_name: null, ranked: false, kills_per_10min: null });
  });

  it("不到 10 分鐘、或超過這張圖的理論上限：照存，不進排行", async () => {
    const { POST } = await load();
    expect(await (await POST(post({ ...payload, durationSec: 599 }))).json()).toMatchObject({ ok: true, ranked: false });
    expect(inserted(db.calls).ranked).toBe(false);

    db.calls.length = 0;
    expect(await (await POST(post({ ...payload, expGained: 50_000_000 }))).json()).toMatchObject({ ok: true, ranked: false });
    expect(inserted(db.calls).ranked).toBe(false);
  });

  it("存好回這筆的 id（字串）跟改這筆用的 token；資料庫只存 token 的雜湊，原始 token 不進資料庫", async () => {
    const { POST } = await load();
    const response = await POST(post(payload));
    const body = (await response.json()) as { ok: boolean; ranked: boolean; id: string; token: string };
    expect(body).toEqual({ ok: true, ranked: true, id: "1", token: expect.stringMatching(/^[0-9a-f]{32}$/) });
    const row = inserted(db.calls);
    expect(row.edit_hash).toBe(sha256(body.token));
    expect(row.edit_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(db.calls)).not.toContain(body.token);
    // 存的當下一律當沒開加倍券（一段存好才問，回答了再 PATCH 改同一筆）
    expect(row).toMatchObject({ coupon_mult: null, coupon_min: null });
    // INSERT 欄位跟型別：倍率 real、分鐘 integer、雜湊 text
    expect(insertCall(db.calls).text).toMatch(/coupon_mult, coupon_min, edit_hash\) SELECT .*\?::real, \?::integer, \?::text WHERE/);
  });

  it("每一筆的 token 都不一樣；資料庫回的 id 是數字或字串都變成字串", async () => {
    const { POST } = await load();
    const first = (await (await POST(post(payload))).json()) as { token: string };
    db.reply = text => (text.startsWith("INSERT") ? [{ id: "9007199254740993" }] : []);
    const second = (await (await POST(post(payload))).json()) as { id: string; token: string };
    expect(second.id).toBe("9007199254740993");
    expect(second.token).not.toBe(first.token);
  });

  it.each([
    ["null", { charId: null }],
    ["空字串", { charId: "" }],
    ["只有空白", { charId: "   " }],
  ])("沒填角色 ID（%s）照存：char_id 是 null、照樣進排行", async (_name, patchBody) => {
    const { POST } = await load();
    const response = await POST(post({ ...payload, ...patchBody }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, ranked: true });
    expect(inserted(db.calls)).toMatchObject({ char_id: null, ranked: true });
  });

  it("沒給角色 ID 欄位也照存；有填但太短的照舊回 400", async () => {
    const { POST } = await load();
    const { charId: _drop, ...noId } = payload;
    expect((await POST(post(noId))).status).toBe(200);
    expect(inserted(db.calls).char_id).toBeNull();
    db.calls.length = 0;
    const response = await POST(post({ ...payload, charId: "a" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("角色 ID");
    expect(db.calls).toHaveLength(0);
  });

  it("開始時間統一成 UTC 的標準寫法再存（資料庫不用猜格式）", async () => {
    const { POST } = await load();
    await POST(post({ ...payload, startedAt: "2026-10-13T18:00:00+08:00" }));
    expect(inserted(db.calls).started_at).toBe("2026-10-13T10:00:00.000Z");
  });

  it("環境名稱照 VERCEL_ENV：測試機跟正式機的資料分開", async () => {
    process.env.VERCEL_ENV = "preview";
    const { POST } = await load();
    await POST(post(payload));
    expect(inserted(db.calls).env).toBe("preview");
  });

  it("網址只存雜湊：取 x-forwarded-for 第一個、鎖的鑰匙／上限判斷／INSERT 用同一個值、原始位址不進資料庫", async () => {
    const { POST } = await load();
    await POST(post(payload, { "x-forwarded-for": "1.2.3.4, 10.0.0.1" }));
    const hash = inserted(db.calls).ip_hash as string;
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    const lock = db.calls.find(call => call.text.includes("pg_advisory_xact_lock"))!;
    expect(lock.values).toEqual([hash]);
    const insert = insertCall(db.calls);
    expect(insert.values.slice(-2)).toEqual([hash, 6]);
    expect(JSON.stringify(db.calls)).not.toContain("1.2.3.4");

    db.calls.length = 0;
    await POST(post(payload, { "x-forwarded-for": "1.2.3.4" }));
    expect(inserted(db.calls).ip_hash).toBe(hash);
    db.calls.length = 0;
    await POST(post(payload, { "x-forwarded-for": "5.6.7.8" }));
    expect(inserted(db.calls).ip_hash).not.toBe(hash);
  });

  it("雜湊裡混了 UTC 日期：同一天同一個位址一樣、隔天就對不上（紀錄不能跨天認出同一個人）", async () => {
    const { POST } = await load();
    const hashOf = async () => {
      db.calls.length = 0;
      await POST(post(payload, { "x-forwarded-for": "1.2.3.4" }));
      return inserted(db.calls).ip_hash;
    };
    const today = await hashOf();
    vi.setSystemTime(new Date("2026-10-13T23:59:59.000Z"));
    expect(await hashOf()).toBe(today);
    vi.setSystemTime(new Date("2026-10-14T00:00:01.000Z"));
    const tomorrow = await hashOf();
    expect(tomorrow).not.toBe(today);
    expect(tomorrow).toMatch(/^[0-9a-f]{32}$/);
  });

  it("一分鐘內已經送滿上限：INSERT 沒寫進去（RETURNING 是空的）就回 429；還沒滿就是 200", async () => {
    const { POST } = await load();
    db.reply = text => (text.startsWith("INSERT") ? [] : []);
    const response = await POST(post(payload));
    expect(response.status).toBe(429);
    // 沒寫進去就不給 token（toEqual：多一個欄位都不行）
    expect(await response.json()).toEqual({ ok: false, error: "送太快了，等一下再存" });
    // 兩句都送了（鎖、INSERT），是 INSERT 自己的 WHERE 把它擋掉
    expect(db.calls.filter(call => call.tx === 2).map(call => call.text.split(" ")[0])).toEqual(["SELECT", "INSERT"]);

    db.reply = quiet;
    expect((await POST(post(payload))).status).toBe(200);
  });

  it("同時送 100 個：只有上限那幾個寫得進去，其他都 429（鎖住同一個位址、一個一個排隊算）", async () => {
    const { POST } = await load();
    const rows = simulatedRateLimit();
    const responses = await Promise.all(Array.from({ length: 100 }, () => POST(post(payload, { "x-forwarded-for": "1.2.3.4" }))));
    const statuses = responses.map(response => response.status);
    expect(statuses.filter(status => status === 200)).toHaveLength(6);
    expect(statuses.filter(status => status === 429)).toHaveLength(94);
    expect(rows).toHaveLength(6);
    // 100 個一個一個排隊、每個讓出 1ms：Windows 的計時器一格十幾 ms，整套測試一起跑時會超過預設的 5 秒；
    // 超時被砍掉的話還沒跑完的請求會漏進下一個測試（下一個就跟著錯），所以放寬到 30 秒
  }, 30_000);

  it("不同位址同時送互不影響：各自都有自己的 6 次", async () => {
    const { POST } = await load();
    const rows = simulatedRateLimit();
    const responses = await Promise.all(["1.1.1.1", "2.2.2.2"].flatMap(ip => Array.from({ length: 10 }, () => POST(post(payload, { "x-forwarded-for": ip })))));
    expect(responses.filter(response => response.status === 200)).toHaveLength(12);
    expect(rows).toHaveLength(12);
  }, 30_000);

  it("資料庫出錯：回 500 加中文原因（不漏錯誤內容）、不是一頁空白", async () => {
    const { POST } = await load();
    db.reply = () => new Error("password authentication failed for user neondb_owner");
    const response = await POST(post(payload));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: false, error: "排行暫時連不上，等一下再存" });
    expect(text).not.toContain("neondb_owner");
    expect(console.error).toHaveBeenCalled();
  });

  it("存一筆、看排行送出去的 SQL 沒有 DELETE／UPDATE／DROP／TRUNCATE；ALTER 只有建表時補欄位那四句", async () => {
    const { POST, GET } = await load();
    await POST(post(payload));
    await GET(get("?map=105040303"));
    expect(db.calls.length).toBeGreaterThan(3);
    const allowed = [
      "ALTER TABLE speed_runs ALTER COLUMN char_id DROP NOT NULL",
      "ALTER TABLE speed_runs ADD COLUMN IF NOT EXISTS coupon_mult real",
      "ALTER TABLE speed_runs ADD COLUMN IF NOT EXISTS coupon_min integer",
      "ALTER TABLE speed_runs ADD COLUMN IF NOT EXISTS edit_hash text",
    ];
    for (const call of db.calls) {
      if (allowed.includes(call.text)) continue;
      expect(call.text).not.toMatch(/\b(DELETE|UPDATE|DROP|TRUNCATE|ALTER)\b/i);
    }
  });
});

describe("資料庫（假的）：排行", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://fake";
  });

  const soloRaw = (patch: Record<string, unknown> = {}) => ({
    char_id: "芙莉蓮熊芙莉", job: 220, level: 46, party_size: 1, exp_per_10min: "100000", kills_per_10min: 1049.6, duration_sec: 905,
    created_at: new Date("2026-10-13T10:00:00.000Z"), best_public: true, latest_public: true, ...patch,
  });
  const partyRaw = (patch: Record<string, unknown> = {}) => ({ ...soloRaw(), party_size: 3, kills_per_10min: 1866.6, ...patch });

  it("單練、組隊各一份；成績整理成頁面要的樣子", async () => {
    const { GET } = await load();
    db.reply = text => {
      if (text.includes("party_size = 1")) return [soloRaw(), soloRaw({ char_id: "小明", latest_public: false, job: null, exp_per_10min: 90000, kills_per_10min: null, duration_sec: 600 })];
      if (text.includes("party_size > 1")) return [partyRaw()];
      return [];
    };
    const response = await GET(get("?map=105040303"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { open: boolean; solo: BoardRow[]; party: BoardRow[] };
    expect(body.open).toBe(true);
    expect(body.solo).toEqual([
      { name: "芙莉蓮熊芙莉", job: 220, level: 46, expPer10: 100000, minutes: 15, date: "2026-10-13", partySize: 1, kills: 1049.6 },
      { name: null, job: null, level: 46, expPer10: 90000, minutes: 10, date: "2026-10-13", partySize: 1, kills: null },
    ]);
    expect(body.party).toEqual([{ name: "芙莉蓮熊芙莉", job: 220, level: 46, expPer10: 100000, minutes: 15, date: "2026-10-13", partySize: 3, kills: 1866.6 }]);
  });

  // 掛名要「上榜那一筆」跟「這個角色最新的一筆」都勾公開（10/13 使用者選 B）：
  // 沒有登入，任何人都能用別人的角色 ID 送一筆；這樣別人只能把你藏起來、不能幫你翻開
  it.each([
    ["(a) 上榜那筆公開、最新一筆也公開：顯示名字", true, true, "芙莉蓮熊芙莉"],
    ["(b) 上榜那筆不公開、最新一筆公開（有人用這個 ID 另外送了一筆公開的）：匿名", false, true, null],
    ["(c) 上榜那筆公開、最新一筆不公開（本人或別人後來藏起來）：匿名", true, false, null],
    ["(d) 兩筆都不公開：匿名", false, false, null],
  ])("掛名：%s", async (_label, bestPublic, latestPublic, expectedName) => {
    const { GET } = await load();
    db.reply = text => {
      if (text.includes("party_size = 1")) return [soloRaw({ best_public: bestPublic, latest_public: latestPublic })];
      if (text.includes("party_size > 1")) return [partyRaw({ best_public: bestPublic, latest_public: latestPublic })];
      return [];
    };
    const body = (await (await GET(get("?map=105040303"))).json()) as { solo: BoardRow[]; party: BoardRow[] };
    expect(body.solo.map(row => row.name)).toEqual([expectedName]);
    expect(body.party.map(row => row.name)).toEqual([expectedName]);
    // 匿名只是不給名字，成績本身照給
    expect(body.solo[0]).toMatchObject({ level: 46, expPer10: 100000, partySize: 1 });
    expect(body.party[0]).toMatchObject({ level: 46, kills: 1866.6, partySize: 3 });
  });

  it("兩種旗標都從資料庫的同一批資料帶出來：上榜那筆的 is_public、最新一筆的 is_public", async () => {
    const { GET } = await load();
    await GET(get("?map=105040303"));
    const queries = db.calls.filter(call => call.text.startsWith("WITH"));
    expect(queries).toHaveLength(2);
    for (const query of queries) {
      // best 那一層把上榜那筆的 is_public 選出來（改名 best_public，跟最新一筆的分開）
      expect(query.text).toMatch(/SELECT DISTINCT ON \(COALESCE\(char_id, 'ip:' \|\| ip_hash\)\) id, char_id, is_public AS best_public, /);
      // latest 那一層是每個前 10 名角色最新的一筆（created_at DESC, id DESC 取第一筆）
      // 沒填 ID 的不查最新一筆（沒有 ID 認不出是誰），LEFT JOIN 讓它們照樣留在榜上
      expect(query.text).toMatch(/latest AS \( SELECT DISTINCT ON \(char_id\) char_id, is_public FROM speed_runs WHERE env = \? AND char_id IN \(SELECT char_id FROM leaders WHERE char_id IS NOT NULL\) ORDER BY char_id, created_at DESC, id DESC \)/);
      expect(query.text).toContain("SELECT leaders.*, latest.is_public AS latest_public FROM leaders LEFT JOIN latest USING (char_id)");
      // 不再有單看最新一筆的 show
      expect(query.text).not.toContain("AS show");
    }
  });

  it("沒填角色 ID 的也上榜：名字一律 null（就算那筆勾了公開），成績照給", async () => {
    const { GET } = await load();
    db.reply = text => {
      if (text.includes("party_size = 1")) return [soloRaw({ char_id: null, best_public: true, latest_public: null }), soloRaw({ exp_per_10min: "90000" })];
      if (text.includes("party_size > 1")) return [partyRaw({ char_id: null, best_public: true, latest_public: null })];
      return [];
    };
    const body = (await (await GET(get("?map=105040303"))).json()) as { solo: BoardRow[]; party: BoardRow[] };
    expect(body.solo).toEqual([
      { name: null, job: 220, level: 46, expPer10: 100000, minutes: 15, date: "2026-10-13", partySize: 1, kills: 1049.6 },
      { name: "芙莉蓮熊芙莉", job: 220, level: 46, expPer10: 90000, minutes: 15, date: "2026-10-13", partySize: 1, kills: 1049.6 },
    ]);
    expect(body.party).toEqual([{ name: null, job: 220, level: 46, expPer10: 100000, minutes: 15, date: "2026-10-13", partySize: 3, kills: 1866.6 }]);
  });

  it("沒 ID 的用網路位址雜湊分組（雜湊每天換：同一個位址同一天只留最好一筆）；位址雜湊不選出來、不會送到頁面", async () => {
    const { GET } = await load();
    await GET(get("?map=105040303"));
    const queries = db.calls.filter(call => call.text.startsWith("WITH"));
    expect(queries).toHaveLength(2);
    for (const query of queries) {
      const best = /best AS \( SELECT DISTINCT ON \(COALESCE\(char_id, 'ip:' \|\| ip_hash\)\) (.*?) FROM speed_runs/.exec(query.text);
      expect(best).not.toBeNull();
      expect(best![1]).not.toContain("ip_hash");
      // 角色 ID 最多 12 個字，「ip:」加 32 個字的雜湊不可能跟真的 ID 撞在一起
      expect(query.text).toContain("'ip:' || ip_hash");
    }
  });

  it("日期用台灣時間算（半夜打的不會算成前一天）；資料庫給字串也行", async () => {
    const { GET } = await load();
    db.reply = text => (text.includes("party_size = 1") ? [soloRaw({ created_at: "2026-10-13T17:30:00.000Z" }), soloRaw({ created_at: new Date("2026-10-13T15:59:59.000Z") })] : []);
    const body = (await (await GET(get("?map=105040303"))).json()) as { solo: BoardRow[] };
    expect(body.solo.map(row => row.date)).toEqual(["2026-10-14", "2026-10-13"]);
  });

  it("單練照 10 分鐘經驗排；組隊只收有算出打幾隻的、照打幾隻排；都是每個角色留最好的一筆、前 10", async () => {
    const { GET } = await load();
    await GET(get("?map=105040303"));
    const queries = db.calls.filter(call => call.text.includes("FROM speed_runs") && !call.text.startsWith("CREATE"));
    expect(queries).toHaveLength(2);
    const solo = queries.find(call => call.text.includes("party_size = 1"))!;
    const party = queries.find(call => call.text.includes("party_size > 1"))!;
    expect(solo.text).toContain("DISTINCT ON (COALESCE(char_id, 'ip:' || ip_hash))");
    expect(solo.text).toMatch(/ORDER BY COALESCE\(char_id, 'ip:' \|\| ip_hash\), exp_per_10min DESC/);
    expect(solo.text).toMatch(/LIMIT 10/);
    expect(solo.text).not.toContain("kills_per_10min IS NOT NULL");
    expect(party.text).toContain("kills_per_10min IS NOT NULL");
    expect(party.text).toContain("DISTINCT ON (COALESCE(char_id, 'ip:' || ip_hash))");
    expect(party.text).toMatch(/ORDER BY COALESCE\(char_id, 'ip:' \|\| ip_hash\), kills_per_10min DESC/);
    expect(party.text).toMatch(/ORDER BY (leaders\.)?kills_per_10min DESC/);
    expect(party.text).toMatch(/LIMIT 10/);
    // 同分時要有固定的先後（第 10 名的切線不能每次不一樣）：看誰先達成、再看 id；公開與否取最新一筆時同時間也看 id
    expect(solo.text).toContain("ORDER BY COALESCE(char_id, 'ip:' || ip_hash), exp_per_10min DESC, created_at, id");
    expect(solo.text).toContain("ORDER BY exp_per_10min DESC, created_at, id LIMIT 10");
    expect(party.text).toContain("ORDER BY COALESCE(char_id, 'ip:' || ip_hash), kills_per_10min DESC, created_at, id");
    expect(party.text).toContain("ORDER BY kills_per_10min DESC, created_at, id LIMIT 10");
    for (const query of [solo, party]) {
      expect(query.text).toContain("ORDER BY char_id, created_at DESC, id DESC");
      expect(query.text).toMatch(/ORDER BY leaders\.(exp|kills)_per_10min DESC, leaders\.created_at, leaders\.id$/);
    }
    for (const query of [solo, party]) {
      expect(query.text).toContain("ranked");
      expect(query.text).toContain("is_public");
      // 環境、地圖當參數丟進去（不是接在字串裡）
      expect(query.values).toContain("development");
      expect(query.values).toContain(105040303);
    }
  });

  it("結果快取 5 分鐘；環境名稱照 VERCEL_ENV", async () => {
    process.env.VERCEL_ENV = "production";
    const { GET } = await load();
    const response = await GET(get("?map=105040303"));
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=60");
    const queries = db.calls.filter(call => call.text.startsWith("WITH"));
    expect(queries.length).toBe(2);
    for (const query of queries) expect(query.values).toContain("production");
  });

  it("沒有練功資料的圖（永遠進不了排行）：不查資料庫，直接回空的排行", async () => {
    const { GET } = await load();
    expect(training.some(item => item.m === 999_999_999)).toBe(false);
    const response = await GET(get("?map=999999999"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ open: true, solo: [], party: [] });
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=60");
    expect(db.calls).toHaveLength(0);
  });

  it("存成功後頁面加的 v=（跳過快取）不影響查詢：只看 map", async () => {
    const { GET } = await load();
    const response = await GET(get("?map=105040303&v=1760349600000&other=x"));
    expect(response.status).toBe(200);
    const queries = db.calls.filter(call => call.text.startsWith("WITH"));
    expect(queries).toHaveLength(2);
    for (const query of queries) {
      expect(query.values).toContain(105040303);
      expect(query.values).not.toContain(1760349600000);
      expect(query.values).not.toContain("1760349600000");
    }
  });

  it("資料庫出錯：回 503、排行當沒開、不快取", async () => {
    const { GET } = await load();
    db.reply = () => new Error("timeout");
    const response = await GET(get("?map=105040303"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ open: false, solo: [], party: [] });
    expect(response.headers.get("cache-control") ?? "").not.toContain("s-maxage");
    expect(console.error).toHaveBeenCalled();
  });
});

describe("資料庫（假的）：補填加倍券（PATCH）", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://fake";
  });

  const TOKEN = "0123456789abcdef0123456789abcdef";
  /** 資料庫裡那一筆（照 Neon 回的樣子：bigint 是字串、陣列是陣列） */
  const stored = (patch: Record<string, unknown> = {}) => ({
    map_id: MAP, map_name: "森林迷宮III", level: 46, job: 220, char_id: "芙莉蓮熊芙莉", is_public: true, party_levels: [], party_hitter: 0, mode: "auto",
    started_at: new Date("2026-10-13T10:00:00.000Z"), duration_sec: 900, exp_gained: "150000", level_ups: 0, deaths: 0, client_ver: "v0.95", ...patch,
  });
  const body = (patch: Record<string, unknown> = {}) => ({ id: "7", token: TOKEN, coupon: { mult: 1.5, minutes: 15 }, ...patch });

  /** 找那一筆回 row（沒給就是找不到），UPDATE 回改到的那一筆 */
  function reply(row: Record<string, unknown> | null = stored(), updated: unknown[] = [{ id: "7" }]) {
    db.reply = text => {
      if (text.startsWith("SELECT") && text.includes("edit_hash")) return row ? [row] : [];
      if (text.startsWith("UPDATE")) return updated;
      return [];
    };
  }
  const selectCall = () => db.calls.find(call => call.text.startsWith("SELECT") && call.text.includes("edit_hash"));
  const updateCall = () => db.calls.find(call => call.text.startsWith("UPDATE"));
  /** UPDATE 那句：SET 的欄位跟參數一一對起來 */
  function updated(): Record<string, unknown> {
    const call = updateCall();
    if (!call) throw new Error("沒有送出 UPDATE");
    const columns = /SET (.*) WHERE/.exec(call.text)![1].split(",").map(item => item.trim().split(" ")[0]);
    return Object.fromEntries(columns.map((name, index) => [name, call.values[index]]));
  }

  it("有開：先找那一筆（同環境、id、token 的雜湊、一天內），再只改加倍券跟回推出來的欄位", async () => {
    const { PATCH } = await load();
    reply();
    const response = await PATCH(patch(body()));
    expect(response.status).toBe(200);
    const expected = expectedRow(payload, { mult: 1.5, minutes: 15 });
    expect(expected.expPer10).toBe(66_667);
    expect(await response.json()).toEqual({ ok: true, ranked: true, expPer10: 66_667 });

    const select = selectCall()!;
    expect(select.text).toMatch(/FROM speed_runs WHERE env = \? AND id = \?::bigint AND edit_hash = \? AND created_at > now\(\) - interval '1 day'$/);
    expect(select.values).toEqual(["development", "7", sha256(TOKEN)]);

    const update = updateCall()!;
    expect(update.text).toBe("UPDATE speed_runs SET coupon_mult = ?::real, coupon_min = ?::integer, exp_per_10min = ?::bigint, kills_per_10min = ?::real, ranked = ?::boolean WHERE id = ?::bigint AND edit_hash = ? RETURNING id");
    expect(updated()).toEqual({ coupon_mult: 1.5, coupon_min: 15, exp_per_10min: 66_667, kills_per_10min: expected.killsPer10, ranked: true });
    expect(update.values.slice(-2)).toEqual(["7", sha256(TOKEN)]);
    expect(typeof expected.killsPer10).toBe("number");
    // 原始 token 不進資料庫
    expect(JSON.stringify(db.calls)).not.toContain(TOKEN);
  });

  it("改成沒開（null）：倍率、分鐘清空，速度回到原始的", async () => {
    const { PATCH } = await load();
    reply();
    const response = await PATCH(patch(body({ coupon: null })));
    expect(await response.json()).toEqual({ ok: true, ranked: true, expPer10: 100_000 });
    expect(updated()).toMatchObject({ coupon_mult: null, coupon_min: null, exp_per_10min: 100_000, ranked: true });
  });

  it("倍率四捨五入到兩位小數再存；只開其中幾分鐘照比例回推", async () => {
    const { PATCH } = await load();
    reply();
    const response = await PATCH(patch(body({ coupon: { mult: 1.4999999, minutes: 10 } })));
    expect(await response.json()).toEqual({ ok: true, ranked: true, expPer10: 75_000 });
    expect(updated()).toMatchObject({ coupon_mult: 1.5, coupon_min: 10, exp_per_10min: 75_000 });
  });

  it("組隊：全隊打幾隻用回推後的速度重算", async () => {
    const { PATCH } = await load();
    reply(stored({ party_levels: [44, 47], party_hitter: 2 }));
    await PATCH(patch(body({ coupon: { mult: 2, minutes: 15 } })));
    const party: RunPayload = { ...payload, partyLevels: [44, 47], partyHitter: 2 };
    const expected = expectedRow(party, { mult: 2, minutes: 15 });
    expect(expected.killsPer10).toBeLessThan(expectedRow(party).killsPer10!);
    expect(updated()).toMatchObject({ kills_per_10min: expected.killsPer10, exp_per_10min: expected.expPer10, ranked: expected.ranked });
  });

  it("原始速度超過這張圖的上限：開了加倍券回推後變低，一樣不進排行", async () => {
    const { PATCH } = await load();
    reply(stored({ exp_gained: "50000000" }));
    const response = await PATCH(patch(body({ coupon: { mult: 3, minutes: 15 } })));
    expect(await response.json()).toMatchObject({ ok: true, ranked: false });
    expect(updated().ranked).toBe(false);
  });

  it("資料庫給的開始時間是字串、client_ver 是 null 也算得出來", async () => {
    const { PATCH } = await load();
    reply(stored({ started_at: "2026-10-13T10:00:00.000Z", client_ver: null }));
    expect((await PATCH(patch(body()))).status).toBe(200);
  });

  it("找不到（id 或 token 不對、別的環境、超過一天）回 404，不送 UPDATE", async () => {
    const { PATCH } = await load();
    reply(null);
    const response = await PATCH(patch(body()));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "找不到這筆紀錄（超過一天就不能改了）" });
    expect(updateCall()).toBeUndefined();
  });

  it("UPDATE 沒改到（找到之後剛好不見）也回 404", async () => {
    const { PATCH } = await load();
    reply(stored(), []);
    const response = await PATCH(patch(body()));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "找不到這筆紀錄（超過一天就不能改了）" });
  });

  it("環境名稱照 VERCEL_ENV：只改得到同一個環境的", async () => {
    process.env.VERCEL_ENV = "preview";
    const { PATCH } = await load();
    reply();
    await PATCH(patch(body()));
    expect(selectCall()!.values[0]).toBe("preview");
  });

  it.each([
    [{ coupon: { mult: 5, minutes: 10 } }, "倍率要 1.10～3.00"],
    [{ coupon: { mult: 1.5, minutes: 16 } }, "加倍的分鐘數不對"],
    [{ coupon: { mult: 1.5, minutes: 0 } }, "加倍的分鐘數不對"],
    [{ coupon: undefined }, "加倍券格式不對"],
    [{ coupon: "1.5" }, "加倍券格式不對"],
  ])("加倍券不合規則 %o 回 400（%s），不送 UPDATE", async (patchBody, error) => {
    const { PATCH } = await load();
    reply();
    const response = await PATCH(patch(body(patchBody)));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error });
    expect(updateCall()).toBeUndefined();
  });

  it.each([
    ["數字", 7],
    ["0", "0"],
    ["負數", "-1"],
    ["小數", "1.5"],
    ["前面補 0", "07"],
    ["有空白", " 7"],
    ["不是數字", "abc"],
    ["空字串", ""],
    ["超過 bigint", "9223372036854775808"],
    ["太長", "1".repeat(30)],
    ["沒給", undefined],
  ])("id 不對（%s）回 400、不碰資料庫", async (_name, id) => {
    const { PATCH } = await load();
    const response = await PATCH(patch(body({ id })));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "格式不對" });
    expect(db.calls).toHaveLength(0);
  });

  it("id 剛好是 bigint 最大值還收", async () => {
    const { PATCH } = await load();
    reply();
    await PATCH(patch(body({ id: "9223372036854775807" })));
    expect(selectCall()!.values[1]).toBe("9223372036854775807");
  });

  it.each([
    ["31 個字", TOKEN.slice(1)],
    ["33 個字", `${TOKEN}0`],
    ["不是 16 進位", "g".repeat(32)],
    ["有空白", ` ${TOKEN.slice(1)}`],
    ["數字", 12345],
    ["沒給", undefined],
  ])("token 不對（%s）回 400、不碰資料庫", async (_name, token) => {
    const { PATCH } = await load();
    const response = await PATCH(patch(body({ token })));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "格式不對" });
    expect(db.calls).toHaveLength(0);
  });

  it("token 大寫也認（照小寫算雜湊）", async () => {
    const { PATCH } = await load();
    reply();
    await PATCH(patch(body({ token: TOKEN.toUpperCase() })));
    expect(selectCall()!.values[2]).toBe(sha256(TOKEN));
  });

  it.each([
    ["text/plain;charset=UTF-8", JSON.stringify(body())],
    ["application/json", "不是 JSON"],
    ["application/json", "null"],
    ["application/json", "[1]"],
  ])("Content-Type「%s」、內容 %s：回 400 格式不對、不碰資料庫", async (contentType, raw) => {
    const { PATCH } = await load();
    const response = await PATCH(new Request("http://x/api/speed/runs", { method: "PATCH", body: raw, headers: { "content-type": contentType } }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "格式不對" });
    expect(db.calls).toHaveLength(0);
  });

  it("資料庫出錯：回 500 加中文原因（不漏錯誤內容）", async () => {
    const { PATCH } = await load();
    db.reply = () => new Error("password authentication failed for user neondb_owner");
    const response = await PATCH(patch(body()));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: false, error: "排行暫時連不上，等一下再存" });
    expect(text).not.toContain("neondb_owner");
    expect(console.error).toHaveBeenCalled();
  });

  it("從存一筆拿到的 id、token 改得到同一筆（token 的雜湊就是存進去的 edit_hash）", async () => {
    const { POST, PATCH } = await load();
    const saved = (await (await POST(post(payload))).json()) as { id: string; token: string };
    const editHash = inserted(db.calls).edit_hash;
    db.calls.length = 0;
    db.reply = (text, values) => {
      if (text.startsWith("SELECT") && text.includes("edit_hash")) return values[1] === saved.id && values[2] === editHash ? [stored()] : [];
      if (text.startsWith("UPDATE")) return values[values.length - 2] === saved.id && values[values.length - 1] === editHash ? [{ id: saved.id }] : [];
      return [];
    };
    const ok = await PATCH(patch({ id: saved.id, token: saved.token, coupon: { mult: 2, minutes: 15 } }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, ranked: true, expPer10: 50_000 });
    // 別的 token 改不到
    const wrong = await PATCH(patch({ id: saved.id, token: "f".repeat(32), coupon: null }));
    expect(wrong.status).toBe(404);
  });

  it("送出去的 SQL 沒有 DELETE／DROP／TRUNCATE；UPDATE 只有改加倍券那一句、只改那五欄", async () => {
    const { PATCH } = await load();
    reply();
    await PATCH(patch(body()));
    const updates = db.calls.filter(call => /\bUPDATE\b/i.test(call.text));
    expect(updates).toHaveLength(1);
    expect(Object.keys(updated())).toEqual(["coupon_mult", "coupon_min", "exp_per_10min", "kills_per_10min", "ranked"]);
    for (const call of db.calls) {
      if (call.text.startsWith("ALTER TABLE speed_runs")) continue;
      expect(call.text).not.toMatch(/\b(DELETE|DROP|TRUNCATE)\b/i);
    }
  });
});
