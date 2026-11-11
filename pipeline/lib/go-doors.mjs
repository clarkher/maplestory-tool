/**
 * 地圖導航（/go）在圖上圈出要走的門用的小檔：public/data/go-doors.json（v2.10）。
 * 從圖鑑（lib/atlas.mjs 的 atlas.maps）抽：{ <圖 id>: { b: [左, 上, 寬, 高], d: { <目的圖 id>: [[x, y], …] } } }。
 * 導航只要範圍跟門，不載整個 atlas-maps.json（怪、NPC 都在裡面，三百多 KB）。
 * 沒有範圍 b 的圖畫不出來，整張不收；沒座標的門不收（前端查不到就退回純文字）。
 */
export function goDoors(atlasMaps) {
  const out = {};
  for (const map of atlasMaps) {
    if (!map.b) continue;
    const d = {};
    for (const door of map.doors || []) if (door.p.length) d[door.to] = door.p;
    out[map.id] = { b: map.b, d };
  }
  return out;
}
