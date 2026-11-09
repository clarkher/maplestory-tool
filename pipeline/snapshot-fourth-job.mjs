/**
 * 把舊客戶端的四轉任務線存成快照 data/future/fourth-job-snapshot.json，給未來視用。
 *
 * 用法：node pipeline/snapshot-fourth-job.mjs <1.15.2 的 artale.json>
 *
 * 為什麼是快照：1.15.2（2026-09-24）客戶端還有這批任務，2.0.0（10/15）拿掉了，之後重抓也拿不回來。
 * 哪天客戶端又放回四轉任務，改用新的任務表重跑這支，畫面上「上個客戶端」的字樣也要跟著改。
 */
import fs from "node:fs";
import path from "node:path";
import { snapshotFourthJob } from "./lib/future.mjs";

const source = process.argv[2];
if (!source) throw new Error("要給 artale.json 的路徑");
const raw = JSON.parse(fs.readFileSync(source, "utf8"));
const out = path.resolve(import.meta.dirname, "..", "data", "future", "fourth-job-snapshot.json");
const quests = snapshotFourthJob(raw.quests);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ gameVersion: raw.metadata?.gameVersion ?? null, quests }, null, 1) + "\n");
console.log(`[fourth-job] 遊戲版本 ${raw.metadata?.gameVersion}，${quests.length} 個任務 → ${path.relative(process.cwd(), out)}`);
