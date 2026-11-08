// 台服經典版客戶端（Unity）公會徽章的 WZJS 樹，給 scripts/client/guild-mark.py 列 canvas 路徑用；2026-11-08 v1.81
// 用法：node scripts/client/guild-mark-tree.mjs <GuildMark.wzjson 的 MonoBehaviour 原始資料>
//   原始資料前 44 bytes 是 Unity 物件表頭（名字等），WZJS body 從 44 起。
//   印出 JSON 陣列：每個 canvas 的路徑（不含最上層 GuildMark），例 "BackGround/00001000/1"、"Mark/Animal/00002000/16"。
import fs from "node:fs";
import { decodeBody } from "./wzjs.mjs";

const [, , raw] = process.argv;
if (!raw) throw new Error("用法：node scripts/client/guild-mark-tree.mjs <raw>");
const { root } = decodeBody(fs.readFileSync(raw).subarray(44));
const out = [];
const walk = (o, p) => {
  for (const [k, v] of Object.entries(o)) {
    if (!v || typeof v !== "object") continue;
    const path = p ? `${p}/${k}` : k;
    if (v.$canvas) out.push(path);
    else walk(v, path);
  }
};
walk(root[1], "");
process.stdout.write(JSON.stringify(out));
