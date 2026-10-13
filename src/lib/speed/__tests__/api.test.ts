// src/lib/speed/__tests__/api.test.ts
// 資料庫換成假的（記下送出去的每一句 SQL 跟參數），不連真的 Neon。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Monster, TrainingRow } from "@/lib/types";
import monsterJson from "../../../../public/data/monsters.json";
import trainingJson from "../../../../public/data/training.json";
import { mapCap, toRow, type BoardRow, type RunPayload } from "../server/rules";

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
  return { POST: runs.POST, GET: board.GET, ...dbModule };
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
    expect(db.calls.slice(1).map(call => call.text).every(text => text.startsWith("CREATE INDEX IF NOT EXISTS"))).toBe(true);
  });

  it("一張表加三個索引放在同一個 transaction 送（一次來回、要嘛全成要嘛全不成）", async () => {
    const { ensureSchema, getSql } = await load();
    await ensureSchema(getSql()!);
    expect(db.calls).toHaveLength(4);
    expect(db.txCount).toBe(1);
    expect(db.calls.every(call => call.tx === 1)).toBe(true);
    expect(db.calls.map(call => call.text.split(" ").slice(0, 2).join(" "))).toEqual(["CREATE TABLE", "CREATE INDEX", "CREATE INDEX", "CREATE INDEX"]);
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
    expect(await response.json()).toEqual({ ok: true, ranked: true });
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
    expect(await response.json()).toEqual({ ok: true, ranked: true });
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
    expect(await response.json()).toEqual({ ok: true, ranked: false });
    expect(inserted(db.calls).ranked).toBe(false);
    expect(inserted(db.calls).kills_per_10min).toBeNull();
  });

  it("沒有地圖：照存，但不進排行", async () => {
    const { POST } = await load();
    const response = await POST(post({ ...payload, mapId: null, mapName: null }));
    expect(await response.json()).toEqual({ ok: true, ranked: false });
    const row = inserted(db.calls);
    expect(row).toMatchObject({ map_id: null, map_name: null, ranked: false, kills_per_10min: null });
  });

  it("不到 10 分鐘、或超過這張圖的理論上限：照存，不進排行", async () => {
    const { POST } = await load();
    expect(await (await POST(post({ ...payload, durationSec: 599 }))).json()).toEqual({ ok: true, ranked: false });
    expect(inserted(db.calls).ranked).toBe(false);

    db.calls.length = 0;
    expect(await (await POST(post({ ...payload, expGained: 50_000_000 }))).json()).toEqual({ ok: true, ranked: false });
    expect(inserted(db.calls).ranked).toBe(false);
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
  });

  it("不同位址同時送互不影響：各自都有自己的 6 次", async () => {
    const { POST } = await load();
    const rows = simulatedRateLimit();
    const responses = await Promise.all(["1.1.1.1", "2.2.2.2"].flatMap(ip => Array.from({ length: 10 }, () => POST(post(payload, { "x-forwarded-for": ip })))));
    expect(responses.filter(response => response.status === 200)).toHaveLength(12);
    expect(rows).toHaveLength(12);
  });

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

  it("送出去的 SQL 沒有 DELETE／UPDATE／DROP／TRUNCATE", async () => {
    const { POST, GET } = await load();
    await POST(post(payload));
    await GET(get("?map=105040303"));
    expect(db.calls.length).toBeGreaterThan(3);
    for (const call of db.calls) expect(call.text).not.toMatch(/\b(DELETE|UPDATE|DROP|TRUNCATE|ALTER)\b/i);
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
      expect(query.text).toMatch(/SELECT DISTINCT ON \(char_id\) id, char_id, is_public AS best_public, /);
      // latest 那一層是每個前 10 名角色最新的一筆（created_at DESC, id DESC 取第一筆）
      expect(query.text).toMatch(/latest AS \( SELECT DISTINCT ON \(char_id\) char_id, is_public FROM speed_runs WHERE env = \? AND char_id IN \(SELECT char_id FROM leaders\) ORDER BY char_id, created_at DESC, id DESC \)/);
      expect(query.text).toContain("SELECT leaders.*, latest.is_public AS latest_public FROM leaders JOIN latest USING (char_id)");
      // 不再有單看最新一筆的 show
      expect(query.text).not.toContain("AS show");
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
    expect(solo.text).toContain("DISTINCT ON (char_id)");
    expect(solo.text).toMatch(/ORDER BY char_id, exp_per_10min DESC/);
    expect(solo.text).toMatch(/LIMIT 10/);
    expect(solo.text).not.toContain("kills_per_10min IS NOT NULL");
    expect(party.text).toContain("kills_per_10min IS NOT NULL");
    expect(party.text).toMatch(/ORDER BY char_id, kills_per_10min DESC/);
    expect(party.text).toMatch(/ORDER BY (leaders\.)?kills_per_10min DESC/);
    expect(party.text).toMatch(/LIMIT 10/);
    // 同分時要有固定的先後（第 10 名的切線不能每次不一樣）：看誰先達成、再看 id；公開與否取最新一筆時同時間也看 id
    expect(solo.text).toContain("ORDER BY char_id, exp_per_10min DESC, created_at, id");
    expect(solo.text).toContain("ORDER BY exp_per_10min DESC, created_at, id LIMIT 10");
    expect(party.text).toContain("ORDER BY char_id, kills_per_10min DESC, created_at, id");
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
