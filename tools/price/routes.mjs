// 本機查價頁的 API（server.mjs 只負責接線；這裡可以單獨測）
import fs from "node:fs";
import path from "node:path";
import { SERVER, ALL_ITEMS, EQUIPS } from "./list.mjs";
import { loadData, saveData, confirmTrade, deleteTrade, editTrade } from "./store.mjs";
import { summarize, series, attrKey, MIN_TREND_DAYS } from "./stats.mjs";
import { DONE_DIR } from "./session.mjs";

const PAGE_DIR = path.join(import.meta.dirname, "page");
const STATIC = { "/": ["index.html", "text/html; charset=utf-8"], "/app.js": ["app.js", "text/javascript; charset=utf-8"], "/style.css": ["style.css", "text/css; charset=utf-8"] };

const send = (res, status, body, type = "application/json; charset=utf-8") => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

class BadRequest extends Error {}

const readBody = req => new Promise((resolve, reject) => {
  let s = "";
  req.on("data", c => { s += c; });
  req.on("end", () => {
    try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new BadRequest("送來的資料不是 JSON")); }
  });
  req.on("error", reject);
});

/** 截圖先找 已記價\，找不到再找截圖資料夾根目錄（搬不進已記價的會留在那裡） */
function findShot(shotsDir, file) {
  for (const dir of [path.join(shotsDir, DONE_DIR), shotsDir]) {
    const full = path.join(dir, file);
    try {
      if (fs.statSync(full).isFile()) return full;
    } catch { /* 這個資料夾沒有，找下一個 */ }
  }
  return null;
}

export function createHandler({ session, dataFile, shotsDir, getFx, publish, getWatchError = () => null }) {
  return async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;
    try {
      if (req.method === "GET" && STATIC[p]) {
        const [file, type] = STATIC[p];
        return send(res, 200, fs.readFileSync(path.join(PAGE_DIR, file)), type);
      }
      if (req.method === "GET" && p === "/api/state") {
        const fx = getFx();
        return send(res, 200, {
          server: SERVER, ...session.state(),
          fx: { available: !!fx?.days?.length, updatedAt: fx?.updatedAt ?? null },
          watchError: getWatchError() ?? null,
        });
      }
      if (req.method === "POST" && p === "/api/next") return send(res, 200, { name: session.copyNext() });
      if (req.method === "POST" && p === "/api/current") {
        const { name } = await readBody(req);
        try {
          session.setCurrent(name);
        } catch (e) {
          return send(res, 400, { ok: false, error: e.message });
        }
        return send(res, 200, { ok: true });
      }
      if (req.method === "GET" && p === "/api/summary") {
        const trades = loadData(dataFile).trades;
        const days = getFx()?.days ?? null;
        return send(res, 200, { rows: ALL_ITEMS.map(item => summarize(trades, item, days)) });
      }
      if (req.method === "GET" && p === "/api/item") {
        const name = url.searchParams.get("name");
        const trades = loadData(dataFile).trades;
        const mine = trades.filter(t => t.item === name);
        const keys = EQUIPS.has(name) ? [...new Set(mine.filter(t => t.status === "ok").map(t => attrKey(t.attrs)))].sort() : [null];
        return send(res, 200, {
          summary: summarize(trades, name, getFx()?.days ?? null),
          series: keys.map(key => ({ key, points: series(trades, name, key) })),
          trades: mine.sort((a, b) => b.tradedAt.localeCompare(a.tradedAt)),
          minTrendDays: MIN_TREND_DAYS,
        });
      }
      if (req.method === "GET" && p === "/api/review") {
        return send(res, 200, { trades: loadData(dataFile).trades.filter(t => t.status === "review") });
      }
      if (req.method === "POST" && p === "/api/trade") {
        const { id, action, patch } = await readBody(req);
        const data = loadData(dataFile);
        const ok = action === "confirm" ? confirmTrade(data, id) : action === "delete" ? deleteTrade(data, id) : action === "edit" ? editTrade(data, id, patch ?? {}) : false;
        if (ok) saveData(dataFile, data);
        return send(res, ok ? 200 : 400, { ok });
      }
      if (req.method === "POST" && p === "/api/finish") {
        try { return send(res, 200, await publish()); } catch (e) { return send(res, 500, { error: e.message }); }
      }
      if (req.method === "GET" && p === "/shot") {
        const file = url.searchParams.get("file") ?? "";
        if (!file || file !== path.basename(file) || /[\\/]/.test(file) || file.includes("..")) return send(res, 400, { error: "檔名不對" });
        const full = findShot(shotsDir, file);
        if (!full) return send(res, 404, { error: "找不到這張截圖" });
        return send(res, 200, fs.readFileSync(full), "image/png");
      }
      return send(res, 404, { error: "沒有這個頁面" });
    } catch (e) {
      return send(res, e instanceof BadRequest ? 400 : 500, { error: e.message });
    }
  };
}
