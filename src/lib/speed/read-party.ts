import { lumOf, type Frame } from "./frame";
import { BASE_BAR_H, type StatusBar } from "./status-bar";

/** 一條血條框：橫向 x0～x1、直向 y0～y1（右下不含），y0 就是上亮線的第一列，拿來算列距 */
export type PartyTrack = { x0: number; x1: number; y0: number; y1: number };

/** 一道橫的亮線：x0～x1（右不含）；y0～y1（含）因為放大後 1px 的線會佔兩三列 */
type Line = { x0: number; x1: number; y0: number; y1: number };

/** 亮線至少要多亮、比旁邊最暗的點亮多少。縮放後 1px 的白線會被抹成兩列（各剩一半，約 140），黑框也被抹淡，所以門檻只抓「亮、且貼著暗」 */
const LINE_MIN = 115;
const LINE_CONTRAST = 70;
/** 上亮線第一列到下亮線最後一列的距離 ＝ 9 × 倍率 − 1（1×：569～577 是 8）；放大後線的邊緣落在像素的哪裡會差 ±1 */
const SPAN_TOLERANCE = 1.3;
/** 血條的紅（HP 不滿時只剩左邊一段）；框的白邊、外圈黑、灰的填色都不會是紅 */
const isRed = (r: number, g: number, b: number) => r >= 150 && r - Math.max(g, b) >= 90;

/**
 * 隊伍欄在畫面右側：每個隊友一列，名字加一條血條。血條有固定寬度的「框」（外圈黑、裡圈白）；
 * 在同一張圖的隊友，框裡填紅色（血量少時紅色變短，框不變），不在線或不在這張圖的填灰（偏卡其）。
 * 所以不看紅色有多長，改找框，再看框裡有沒有紅：
 * 1. 在右邊四分之一、狀態列以上，找「又細又亮、貼著暗色」的橫線，長度約 63px（照縮放）。
 *    不用單一的白色門檻：放大後 1px 的邊會被抹成兩列、亮度掉到 140 上下，所以只要求夠亮，加上比旁邊最暗的點亮 70 以上；
 *    線中間斷 1～2px 也算同一條（九成以上的點亮就好）。
 * 2. 上緣配下緣：左右端對齊、從上線頂到下線底相距 9 × 倍率 − 1（1× 是 569～577 的 8），而且左右各有一道直的亮邊把它們連起來
 *    （兩個框之間的縫沒有）→ 一個框。距離量貼著黑框的外緣，框裡緊貼白線的那條亮邊（灰框 ~200）和白線連在一起也不影響。
 * 3. 框的左緣對齊、寬度一樣、上緣相距 12～30px 的一串才是隊伍欄；灰掉的隊友也有框，所以串不會被中斷（紅灰紅 ＝ 3 個框）。
 * 4. 人數＝這串裡「框裡有紅色像素」的框數（血量剩 3% 也算），至少 1。畫面別處的紅條（怪物血條）沒有框，不算。
 *
 * 基準截圖（1364×799，1×）量到的幾何，之後全部乘 bar.scale：
 * - 框外緣 x 1296～1360（寬 65）；上亮線 y 569、x 1297～1359（長 63，兩端圓角各縮 1px）；下亮線 y 577；上下線相距 8。
 *   亮線外面一圈黑（y 568、578；x 1295、1361）；左右各一道直的白邊（x 1296、1360）。
 * - 三個框（自己、隊友 1、隊友 2）的上亮線在 y 569、586、603，列距 17；框裡 x 1298～1358、y 571～575。
 * - 自己填紅（229,3,4 往下暗到 150,16,16，上面有一條亮邊），隊友填灰（約 138,128,106，上面一條亮邊 ~200）。
 * - 放大 1.25～2.5 倍後，亮線只剩 ~155～250（看線落在像素的哪個位置，最差是線被一分為二各 ~140），旁邊的黑被抹成 ~15～100。
 *   0.9 倍以上都量過；再縮小，1px 的邊會被混掉，認不全。
 */
export function readParty(frame: Frame, bar: StatusBar): number {
  const s = bar.scale;
  const tracks = findPartyTracks(frame, bar).sort((a, b) => a.y0 - b.y0);
  const chains: PartyTrack[][] = [];
  for (const track of tracks) {
    const chain = chains.find(items => {
      const last = items[items.length - 1];
      const pitch = track.y0 - last.y0;
      return (
        Math.abs(track.x0 - last.x0) <= 3 * s &&
        Math.abs(track.x1 - last.x1) <= 3 * s &&
        pitch >= 12 * s &&
        pitch <= 30 * s
      );
    });
    if (chain) chain.push(track);
    else chains.push([track]);
  }
  let best = 1;
  for (const chain of chains) best = Math.max(best, chain.filter(track => hasRed(frame, track)).length);
  return best;
}

/** 框裡有沒有紅色像素：整個框（含邊）掃一遍，邊是白、外圈是黑，本身不會被當成紅 */
function hasRed(frame: Frame, track: PartyTrack): boolean {
  const { data, width } = frame;
  for (let y = track.y0; y < track.y1; y++) {
    for (let x = Math.max(0, track.x0 - 1); x <= Math.min(width - 1, track.x1); x++) {
      const i = (y * width + x) * 4;
      if (isRed(data[i], data[i + 1], data[i + 2])) return true;
    }
  }
  return false;
}

