/**
 * 未來視（/future）的材料清單。
 *
 * 用法：npm run data:future（要在 build.mjs 之後，data-refresh 也跑這支）
 *
 * 輸入：
 *   data/raw/artale.json                     上游配方（sources.crafts）
 *   public/data/{items,monsters}.json        站上已開放的怪、店
 *   data/future/fourth-job-snapshot.json     四轉任務線（1.15.2 快照，pipeline/snapshot-fourth-job.mjs）
 * 輸出：
 *   public/data/future.json                  頁面建置時讀（瀏覽器不直接抓這個檔）
 */
import fs from "node:fs";
import path from "node:path";
import { closedCraftMaterials, fourthJobNeeds } from "./lib/future.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const readJson = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));

const raw = readJson("data/raw/artale.json");
const items = readJson("public/data/items.json");
const monsters = readJson("public/data/monsters.json");
const snapshot = readJson("data/future/fourth-job-snapshot.json");

const crafts = closedCraftMaterials(raw.items, items, monsters);
const fourthJob = fourthJobNeeds(snapshot.quests, items, monsters, raw.items);
if (!crafts.now.length || !Object.keys(fourthJob).length) throw new Error("未來視材料是空的，上游配方或快照格式可能改了");

const out = { gameVersion: raw.metadata?.gameVersion ?? null, snapshotVersion: snapshot.gameVersion, crafts, fourthJob };
fs.writeFileSync(path.join(ROOT, "public", "data", "future.json"), JSON.stringify(out) + "\n");
console.log(`[future] 製作材料 ${crafts.now.length} 種現在拿得到、${crafts.notNow.length} 種要等開放；四轉 ${Object.keys(fourthJob).length} 個職業`);
