// 台服經典版客戶端（Unity）資料抽取，用法見 README「客戶端技能數值」；2026-10-08 抽衝鋒 5001005 每一級數值用（data/client/skills.json）
// 解 MapleStory Classic（Unity）客戶端的 WZJS 二進位樹（json_* bundle 裡 MonoBehaviour 的 body）
// 用法：node wzjs.mjs <raw.bin（decomp.mjs 解出來的）> <物件名，例 200> [路徑前綴，例 skill/2000000]
//   印出該子樹的 JSON。型別：2=目錄 6=int 11=string 14=vector(float32 x,y) 18=canvas（其他型別原樣標 ?type）
import fs from "node:fs";
import { listObjects } from "./listobj.mjs";

export function decodeBody(b) {
  const H = []; for (let i = 0; i < 36; i++) H.push(b.readInt32LE(i * 4));
  const blobLen = H[35];
  const B = b.subarray(36 * 4); // 35 個 header int + byte[] 長度（H[35]）
  if (B.toString("latin1", 0, 4) !== "WZJS") throw new Error("no WZJS magic");
  if (B.length !== blobLen) throw new Error(`blob len ${B.length} != ${blobLen}`);
  const strTable = (blob, offs, n) => { const s = []; for (let i = 0; i < n; i++) s.push(B.toString("utf8", blob + B.readInt32LE(offs + i * 4), blob + B.readInt32LE(offs + i * 4 + 4))); return s; };
  const names = strTable(H[27], H[28], H[26]);
  const valStrs = strTable(H[33], H[34], H[32]);
  const N = H[0], nodeOff = H[1];
  const node = i => { const r = []; for (let k = 0; k < 8; k++) r.push(B.readInt32LE(nodeOff + i * 32 + k * 4)); return r; };
  const intOff = H[9], intCnt = H[10], vecOff = H[15], vecCnt = H[16];
  const build = i => {
    const [type, nameIdx, valIdx, first, count] = node(i);
    const name = names[nameIdx];
    if (type === 2 || type === 18) {
      const o = {}; if (type === 18) o["$canvas"] = true;
      for (let c = first; c < first + count && first >= 0; c++) { const [k, v] = build(c); o[k] = v; }
      return [name, o];
    }
    if (type === 6) { if (valIdx >= intCnt) throw new Error("int idx"); return [name, B.readInt32LE(intOff + valIdx * 4)]; }
    if (type === 14) { if (valIdx >= vecCnt) throw new Error("vec idx"); return [name, { x: B.readFloatLE(vecOff + valIdx * 8), y: B.readFloatLE(vecOff + valIdx * 8 + 4) }]; } // vector 存 float32
    if (type === 11) return [name, valStrs[valIdx]];
    return [name, { "?type": type, raw: node(i) }];
  };
  return { header: H, root: build(0) };
}

if (process.argv[1].endsWith("wzjs.mjs")) {
  const [, , raw, objName, prefix] = process.argv;
  const data = fs.readFileSync(raw);
  for (const o of listObjects(data).objs.filter(o => o.name === objName)) {
    const { root } = decodeBody(data.subarray(o.body, o.off + o.size));
    let t = root[1];
    if (prefix) for (const seg of prefix.split("/")) t = t?.[seg];
    console.log(`// object ${o.name} pathID ${o.pathID}`);
    console.log(JSON.stringify(t, null, 1));
  }
}
