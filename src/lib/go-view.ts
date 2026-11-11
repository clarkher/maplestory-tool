/**
 * 地圖導航（/go）每一段的圖：放大出口附近、圈出要走的門（v2.10，使用者選版面 B）。
 * 資料是 public/data/go-doors.json（pipeline/lib/go-doors.mjs）。這裡只有算術，畫面在 components/go/DoorView.tsx。
 */

type Point = [number, number];

/** go-doors.json：{ <圖 id>: { b: [左, 上, 寬, 高], d: { <目的圖 id>: 門座標… } } } */
export type GoDoors = Record<string, { b: [number, number, number, number]; d: Record<string, Point[]> }>;

/** 放大後看到的那一塊（遊戲座標） */
export type DoorViewport = { x: number; y: number; w: number; h: number };

/** 放大後最多看這麼高（遊戲座標）：門跟周圍的平台看得清楚，手機上門大約一個指頭寬 */
const MAX_SPAN = 760;
/** 門放在畫面直向 60% 的位置：上面留空間給「往 X」標籤 */
const DOOR_AT = 0.6;

/** 這一段要走的門：通往 to 的門；好幾個時挑離進來位置最近的，不知道進來位置拿第一個 */
export function pickDoor(doors: GoDoors | null, map: number, to: number, entry?: Point | null): Point | null {
  const points = doors?.[String(map)]?.d[String(to)];
  if (!points?.length) return null;
  if (!entry) return points[0];
  const far = (point: Point) => (point[0] - entry[0]) ** 2 + (point[1] - entry[1]) ** 2;
  return points.reduce((best, point) => (far(point) < far(best) ? point : best));
}

/** 圈的直徑（圖框寬度的百分比）；DoorView 的圈跟 doorLayout 的排版用同一個數字 */
export const RING = 13;

/**
 * 以門為準放大的範圍。比例固定（aspect = 寬／高），高度最多 MAX_SPAN；地圖比這還小就縮到整張放得進去。
 * 門靠邊時範圍貼著地圖邊；門就在邊上（有些門畫在地圖最上緣）時再往外讓一點，整個圈都要在畫面裡（多出來的地方是黑的）。
 */
export function doorViewport(b: [number, number, number, number], door: Point, aspect: number): DoorViewport {
  const [left, top, width, height] = b;
  const h = Math.min(MAX_SPAN, height, width / aspect);
  const w = h * aspect;
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  // 圈的半徑（遊戲座標）再多留兩成
  const room = ((w * RING) / 200) * 1.2;
  const x = clamp(door[0] - w / 2, left, left + width - w);
  const y = clamp(door[1] - h * DOOR_AT, top, top + height - h);
  return {
    x: clamp(x, door[0] + room - w, door[0] - room),
    y: clamp(y, door[1] + room - h, door[1] - room),
    w,
    h,
  };
}

/** 點在範圍裡的位置（百分比）；inside 是 false 就是畫面外 */
export function viewPercent(view: DoorViewport, point: Point): { left: number; top: number; inside: boolean } {
  const left = ((point[0] - view.x) / view.w) * 100;
  const top = ((point[1] - view.y) / view.h) * 100;
  return { left, top, inside: left >= 0 && left <= 100 && top >= 0 && top <= 100 };
}

/**
 * 圈起來的門在整張圖的哪一邊（跟角落小圖看到的一致）：橫向前、後四分之一是左邊、右邊，其餘看高度分上面、下面、中間。
 * 不看門名：門名是舊版資料的（up00 的門在台服可能畫在最下面），圈的位置才是玩家看到的。
 * 「最」：貼著地圖邊（15% 以內）、而且查得到位置的門裡沒有比它更靠邊的才加。
 */
export function exitSide(b: [number, number, number, number], exit: Point, known: Point[]): string {
  const [left, top, width, height] = b;
  const x = (exit[0] - left) / width;
  const y = (exit[1] - top) / height;
  if (x <= 0.25) return x <= 0.15 && known.every(point => point[0] >= exit[0]) ? "最左邊" : "左邊";
  if (x >= 0.75) return x >= 0.85 && known.every(point => point[0] <= exit[0]) ? "最右邊" : "右邊";
  if (y <= 0.33) return "上面";
  if (y >= 0.67) return "下面";
  return "中間";
}

type Box = { left: number; top: number; right: number; bottom: number };
export type OverviewCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** 標籤大約多高（圖框高度的百分比）：一行 13px 字，手機圖框高約 180px */
const LABEL_HEIGHT = 14;
/** 標籤一個字大約多寬（圖框寬度的百分比，手機圖框寬約 313px、字 13px）；寧可估寬 */
const CHAR_WIDTH = 4.4;
/** 標籤最多佔圖框寬度的百分比（DoorView 的 max-w 同一個數字） */
export const LABEL_MAX = 70;

/**
 * 圈、標籤、角落小圖怎麼擺才不互相蓋到（全部是圖框的百分比）。
 * 標籤貼著圈的上緣；上面放不下（門太靠上）就貼下緣。橫向照門的位置往回推，不超出圖框。
 * 小圖四個角挑一個不碰到圈跟標籤的（出口的另一邊、上面優先）；都會碰到就不放（回 null）。
 * overview：小圖的寬高（百分比）；整張圖都看得到、不放小圖時傳 null。
 */
export function doorLayout(
  door: { left: number; top: number },
  aspect: number,
  labelChars: number,
  overview: { w: number; h: number } | null,
): { labelTop: number; labelBelow: boolean; corner: OverviewCorner | null } {
  const radiusX = RING / 2;
  const radiusY = (RING * aspect) / 2;
  const gap = 2;
  const labelBelow = door.top - radiusY - gap - LABEL_HEIGHT < 0;
  const labelTop = labelBelow ? door.top + radiusY + gap : door.top - radiusY - gap;
  const labelWidth = Math.min(LABEL_MAX, (labelChars + 2) * CHAR_WIDTH);
  const labelLeft = door.left - (door.left / 100) * labelWidth;
  const label: Box = {
    left: labelLeft,
    right: labelLeft + labelWidth,
    top: labelBelow ? labelTop : labelTop - LABEL_HEIGHT,
    bottom: labelBelow ? labelTop + LABEL_HEIGHT : labelTop,
  };
  const ring: Box = { left: door.left - radiusX, right: door.left + radiusX, top: door.top - radiusY, bottom: door.top + radiusY };
  if (!overview) return { labelTop, labelBelow, corner: null };

  // 小圖離圖框邊 2%
  const margin = 2;
  const boxAt = (corner: OverviewCorner): Box => {
    const l = corner.endsWith("left") ? margin : 100 - margin - overview.w;
    const t = corner.startsWith("top") ? margin * aspect : 100 - margin * aspect - overview.h;
    return { left: l, right: l + overview.w, top: t, bottom: t + overview.h };
  };
  const hit = (a: Box, c: Box) => !(a.right <= c.left || a.left >= c.right || a.bottom <= c.top || a.top >= c.bottom);
  const far = door.left > 50 ? "left" : "right";
  const near = far === "left" ? "right" : "left";
  const order = [`top-${far}`, `bottom-${far}`, `top-${near}`, `bottom-${near}`] as OverviewCorner[];
  const corner = order.find(candidate => !hit(boxAt(candidate), ring) && !hit(boxAt(candidate), label)) ?? null;
  return { labelTop, labelBelow, corner };
}
