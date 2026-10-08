/**
 * 「帶我去」按鈕給讀螢幕軟體念的完整說法：畫面上一整排都寫「路線」「去」，只念按鈕上的字分不出是去哪。
 * 按鈕上的字照舊，只換念出來的。
 */
export function goLabel(label: string, place: string): string {
  if (label === "路線") return `到${place}的路線`;
  if (label.startsWith("帶我去")) return `帶我去${place}${label.slice("帶我去".length)}`;
  if (label === "去") return `去${place}`;
  return `${label}：${place}`;
}

/**
 * 任務卡 NPC 的「路線」要念到哪裡：念 NPC 的名字（「到阿里可那裡的路線」）——念地圖名的話，NPC 在還沒開放的地圖時每一顆都是「到未開放地圖的路線」。
 * 名字是空的、沒有、或壞掉沒有任何文字（資料裡有「???? ?」）就念地圖名
 */
export function npcPlace(npcName: string | undefined, mapNameText: string): string {
  return npcName && /\p{L}/u.test(npcName) ? `${npcName}那裡` : mapNameText;
}
