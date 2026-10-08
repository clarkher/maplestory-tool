// 台服經典版客戶端（Unity）資料抽取，用法見 README「客戶端技能數值」；2026-10-08 抽衝鋒 5001005 每一級數值用（data/client/skills.json）
// 解開 UnityFS bundle（LZ4/LZ4HC）成原始 SerializedFile 位元組，不搜尋
// 用法：node decomp.mjs <bundle> <out.bin>
import fs from "node:fs";
const [, , bundlePath, outPath] = process.argv;
const buf = fs.readFileSync(bundlePath);
let pos = 0;
const readCString = () => { const end = buf.indexOf(0, pos); const s = buf.toString("utf8", pos, end); pos = end + 1; return s; };
const u32 = () => { const v = buf.readUInt32BE(pos); pos += 4; return v; };
const i64 = () => { const v = Number(buf.readBigInt64BE(pos)); pos += 8; return v; };
const align16 = () => { pos = (pos + 15) & ~15; };
function lz4(src, size) {
  const dst = Buffer.alloc(size);
  let si = 0, di = 0;
  while (si < src.length) {
    const token = src[si++];
    let lit = token >> 4;
    if (lit === 15) { let b; do { b = src[si++]; lit += b; } while (b === 255); }
    src.copy(dst, di, si, si + lit); si += lit; di += lit;
    if (si >= src.length) break;
    const offset = src[si] | (src[si + 1] << 8); si += 2;
    let len = token & 15;
    if (len === 15) { let b; do { b = src[si++]; len += b; } while (b === 255); }
    len += 4;
    for (let k = 0, m = di - offset; k < len; k++) dst[di++] = dst[m++];
  }
  if (di !== size) throw new Error(`LZ4 len ${di} != ${size}`);
  return dst;
}
const decompress = (data, flags, size) => {
  const kind = flags & 0x3f;
  if (kind === 0) return data;
  if (kind === 2 || kind === 3) return lz4(data, size);
  throw new Error(`unsupported compression ${kind}`);
};
if (readCString() !== "UnityFS") throw new Error("not UnityFS");
const version = u32(); const unityVersion = readCString(); const revision = readCString();
const size = i64(); const cInfo = u32(), uInfo = u32(), flags = u32();
if (version >= 7) align16();
let infoBytes;
if (flags & 0x80) infoBytes = buf.subarray(buf.length - cInfo);
else { infoBytes = buf.subarray(pos, pos + cInfo); pos += cInfo; }
const info = decompress(infoBytes, flags, uInfo);
if (flags & 0x200) align16();
let ip = 16;
const blockCount = info.readInt32BE(ip); ip += 4;
const blocks = [];
for (let b = 0; b < blockCount; b++) { blocks.push({ u: info.readUInt32BE(ip), c: info.readUInt32BE(ip + 4), f: info.readUInt16BE(ip + 8) }); ip += 10; }
const nodeCount = info.readInt32BE(ip); ip += 4;
const nodes = [];
for (let n = 0; n < nodeCount; n++) {
  const off = Number(info.readBigInt64BE(ip)); const sz = Number(info.readBigInt64BE(ip + 8)); const fl = info.readUInt32BE(ip + 16); ip += 20;
  const end = info.indexOf(0, ip); const name = info.toString("utf8", ip, end); ip = end + 1;
  nodes.push({ off, sz, fl, name });
}
const parts = [];
for (const block of blocks) { parts.push(decompress(buf.subarray(pos, pos + block.c), block.f, block.u)); pos += block.c; }
const data = Buffer.concat(parts);
fs.writeFileSync(outPath, data);
console.log(JSON.stringify({ unityVersion, blocks: blocks.length, decompressed: data.length, nodes }));
