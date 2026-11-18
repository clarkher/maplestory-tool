/**
 * 怪物出現的圖只留已開放的（v2.37）。
 *
 * 上游一隻怪的 maps 會把所有出現地點列在一起：潛水企鵝王同時在女神塔跟水世界、獨眼蝙蝠同時在廢礦跟水世界。
 * 只要有一張開放就收進來，結果水世界的圖跟刷怪點也一起進了 monsters.json（地點顯示沒名字、練功、掉落都算進去）。
 *
 * 999999998「楓葉世界全地區」是上游放活動怪的假地圖（小雪人、迷路的麋鹿＝聖誕節活動），不是真的地點；
 * 只出現在那裡的怪不收，活動有開再另外寫攻略。
 */
export const EVENT_WIDE_MAP = 999999998;

/**
 * 整隻不收的怪：潛水企鵝王是水世界的怪，女神塔地下 2 樓（組隊任務）雖然也有刷，使用者 11/18 要整隻拿掉
 * （水世界還沒開，查資料看到牠會以為能去打）。
 */
export const EXCLUDED_MONSTERS = new Set([3210450]);

/**
 * @param {number[]} maps 上游列的出現地圖
 * @param {Array<[number, number, number]>} spawns 刷怪點 [地圖, 數量, 回生]
 * @param {Set<number>} released 已開放（有中文名）的地圖
 * @param {number} [monsterId] 怪物 id（EXCLUDED_MONSTERS 的整隻不收）
 * @returns {{ maps: number[], sp: Array<[number, number, number]>, listed: boolean }}
 */
export function monsterReleasedMaps(maps, spawns, released, monsterId) {
  const open = id => released.has(Number(id));
  const kept = maps.filter(open);
  return {
    maps: kept,
    sp: (spawns || []).filter(([id]) => open(id)),
    listed: !EXCLUDED_MONSTERS.has(Number(monsterId)) && kept.some(id => Number(id) !== EVENT_WIDE_MAP),
  };
}
