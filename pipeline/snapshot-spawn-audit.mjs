/**
 * 把現在的出怪存成快照 data/guides/spawn-audit.json，給 guides-research.test.mjs 檢查研究檔用。
 *
 * 用法：npm run data:spawn-audit
 *
 * 為什麼不直接比最新資料：研究檔是人寫的，要在改研究檔的時候抓錯；資料自動更新只動出怪、不動研究檔，
 * 如果測試比最新出怪，改版動到一張圖就會紅、更新 PR 開不出來（data-refresh.yml 測試沒過不開 PR）。
 * 新資料跟研究檔對不上時，build-guides 自動丟掉對不上的怪並寫進 Actions 摘要；人對過研究檔之後再重跑這支。
 */
import fs from "node:fs";
import path from "node:path";
import { spawnTable } from "./lib/guides.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const readData = name => JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", name), "utf8"));

const meta = readData("meta.json");
const table = spawnTable(readData("maps.json"), readData("monsters.json"));
const out = path.join(ROOT, "data", "guides", "spawn-audit.json");
fs.writeFileSync(out, JSON.stringify({ gameVersion: meta.gameVersion, ...table }) + "\n");
console.log(`[spawn-audit] ${Object.keys(table.maps).length} 張圖、${Object.keys(table.mobs).length} 隻怪（遊戲版本 ${meta.gameVersion ?? "?"}）→ ${path.relative(process.cwd(), out)}`);
