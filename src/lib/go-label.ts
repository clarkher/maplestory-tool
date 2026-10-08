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
