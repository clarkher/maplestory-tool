// src/lib/speed/__tests__/api.test.ts
// 資料庫換成假的（記下送出去的每一句 SQL 跟參數），不連真的 Neon。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Monster, TrainingRow } from "@/lib/types";
import monsterJson from "../../../../public/data/monsters.json";
import trainingJson from "../../../../public/data/training.json";
import { mapCap, toRow, type BoardRow, type RunPayload } from "../server/rules";

type Call = { text: string; values: unknown[] };
const db = vi.hoisted(() => ({
  calls: [] as { text: string; values: unknown[] }[],
  reply: (_text: string, _values: unknown[]): unknown[] | Error => [],
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    db.calls.push({ text, values });
    const result = db.reply(text, values);
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
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
  return new Request("http://x/api/speed/runs", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers });
}

const get = (query: string) => new Request(`http://x/api/speed/board${query}`);

/** 回覆：計次數的那句回 0（沒送過），其他回空 */
function quiet(text: string): unknown[] {
  return text.includes("count(*)") ? [{ count: 0 }] : [];
}

/** INSERT 那句：欄位名跟參數一一對起來，順序排錯就會對不上 */
function inserted(calls: Call[]): Record<string, unknown> {
  const call = calls.find(item => item.text.startsWith("INSERT INTO speed_runs"));
  if (!call) throw new Error("沒有送出 INSERT");
  const columns = /\(([^)]*)\) VALUES/.exec(call.text)![1].split(",").map(name => name.trim());
  expect(call.text.split("VALUES")[1].match(/\?/g)).toHaveLength(columns.length);
  expect(call.values).toHaveLength(columns.length);
  return Object.fromEntries(columns.map((name, index) => [name, call.values[index]]));
}

const savedEnv = { url: process.env.DATABASE_URL, vercel: process.env.VERCEL_ENV };
beforeEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.VERCEL_ENV;
  db.calls.length = 0;
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

  it("同一個執行個體只建一次；失敗了下一次會再試", async () => {
    const { ensureSchema, getSql } = await load();
    await Promise.all([ensureSchema(getSql()!), ensureSchema(getSql()!)]);
    await ensureSchema(getSql()!);
    expect(db.calls.filter(call => call.text.startsWith("CREATE TABLE")).length).toBe(1);

    const again = await load();
    db.calls.length = 0;
    db.reply = () => new Error("連不上");
    await expect(again.ensureSchema(again.getSql()!)).rejects.toThrow("連不上");
    db.reply = quiet;
    await again.ensureSchema(again.getSql()!);
    expect(db.calls.filter(call => call.text.startsWith("CREATE TABLE")).length).toBe(2);
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

  it("欄位不合規則回 400 加原因、不碰資料庫", async () => {
    const { POST } = await load();
    const response = await POST(post({ ...payload, durationSec: 100 }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("時間");
    expect(db.calls).toHaveLength(0);
  });

  it("單練：先建表、再數這個位址這一分鐘送幾次、最後 INSERT；進排行", async () => {
    const { POST } = await load();
    const response = await POST(post(payload, { "x-forwarded-for": "1.2.3.4" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ranked: true });
    const texts = db.calls.map(call => call.text);
    expect(texts[0]).toContain("CREATE TABLE");
    expect(texts.findIndex(text => text.includes("count(*)"))).toBeLessThan(texts.findIndex(text => text.startsWith("INSERT")));

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

  it("網址只存雜湊：取 x-forwarded-for 第一個、數次數跟 INSERT 用同一個值、原始位址不進資料庫", async () => {
    const { POST } = await load();
    await POST(post(payload, { "x-forwarded-for": "1.2.3.4, 10.0.0.1" }));
    const hash = inserted(db.calls).ip_hash as string;
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(db.calls.find(call => call.text.includes("count(*)"))!.values).toEqual([hash]);
    expect(JSON.stringify(db.calls)).not.toContain("1.2.3.4");

    db.calls.length = 0;
    await POST(post(payload, { "x-forwarded-for": "1.2.3.4" }));
    expect(inserted(db.calls).ip_hash).toBe(hash);
    db.calls.length = 0;
    await POST(post(payload, { "x-forwarded-for": "5.6.7.8" }));
    expect(inserted(db.calls).ip_hash).not.toBe(hash);
  });

  it("一分鐘內已經送滿上限回 429、不 INSERT；差一次還可以", async () => {
    const { POST } = await load();
    db.reply = text => (text.includes("count(*)") ? [{ count: 6 }] : []);
    const response = await POST(post(payload));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ ok: false, error: "送太快了，等一下再存" });
    expect(db.calls.some(call => call.text.startsWith("INSERT"))).toBe(false);

    db.reply = text => (text.includes("count(*)") ? [{ count: 5 }] : []);
    expect((await POST(post(payload))).status).toBe(200);
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
    created_at: new Date("2026-10-13T10:00:00.000Z"), show: true, ...patch,
  });
  const partyRaw = (patch: Record<string, unknown> = {}) => ({ ...soloRaw(), party_size: 3, kills_per_10min: 1866.6, ...patch });

  it("單練、組隊各一份；成績整理成頁面要的樣子", async () => {
    const { GET } = await load();
    db.reply = text => {
      if (text.includes("party_size = 1")) return [soloRaw(), soloRaw({ char_id: "小明", show: false, job: null, exp_per_10min: 90000, kills_per_10min: null, duration_sec: 600 })];
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
