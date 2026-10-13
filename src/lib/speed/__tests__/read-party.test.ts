import { describe, expect, it } from "vitest";
import type { Frame } from "../frame";
import { findPartyTracks, readParty } from "../read-party";
import { findStatusBar } from "../status-bar";
import { loadFixture } from "./fixture";

/**
 * 基準截圖 window-1364.png（1×）量到的隊伍欄血條框：外緣 x 1296～1360，上亮線 y 569、下亮線 y 577（相距 8），
 * 三個框（0 自己、1 隊友、2 隊友）列距 17；自己填紅，兩個隊友填灰。畫紅色都畫在框裡面（離白邊 2px），不蓋到邊。
 */
const BOX = { x0: 1296, x1: 1360, topLine: 569, bottomLine: 577, pitch: 17 };

/** 第 i 個框的內部，放大 scale 倍；往裡縮取整，不碰到白邊和外圈的黑 */
function interior(i: number, scale: number) {
  const top = BOX.topLine + i * BOX.pitch;
  return {
    x0: Math.ceil((BOX.x0 + 2) * scale),
    x1: Math.floor((BOX.x1 - 2) * scale),
    y0: Math.ceil((top + 2) * scale),
    y1: Math.floor((BOX.bottomLine + i * BOX.pitch - 2) * scale),
  };
}

type Rect = { x0: number; x1: number; y0: number; y1: number };

function paintRect(frame: Frame, rect: Rect) {
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) frame.data.set([220, 20, 20, 255], (y * frame.width + x) * 4);
  }
}

/** 血條填色：從左邊填 fraction（1＝滿血；血量少時紅色變短，框不變） */
function fill(frame: Frame, i: number, scale: number, fraction = 1) {
  const box = interior(i, scale);
  const width = Math.max(2, Math.ceil((box.x1 - box.x0 + 1) * fraction));
  paintRect(frame, { ...box, x1: box.x0 + width - 1 });
}

/** 沒有框的紅條（x、y 是左上角） */
function bar(frame: Frame, x: number, y: number, w = 60, h = 6) {
  paintRect(frame, { x0: x, x1: x + w - 1, y0: y, y1: y + h - 1 });
}

const clone = (frame: Frame): Frame => ({ ...frame, data: new Uint8ClampedArray(frame.data) });

/** 把一塊畫面原樣貼到別的地方 */
function copyBlock(frame: Frame, from: Rect, dx: number, dy: number) {
  const source = clone(frame);
  for (let y = from.y0; y <= from.y1; y++) {
    for (let x = from.x0; x <= from.x1; x++) {
      const i = (y * frame.width + x) * 4;
      frame.data.set(source.data.subarray(i, i + 4), ((y + dy) * frame.width + x + dx) * 4);
    }
  }
}

const read = (frame: Frame) => readParty(frame, findStatusBar(frame)!);

describe("組隊人數：找隊伍欄的血條框", () => {
  it("基準截圖：認得出三個框，上亮線 569／586／603，左右 1297～1360", async () => {
    const frame = await loadFixture("window-1364.png");
    const tracks = findPartyTracks(frame, findStatusBar(frame)!).sort((a, b) => a.y0 - b.y0);
    expect(tracks.map(track => track.y0)).toEqual([569, 586, 603]);
    for (const track of tracks) {
      expect(track.x0).toBe(1297);
      expect(track.x1).toBe(1360);
    }
  });

  it.each([1.25, 1.5, 2])("放大 %s 倍：還是三個框，列距 17 × 倍率", async scale => {
    const frame = await loadFixture("window-1364.png", scale);
    const tracks = findPartyTracks(frame, findStatusBar(frame)!).sort((a, b) => a.y0 - b.y0);
    expect(tracks).toHaveLength(3);
    // 線落在像素的哪裡會差 1 格
    expect(Math.abs(tracks[1].y0 - tracks[0].y0 - 17 * scale)).toBeLessThanOrEqual(1);
    expect(Math.abs(tracks[2].y0 - tracks[1].y0 - 17 * scale)).toBeLessThanOrEqual(1);
  });
});

describe("組隊人數：數框裡有紅的", () => {
  it("基準截圖：三人隊伍，兩個隊友灰掉（不在線）→ 1", async () => {
    expect(read(await loadFixture("window-1364.png"))).toBe(1);
  });

  it("兩個灰的內部都塗紅（隊友在同一張圖）→ 3", async () => {
    const frame = await loadFixture("window-1364.png");
    fill(frame, 1, 1);
    fill(frame, 2, 1);
    expect(read(frame)).toBe(3);
  });

  it("紅－灰－紅：只有第三個框塗紅，中間灰的不能把串斷掉 → 2", async () => {
    const frame = await loadFixture("window-1364.png");
    fill(frame, 2, 1);
    expect(read(frame)).toBe(2);
  });

  it("紅－紅－灰：只有第二個框塗紅 → 2", async () => {
    const frame = await loadFixture("window-1364.png");
    fill(frame, 1, 1);
    expect(read(frame)).toBe(2);
  });

  it("低血量：第三個框只有左邊 25% 是紅的（紅色變短，框不變）→ 2", async () => {
    const frame = await loadFixture("window-1364.png");
    fill(frame, 2, 1, 0.25);
    expect(read(frame)).toBe(2);
  });

  it("血量剩 3%（紅色只有 2px 寬）也算在線 → 2", async () => {
    const frame = await loadFixture("window-1364.png");
    fill(frame, 2, 1, 0.03);
    expect(read(frame)).toBe(2);
  });

  it("血量不同的三人（滿、60%、10%）→ 3", async () => {
    const frame = await loadFixture("window-1364.png");
    fill(frame, 1, 1, 0.6);
    fill(frame, 2, 1, 0.1);
    expect(read(frame)).toBe(3);
  });
});

