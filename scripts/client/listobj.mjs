// 台服經典版客戶端（Unity）資料抽取，用法見 README「客戶端技能數值」；2026-10-08 抽衝鋒 5001005 每一級數值用（data/client/skills.json）
// 列出 SerializedFile (v22) 內所有物件：pathID、型別、位移、大小、m_Name（MonoBehaviour / TextAsset）
// 用法：node listobj.mjs <raw.bin> [過濾字串]
import fs from "node:fs";
export function listObjects(data) {
  let p = 0x30;
  const end0 = data.indexOf(0, p); const unityVer = data.toString("utf8", p, end0); p = end0 + 1;
  const dataOffset = Number(data.readBigUInt64BE(0x20));
  const platform = data.readInt32LE(p); p += 4;
  const typeTree = data[p]; p += 1;
  const typeCount = data.readInt32LE(p); p += 4;
  const types = [];
  for (let i = 0; i < typeCount; i++) {
    const classID = data.readInt32LE(p); p += 4;
    const stripped = data[p]; p += 1;
    const scriptIdx = data.readInt16LE(p); p += 2;
    if (classID === 114) p += 16;
    p += 16;
    if (typeTree) throw new Error("typetree not handled");
    types.push({ classID, scriptIdx });
  }
  const objCount = data.readInt32LE(p); p += 4;
  const objs = [];
  for (let i = 0; i < objCount; i++) {
    p = (p + 3) & ~3;
    const pathID = data.readBigInt64LE(p); p += 8;
    const start = Number(data.readBigInt64LE(p)); p += 8;
    const size = data.readUInt32LE(p); p += 4;
    const typeID = data.readInt32LE(p); p += 4;
    const o = { pathID: String(pathID), off: dataOffset + start, size, classID: types[typeID]?.classID };
    // name
    let q = o.off;
    if (o.classID === 114) q += 12 + 4 + 12; // m_GameObject, m_Enabled(+align), m_Script
    const nl = data.readInt32LE(q);
    if (nl >= 0 && nl < 1000) { o.name = data.toString("utf8", q + 4, q + 4 + nl); o.body = (q + 4 + nl + 3) & ~3; }
    objs.push(o);
  }
  return { unityVer, platform, typeCount, types, objs };
}
if (process.argv[1].endsWith("listobj.mjs")) {
  const data = fs.readFileSync(process.argv[2]);
  const r = listObjects(data);
  console.log(r.unityVer, "platform", r.platform, "types", JSON.stringify(r.types), "objects", r.objs.length);
  const filt = process.argv[3];
  for (const o of r.objs) if (!filt || (o.name || "").includes(filt)) console.log(o.pathID, o.classID, o.off, o.size, o.name);
}
