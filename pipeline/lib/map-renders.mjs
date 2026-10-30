/**
 * 地圖畫面圖：上游整張地圖渲染 png（map_renders，342MB）不整包鏡像，
 * 只把 atlas 收的地圖轉成 1200 寬 webp 放進 public/assets/map_renders。
 *
 * renderPlan 決定每張圖要做什麼（純函式）：
 *  - convert：有快取 png，而且 webp 還沒有或版本（上游 ?v=）變了
 *  - keep：webp 已在，沒有新的可轉（版本一樣，或沒有快取＝本機/CI 沒抓上游圖）
 *  - missing：沒快取、webp 也不在
 * 只看 atlasIds，所以不在 atlas 的既有檔不會出現在任何清單，也就不會被刪。
 *
 * @param {{atlasIds:number[], upstreamVersions:Record<string,string>, have:Record<string,string>, cacheHas:(id:number)=>boolean}} input
 *   have：目前 map-renders.json 裡「檔案確實存在」的 { id: 版本 }
 */
export function renderPlan({ atlasIds, upstreamVersions, have, cacheHas }) {
  const convert = [];
  const keep = [];
  const missing = [];
  for (const id of atlasIds) {
    const has = Object.prototype.hasOwnProperty.call(have, id);
    const cached = cacheHas(id);
    const known = upstreamVersions[id] !== undefined; // 上游沒給版本＝版本不明，已有檔就沿用，不每次重轉
    if (cached && (!has || (known && have[id] !== upstreamVersions[id]))) convert.push(id);
    else if (has) keep.push(id);
    else missing.push(id);
  }
  return { convert, keep, missing };
}
