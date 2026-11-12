/** 能打字找的下拉選單的一個選項（components/SearchSelect.tsx）；value 是 null 代表「不選」那一項 */
export type SearchOption = { value: number | null; label: string };

/** 比對前把字整理成同一種樣子：英文小寫、空白跟點拿掉（「Jr. 巴洛古」打「jr巴」、「Lv.65」打「lv65」都找得到） */
function fold(text: string): string {
  return text.toLowerCase().replace(/[\s.・·]/g, "");
}

/**
 * 沒打字就整份照原本順序（跟原本下拉選單一樣能從頭滑）；
 * 有打字只留對得上的：名字開頭對上的排前面，中間對上的排後面，各自照原本順序。
 */
export function filterOptions(options: SearchOption[], query: string): SearchOption[] {
  const keyword = fold(query);
  if (!keyword) return options;
  const starts: SearchOption[] = [];
  const contains: SearchOption[] = [];
  for (const option of options) {
    const label = fold(option.label);
    if (label.startsWith(keyword)) starts.push(option);
    else if (label.includes(keyword)) contains.push(option);
  }
  return [...starts, ...contains];
}
