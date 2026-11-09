/**
 * 選項按鈕的選中／沒選中樣子（v1.89 A 攻略工具，v1.95 抽出來共用）：選中是橘框＋橘色淡底＋橘字，不是實心橘；
 * 沒選中是灰底細框，滑過只把字變深，框不變橘（橘框是「選中」專用，滑過也出橘框會跟選中分不清）。
 * 只管顏色跟框，大小、圓角各頁自己寫；要有 border 才看得到框。
 */
export const OPTION_ON = "border-[color:var(--maple)] bg-[color:var(--maple-wash)] text-[color:var(--maple)]";
export const OPTION_OFF = "border-[color:var(--paper-edge)] bg-[color:var(--paper-deep)] ink-soft hover:text-[color:var(--ink)]";
