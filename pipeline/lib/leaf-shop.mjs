/**
 * 楓葉商會（台服 11/19 維護後～12/16 23:59 換東西，公告 beanfun eventAdId=20216）的楓葉武器店家列（v2.37）。
 *
 * 上游資料沒有這家店：19 把楓葉武器在 items.json 只有數值、沒有來源，資料區看不出去哪拿。
 * 這裡照公告補成 sp 的活動店（u 幣別、e 結束時間），前端標「活動限定・到 12/16」、過了自己藏起來（跟萬聖節行商人同一套）。
 * 兌換價照台服公告（劍士）＋陸服（其他職業），跟 src/lib/leaf-planner/weapons.ts 同一份（src/lib/__tests__/leaf-shop.test.ts 對答案）。
 */

/** [道具 id, 兌換價（硬幣）]：35 級 100 枚、43 級 200 枚 */
export const LEAF_SHOP_WEAPONS = [
  [1412011, 200], [1422014, 200], [1442024, 200], [1432012, 200], [1302030, 200], [1302020, 100],
  [1382012, 200], [1382009, 100],
  [1452022, 200], [1452016, 100], [1462019, 200], [1462014, 100],
  [1472032, 200], [1472030, 100], [1332025, 200],
  [1482021, 200], [1482020, 100], [1492021, 200], [1492020, 100],
];

const PLACES = [["弓箭手村", 100000000], ["天空之城", 200000000], ["冰原雪域", 211000000]];
const SIGN = "楓葉商會招牌";
const COIN = "楓葉商會硬幣";
const UNTIL = "2026-12-16T23:59+08:00";

const COST = new Map(LEAF_SHOP_WEAPONS);

/** 楓葉武器在原本的店家列後面補上三個招牌；不是楓葉武器原樣回 */
export function withLeafShop(itemId, rows) {
  const cost = COST.get(itemId);
  if (!cost) return rows;
  const leaf = PLACES.map(([place, mapId]) => ({ p: place, n: SIGN, m: mapId, pr: cost, u: COIN, e: UNTIL }));
  return [...(rows ?? []), ...leaf];
}

/**
 * 傷害計算機用的楓葉武器（gear.json 的 leaf）：數值照 items.json，來源寫楓葉商會。
 * 不放進 gear.json 的 weapons：那份是首頁裝備卡、升級路線挑武器用的常駐來源，活動武器不該被當成一路主推。
 */
export function buildLeafGear(items) {
  const byId = new Map(items.map(item => [item.id, item]));
  return LEAF_SHOP_WEAPONS.flatMap(([id, cost]) => {
    const item = byId.get(id);
    if (!item?.eq) return [];
    const eq = item.eq;
    const weapon = { id, n: item.n, s: item.s, lv: eq.reqLevel ?? 0 };
    if (eq.incPAD) weapon.atk = eq.incPAD;
    if (eq.incMAD) weapon.mag = eq.incMAD;
    if (eq.attackSpeed !== undefined) weapon.spd = eq.attackSpeed;
    weapon.job = eq.reqJob ?? 0;
    if (eq.tuc) weapon.tuc = eq.tuc;
    weapon.src = { shops: [{ p: "楓葉商會", n: SIGN, m: PLACES[0][1], pr: cost }] };
    return [weapon];
  });
}