describe("組隊人數：沒有框的紅條不算", () => {
  it("掃描範圍內（x 1200、y 300）一條沒有框的紅條（怪物血條）→ 1", async () => {
    const frame = await loadFixture("window-1364.png");
    bar(frame, 1200, 300);
    expect(read(frame)).toBe(1);
  });

  it("兩條沒有框的紅條疊在一起、相距 17px → 1", async () => {
    const frame = await loadFixture("window-1364.png");
    bar(frame, 1200, 300);
    bar(frame, 1200, 317);
    expect(read(frame)).toBe(1);
  });

  it("隊伍欄正下方、同一欄位，兩條沒有框的紅條相距 17px → 1", async () => {
    const frame = await loadFixture("window-1364.png");
    bar(frame, 1298, 650, 61, 5);
    bar(frame, 1298, 667, 61, 5);
    expect(read(frame)).toBe(1);
  });

  it("單獨一個有框的紅條（沒有排成一串）→ 1", async () => {
    const frame = await loadFixture("window-1364.png");
    copyBlock(frame, { x0: 1290, x1: 1363, y0: 565, y1: 581 }, -190, -265);
    expect(read(frame)).toBe(1);
  });
});

describe("組隊人數：人數多寡", () => {
  /** 六人隊伍：把前三個框（含外圈黑）再貼一份接在下面，列距還是 17（3 號是自己那條的複本，本來就是紅的） */
  async function sixMembers() {
    const frame = await loadFixture("window-1364.png");
    copyBlock(frame, { x0: 1290, x1: 1363, y0: 568, y1: 618 }, 0, 51);
    return frame;
  }

  it("六個框全部塗紅 → 6", async () => {
    const frame = await sixMembers();
    for (const i of [1, 2, 3, 4, 5]) fill(frame, i, 1);
    expect(read(frame)).toBe(6);
  });

  it("六個框裡紅的是 0、2、3、4 號（其餘灰）→ 4", async () => {
    const frame = await sixMembers();
    for (const i of [2, 4]) fill(frame, i, 1);
    expect(read(frame)).toBe(4);
  });
});

describe("組隊人數：位置跟視窗大小都不能寫死", () => {
  it("整個隊伍欄搬到別的位置（x 1100、y 300 附近）一樣認得，隊友塗紅 → 3", async () => {
    const frame = await loadFixture("window-1364.png");
    copyBlock(frame, { x0: 1290, x1: 1363, y0: 560, y1: 620 }, -190, -260);
    for (const i of [1, 2]) {
      const box = interior(i, 1);
      paintRect(frame, { x0: box.x0 - 190, x1: box.x1 - 190, y0: box.y0 - 260, y1: box.y1 - 260 });
    }
    expect(read(frame)).toBe(3);
  });

  it.each([1.25, 1.5, 2])("放大 %s 倍：兩個灰的內部塗紅（座標跟著放大）→ 3", async scale => {
    const frame = await loadFixture("window-1364.png", scale);
    fill(frame, 1, scale);
    fill(frame, 2, scale);
    expect(read(frame)).toBe(3);
  });

  // 視窗大小隨便拉：0.90～2.50 每 0.05 一格，外加幾個小數點很零碎的倍率
  // （1px 的白線落在像素中間會被抹成兩列、各剩一半亮度；最差的幾格是 0.95、1.02、1.25）
  const SWEEP = [
    ...Array.from({ length: 33 }, (_, i) => Math.round((0.9 + i * 0.05) * 100) / 100),
    0.99, 1.01, 1.02, 1.08, 1.11, 1.33, 1.67,
  ];
  it.each(SWEEP)("縮放 %s 倍：基準 1、塗兩條紅 3、紅灰紅 2、低血量 2、框外紅條 1", async scale => {
    const base = await loadFixture("window-1364.png", scale);
    const status = findStatusBar(base)!;
    expect(readParty(base, status)).toBe(1);

    const both = clone(base);
    fill(both, 1, scale);
    fill(both, 2, scale);
    expect(readParty(both, status)).toBe(3);

    const rgr = clone(base);
    fill(rgr, 2, scale);
    expect(readParty(rgr, status)).toBe(2);

    const low = clone(base);
    fill(low, 2, scale, 0.25);
    expect(readParty(low, status)).toBe(2);

    const stray = clone(base);
    bar(stray, Math.round(1200 * scale), Math.round(300 * scale), Math.round(60 * scale), Math.round(6 * scale));
    bar(stray, Math.round(1200 * scale), Math.round(317 * scale), Math.round(60 * scale), Math.round(6 * scale));
    expect(readParty(stray, status)).toBe(1);
  });
});
