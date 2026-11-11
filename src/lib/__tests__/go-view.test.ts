import { describe, expect, it } from "vitest";
import { RING, doorLayout, doorViewport, exitSide, pickDoor, viewPercent, type GoDoors } from "@/lib/go-view";

const doors: GoDoors = {
  "10": { b: [-500, -1000, 2000, 2000], d: { "20": [[1400, 300]], "5": [[-400, 300]], "30": [[0, -800], [900, 250]] } },
};

describe("挑這一段要走的門", () => {
  it("照目的地拿座標", () => {
    expect(pickDoor(doors, 10, 20)).toEqual([1400, 300]);
  });
  it("同一個目的地好幾個門：挑離進來位置最近的，不知道進來位置拿第一個", () => {
    expect(pickDoor(doors, 10, 30)).toEqual([0, -800]);
    expect(pickDoor(doors, 10, 30, [1000, 300])).toEqual([900, 250]);
  });
  it("這張圖沒資料、或沒有通往那裡的門座標：null", () => {
    expect(pickDoor(doors, 99, 20)).toBeNull();
    expect(pickDoor(doors, 10, 77)).toBeNull();
    expect(pickDoor(null, 10, 20)).toBeNull();
  });
});

describe("放大出口附近的範圍（遊戲座標，比例固定）", () => {
  const b: [number, number, number, number] = [-500, -1000, 4000, 2000];
  it("高度最多 760，寬照比例；門在橫向正中、直向偏下（上面留位置給標籤）", () => {
    const view = doorViewport(b, [1000, 0], 7 / 4);
    expect(view.h).toBe(760);
    expect(view.w).toBeCloseTo(1330);
    expect(view.x).toBeCloseTo(1000 - 665);
    expect(view.y).toBeCloseTo(0 - 760 * 0.6);
  });
  it("門靠邊時範圍貼著地圖邊，不超出去", () => {
    const view = doorViewport(b, [3300, 800], 7 / 4);
    expect(view.x + view.w).toBeCloseTo(3500);
    expect(view.y + view.h).toBeCloseTo(1000);
    const left = doorViewport(b, [-300, -800], 7 / 4);
    expect(left.x).toBe(-500);
    expect(left.y).toBe(-1000);
  });
  it("門就在地圖邊上：範圍往外讓到整個圈都在畫面裡（圈半徑＝寬的 6.5%，多留兩成）", () => {
    const room = ((1330 * RING) / 200) * 1.2;
    const corner = doorViewport(b, [-500, -1000], 7 / 4);
    expect(corner.x).toBeCloseTo(-500 - room);
    expect(corner.y).toBeCloseTo(-1000 - room);
    const far = doorViewport(b, [3500, 1000], 7 / 4);
    expect(far.x + far.w).toBeCloseTo(3500 + room);
    expect(far.y + far.h).toBeCloseTo(1000 + room);
  });
  it("地圖比範圍小：縮到整張圖放得進去，比例不變", () => {
    const small: [number, number, number, number] = [0, 0, 700, 600];
    const view = doorViewport(small, [100, 500], 7 / 4);
    expect(view.w).toBe(700);
    expect(view.h).toBeCloseTo(400);
    expect(view.x).toBe(0);
    expect(view.y + view.h).toBeCloseTo(600);
    const flat: [number, number, number, number] = [0, 0, 3000, 300];
    const wide = doorViewport(flat, [1500, 200], 7 / 4);
    expect(wide.h).toBe(300);
    expect(wide.w).toBeCloseTo(525);
  });
  it("點換成範圍裡的百分比", () => {
    const view = { x: 0, y: 0, w: 1000, h: 500 };
    expect(viewPercent(view, [250, 400])).toEqual({ left: 25, top: 80, inside: true });
    expect(viewPercent(view, [1200, 400]).inside).toBe(false);
  });
});

describe("圈起來的門在整張圖的哪一邊（跟角落小圖一致，不看門名）", () => {
  const b: [number, number, number, number] = [0, 0, 1000, 1000];
  it("橫向前、後四分之一是左邊、右邊；其餘看高度", () => {
    expect(exitSide(b, [200, 500], [])).toBe("左邊");
    expect(exitSide(b, [800, 500], [])).toBe("右邊");
    expect(exitSide(b, [500, 100], [])).toBe("上面");
    expect(exitSide(b, [500, 900], [])).toBe("下面");
    expect(exitSide(b, [500, 500], [])).toBe("中間");
  });
  it("貼著邊（15% 以內）、查得到位置的門裡沒有更靠邊的才說「最」", () => {
    expect(exitSide(b, [950, 500], [[950, 500], [100, 0]])).toBe("最右邊");
    expect(exitSide(b, [50, 500], [[50, 500], [900, 0]])).toBe("最左邊");
    expect(exitSide(b, [900, 500], [[900, 500], [960, 0]])).toBe("右邊");
    expect(exitSide(b, [800, 500], [[800, 500]])).toBe("右邊");
  });
});

describe("圈、標籤、角落小圖互不蓋到（圖框百分比）", () => {
  const aspect = 7 / 4;
  it("標籤貼圈的上緣；門太靠上改貼下緣", () => {
    const mid = doorLayout({ left: 50, top: 60 }, aspect, 6, null);
    expect(mid.labelBelow).toBe(false);
    expect(mid.labelTop).toBeCloseTo(60 - (RING * aspect) / 2 - 2);
    const high = doorLayout({ left: 50, top: 10 }, aspect, 6, null);
    expect(high.labelBelow).toBe(true);
    expect(high.labelTop).toBeCloseTo(10 + (RING * aspect) / 2 + 2);
  });
  it("小圖放出口另一邊的上角", () => {
    expect(doorLayout({ left: 85, top: 60 }, aspect, 6, { w: 30, h: 20 }).corner).toBe("top-left");
    expect(doorLayout({ left: 15, top: 60 }, aspect, 6, { w: 30, h: 20 }).corner).toBe("top-right");
  });
  it("上角會蓋到標籤（門在中間偏上、地名長）就換下角；四個角都不行就不放", () => {
    expect(doorLayout({ left: 55, top: 45 }, aspect, 12, { w: 30, h: 30 }).corner).toBe("bottom-left");
    expect(doorLayout({ left: 50, top: 50 }, aspect, 14, { w: 45, h: 45 }).corner).toBeNull();
  });
  it("不放小圖（整張圖都看得到）時 corner 是 null", () => {
    expect(doorLayout({ left: 50, top: 60 }, aspect, 6, null).corner).toBeNull();
  });
});
