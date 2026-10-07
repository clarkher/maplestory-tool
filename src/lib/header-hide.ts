/**
 * 手機上方被導覽列佔掉太多（v0.53）：手指往下滑時導覽列收起來，往上滑一點就出來；黏在導覽列下面的東西跟著貼到最上面。
 * 只有手指滑動才算——網站自己捲（點一筆、按返回、重新整理回到原位）不收也不叫出來，不然上面會空一塊。
 * 抽出來單獨測；SiteHeader 用它。
 */

/** 手指移動超過這麼多 px 才算在滑（點一下手指也會晃幾 px） */
export const SWIPE_SLOP = 10;
/** 手指放開後畫面靠慣性還在捲：捲動事件之間隔不到這麼久（毫秒）都算手指滑的 */
export const FLING_GAP = 200;
/** 手指往下滑累計這麼多 px 才收 */
export const HIDE_AFTER = 16;
/** 收起來之後往上滑這麼多 px 就出來 */
export const SHOW_AFTER = 8;

export type HeaderMotion = {
  hidden: boolean;
  /** 上一次捲動事件時的位置 */
  lastY: number;
  /** 這個方向累計滑了多少（往下正、往上負） */
  travel: number;
};

/** 每次捲動事件算一次：導覽列要不要收 */
export function nextHeader(
  state: HeaderMotion,
  { y, byFinger, headerHeight }: { y: number; byFinger: boolean; headerHeight: number },
): HeaderMotion {
  // 回到頁面最上面，導覽列原本的位置看得到了：一定出來
  if (y <= headerHeight) return { hidden: false, lastY: y, travel: 0 };
  // 網站自己捲：維持原樣，從新的位置開始算
  if (!byFinger) return { hidden: state.hidden, lastY: y, travel: 0 };
  const delta = y - state.lastY;
  // 換方向就重新累計
  const travel = delta === 0 || Math.sign(delta) === Math.sign(state.travel) ? state.travel + delta : delta;
  const hidden = travel >= HIDE_AFTER ? true : travel <= -SHOW_AFTER ? false : state.hidden;
  return { hidden, lastY: y, travel };
}

type Touches = { touches: ArrayLike<{ clientX: number; clientY: number }> };

/**
 * 這次捲動是不是手指滑的：手指按著移動超過 SWIPE_SLOP 才算（點一下不算，點一筆之後是網站自己捲），
 * 放開後的慣性捲動也算，直到捲動事件停了 FLING_GAP；再碰一下螢幕慣性就停了，重新算。
 */
export function createFingerScroll(
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  now: () => number = () => performance.now(),
) {
  let start: { x: number; y: number } | null = null;
  let swiping = false;
  let flingUntil = -Infinity;

  const onStart = (event: Event) => {
    const point = (event as Event & Touches).touches[0];
    // 另一根手指加進來：還是同一次滑動
    if (start && swiping) return;
    start = point ? { x: point.clientX, y: point.clientY } : null;
    swiping = false;
    flingUntil = -Infinity;
  };
  const onMove = (event: Event) => {
    const point = (event as Event & Touches).touches[0];
    if (!start || !point || swiping) return;
    swiping = Math.hypot(point.clientX - start.x, point.clientY - start.y) > SWIPE_SLOP;
  };
  const onEnd = (event: Event) => {
    // 還有手指按著：還在滑
    if ((event as Event & Touches).touches.length) return;
    if (swiping) flingUntil = now() + FLING_GAP;
    swiping = false;
    start = null;
  };

  const listeners: Array<[string, (event: Event) => void]> = [
    ["touchstart", onStart],
    ["touchmove", onMove],
    ["touchend", onEnd],
    ["touchcancel", onEnd],
  ];
  for (const [type, listener] of listeners) target.addEventListener(type, listener, { capture: true, passive: true });

  return {
    /** 每次捲動事件呼叫：這一下是不是手指滑的（慣性還在捲時順便延長） */
    scrolled(): boolean {
      if (swiping) return true;
      const time = now();
      if (time > flingUntil) return false;
      flingUntil = time + FLING_GAP;
      return true;
    },
    dispose() {
      for (const [type, listener] of listeners) target.removeEventListener(type, listener, { capture: true });
    },
  };
}
