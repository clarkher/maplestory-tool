import { describe, expect, it } from "vitest";
import { FLING_GAP, HIDE_AFTER, SHOW_AFTER, SWIPE_SLOP, createFingerScroll, nextHeader, type HeaderMotion } from "@/lib/header-hide";

const HEADER = 65;
const shown = (lastY: number): HeaderMotion => ({ hidden: false, lastY, travel: 0 });
const hidden = (lastY: number): HeaderMotion => ({ hidden: true, lastY, travel: 0 });

describe("導覽列什麼時候收、什麼時候出來", () => {
  it("手指往下滑超過一點點才收；只滑幾 px（手指晃一下）不收", () => {
    expect(nextHeader(shown(500), { y: 500 + HIDE_AFTER - 1, byFinger: true, headerHeight: HEADER }).hidden).toBe(false);
    expect(nextHeader(shown(500), { y: 500 + HIDE_AFTER, byFinger: true, headerHeight: HEADER }).hidden).toBe(true);
  });

  it("往下滑是分好幾下捲動事件來的：累計起來超過就收", () => {
    let state = shown(500);
    for (let y = 504; y <= 520; y += 4) state = nextHeader(state, { y, byFinger: true, headerHeight: HEADER });
    expect(state.hidden).toBe(true);
  });

  it("收起來之後往上滑一點就出來", () => {
    expect(nextHeader(hidden(900), { y: 900 - SHOW_AFTER + 1, byFinger: true, headerHeight: HEADER }).hidden).toBe(true);
    expect(nextHeader(hidden(900), { y: 900 - SHOW_AFTER, byFinger: true, headerHeight: HEADER }).hidden).toBe(false);
  });

  it("換方向就重新算：往下滑了一些、又往上滑一點，累計的往下不會被拿來收", () => {
    let state = nextHeader(shown(500), { y: 510, byFinger: true, headerHeight: HEADER });
    state = nextHeader(state, { y: 506, byFinger: true, headerHeight: HEADER });
    state = nextHeader(state, { y: 516, byFinger: true, headerHeight: HEADER });
    expect(state.hidden).toBe(false);
  });

  it("網站自己捲（點一筆、按返回、重新整理回到原位）：收著的不出來、出來的不收", () => {
    expect(nextHeader(shown(500), { y: 3000, byFinger: false, headerHeight: HEADER }).hidden).toBe(false);
    expect(nextHeader(hidden(3000), { y: 500, byFinger: false, headerHeight: HEADER }).hidden).toBe(true);
  });

  it("網站自己捲完，手指再滑：從新的位置開始算，不會把網站捲的那一段算進去", () => {
    let state = nextHeader(shown(500), { y: 3000, byFinger: false, headerHeight: HEADER });
    state = nextHeader(state, { y: 3004, byFinger: true, headerHeight: HEADER });
    expect(state.hidden).toBe(false);
  });

  it("回到頁面最上面（導覽列原本的位置看得到）：一定出來，不管是不是手指滑的——不然上面空一塊", () => {
    expect(nextHeader(hidden(900), { y: HEADER, byFinger: false, headerHeight: HEADER }).hidden).toBe(false);
    expect(nextHeader(hidden(900), { y: 0, byFinger: true, headerHeight: HEADER }).hidden).toBe(false);
  });

  it("在頁面最上面往下滑，還沒滑過導覽列的高度：不收", () => {
    expect(nextHeader(shown(0), { y: HEADER, byFinger: true, headerHeight: HEADER }).hidden).toBe(false);
  });
});

/** 假的 touch 事件：只帶 touches（目前還按著的手指） */
function touch(type: string, points: Array<[number, number]>) {
  return Object.assign(new Event(type), { touches: points.map(([clientX, clientY]) => ({ clientX, clientY })) });
}

function setup() {
  const target = new EventTarget();
  let time = 1000;
  const finger = createFingerScroll(target, () => time);
  return { target, finger, wait: (ms: number) => { time += ms; } };
}

describe("這次捲動是不是手指滑的", () => {
  it("手指按著移動超過一點點：是", () => {
    const { target, finger } = setup();
    target.dispatchEvent(touch("touchstart", [[100, 500]]));
    target.dispatchEvent(touch("touchmove", [[100, 500 - SWIPE_SLOP - 1]]));
    expect(finger.scrolled()).toBe(true);
  });

  it("點一下（沒移動、或只晃幾 px）：不是——點一筆之後網站自己捲，不能當成手指滑", () => {
    const { target, finger } = setup();
    target.dispatchEvent(touch("touchstart", [[100, 500]]));
    target.dispatchEvent(touch("touchmove", [[103, 504]]));
    target.dispatchEvent(touch("touchend", []));
    expect(finger.scrolled()).toBe(false);
  });

  it("放開後畫面靠慣性還在捲：是，一直到捲動停下來超過一下子", () => {
    const { target, finger, wait } = setup();
    target.dispatchEvent(touch("touchstart", [[100, 500]]));
    target.dispatchEvent(touch("touchmove", [[100, 300]]));
    target.dispatchEvent(touch("touchend", []));
    for (let i = 0; i < 40; i++) {
      wait(16);
      expect(finger.scrolled()).toBe(true);
    }
    wait(FLING_GAP + 1);
    expect(finger.scrolled()).toBe(false);
  });

  it("滑完又點一下（點到的那一筆讓網站自己捲）：不是", () => {
    const { target, finger, wait } = setup();
    target.dispatchEvent(touch("touchstart", [[100, 500]]));
    target.dispatchEvent(touch("touchmove", [[100, 300]]));
    target.dispatchEvent(touch("touchend", []));
    wait(50);
    target.dispatchEvent(touch("touchstart", [[100, 400]]));
    target.dispatchEvent(touch("touchend", []));
    expect(finger.scrolled()).toBe(false);
  });

  it("兩根手指放開一根，另一根還按著在滑：還是", () => {
    const { target, finger } = setup();
    target.dispatchEvent(touch("touchstart", [[100, 500], [200, 500]]));
    target.dispatchEvent(touch("touchmove", [[100, 400], [200, 400]]));
    target.dispatchEvent(touch("touchend", [[200, 400]]));
    expect(finger.scrolled()).toBe(true);
  });

  it("沒碰螢幕（滑鼠滾輪、鍵盤、網站自己捲）：不是", () => {
    const { finger } = setup();
    expect(finger.scrolled()).toBe(false);
  });

  it("拿掉之後不再聽手指", () => {
    const { target, finger } = setup();
    finger.dispose();
    target.dispatchEvent(touch("touchstart", [[100, 500]]));
    target.dispatchEvent(touch("touchmove", [[100, 300]]));
    expect(finger.scrolled()).toBe(false);
  });
});