/** 找出畫面右側所有的血條框（步驟 1、2）；不管框裡填什麼顏色 */
export function findPartyTracks(frame: Frame, bar: StatusBar): PartyTrack[] {
  const s = bar.scale;
  const k = Math.ceil(s) + 1; // 亮線旁邊要看多遠（放大後線和黑框都變寬）
  const left = Math.floor(frame.width * 0.75);
  const top = Math.max(0, Math.floor(frame.height * 0.3));
  const bottom = Math.min(frame.height, Math.floor(bar.top - 2 * BASE_BAR_H * s));
  if (bottom <= top || left >= frame.width) return [];

  // 範圍外加 k 格當邊，亮度只算一次；讀到範圍外的格子取最近的一格
  const x0 = Math.max(0, left - k);
  const y0 = Math.max(0, top - k);
  const w = frame.width - x0;
  const h = Math.min(frame.height, bottom + k) - y0;
  const lum = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * frame.width + x0 + x) * 4;
      lum[y * w + x] = lumOf(frame.data[i], frame.data[i + 1], frame.data[i + 2]);
    }
  }
  const L = (x: number, y: number) => lum[Math.min(h - 1, Math.max(0, y - y0)) * w + Math.min(w - 1, Math.max(0, x - x0))];

  /** 這一格夠亮，而且上下（vertical）或左右 k 格內有明顯更暗的點 */
  const thin = (x: number, y: number, vertical: boolean): boolean => {
    const v = L(x, y);
    if (v < LINE_MIN) return false;
    let dark = v;
    for (let d = 1; d <= k; d++) {
      dark = vertical ? Math.min(dark, L(x, y - d), L(x, y + d)) : Math.min(dark, L(x - d, y), L(x + d, y));
    }
    return v - dark >= LINE_CONTRAST;
  };

  // 1. 每一列找長度合適的亮線；上下相連的列併成一道
  const gapMax = Math.max(1, Math.ceil(s));
  const minLen = 50 * s;
  const maxLen = 80 * s;
  const lines: Line[] = [];
  for (let y = top; y < bottom; y++) {
    let start = -1;
    let last = -1;
    let hits = 0;
    const close = () => {
      const len = last + 1 - start;
      if (start >= 0 && len >= minLen && len <= maxLen && hits >= len * 0.9) {
        const above = lines.find(
          line => line.y1 === y - 1 && Math.abs(line.x0 - start) <= 2 * s && Math.abs(line.x1 - (last + 1)) <= 2 * s,
        );
        if (above) above.y1 = y;
        else lines.push({ x0: start, x1: last + 1, y0: y, y1: y });
      }
      start = -1;
      hits = 0;
    };
    for (let x = left; x < frame.width; x++) {
      if (thin(x, y, true)) {
        if (start >= 0 && x - last - 1 > gapMax) close();
        if (start < 0) start = x;
        last = x;
        hits++;
      } else if (start >= 0 && x - last > gapMax) {
        close();
      }
    }
    if (start >= 0) close();
  }

  // 2. 上緣配下緣：左右端對齊、從上線頂到下線底的距離對得上、兩側有直的亮邊；差最少的先配，一道線只配一次。
  //    量距離用外緣（貼著黑框那一側）：框裡緊貼著白線的亮邊（灰框上面一條 ~200）有時會和白線連成一道，內緣會被它拖長
  const pairs: { upper: Line; lower: Line; error: number }[] = [];
  for (const upper of lines) {
    for (const lower of lines) {
      const error = Math.abs(lower.y1 - upper.y0 - (9 * s - 1));
      if (
        error <= SPAN_TOLERANCE &&
        Math.abs(upper.x0 - lower.x0) <= 2 * s &&
        Math.abs(upper.x1 - lower.x1) <= 2 * s &&
        hasSides(thin, upper, lower, s)
      ) {
        pairs.push({ upper, lower, error });
      }
    }
  }
  pairs.sort((a, b) => a.error - b.error);
  const used = new Set<Line>();
  const tracks: PartyTrack[] = [];
  for (const { upper, lower } of pairs) {
    if (used.has(upper) || used.has(lower)) continue;
    used.add(upper);
    used.add(lower);
    tracks.push({
      x0: Math.min(upper.x0, lower.x0),
      x1: Math.max(upper.x1, lower.x1),
      y0: upper.y0,
      y1: lower.y1 + 1,
    });
  }
  return tracks;
}

/** 兩道線中間（上下各留 30%，避開角和內部緊貼著線的亮邊）的列，左邊跟右邊各有一道直的亮邊（八成以上的列有）；兩個框之間的縫沒有 */
function hasSides(thin: (x: number, y: number, vertical: boolean) => boolean, upper: Line, lower: Line, s: number): boolean {
  const xa = Math.min(upper.x0, lower.x0);
  const xb = Math.max(upper.x1, lower.x1);
  const reach = Math.ceil(1.5 * s) + 1;
  let rows = 0;
  let left = 0;
  let right = 0;
  const span = lower.y1 - upper.y0;
  for (let y = Math.ceil(upper.y0 + 0.3 * span); y <= Math.floor(lower.y1 - 0.3 * span); y++) {
    rows++;
    for (let d = -reach; d <= reach; d++) {
      if (thin(xa + d, y, false)) {
        left++;
        break;
      }
    }
    for (let d = -reach; d <= reach; d++) {
      if (thin(xb - 1 + d, y, false)) {
        right++;
        break;
      }
    }
  }
  return rows >= 2 && left >= rows * 0.8 && right >= rows * 0.8;
}
