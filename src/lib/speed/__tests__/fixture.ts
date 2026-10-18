// src/lib/speed/__tests__/fixture.ts
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { Frame } from "../frame";
import { STATUS_FONT } from "../status-font";
import type { StatusBar } from "../status-bar";

/** 讀 __fixtures__ 的 PNG，scale ≠ 1 時用平滑縮放模擬別的視窗大小 */
export async function loadFixture(name: string, scale = 1): Promise<Frame> {
  const image = await loadImage(path.resolve(process.cwd(), "src/lib/speed/__fixtures__", name));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  return { width, height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

/** 一張畫面用平滑縮放放大縮小（跟 loadFixture 的 scale 一樣，給改過字的畫面用） */
export function scaleFrame(frame: Frame, scale: number): Frame {
  const source = createCanvas(frame.width, frame.height);
  const sourceContext = source.getContext("2d");
  const image = sourceContext.createImageData(frame.width, frame.height);
  image.data.set(frame.data);
  sourceContext.putImageData(image, 0, 0);
  const width = Math.round(frame.width * scale);
  const height = Math.round(frame.height * scale);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.drawImage(source, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  return { width, height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

/**
 * 大解析度（例如 1920×1080）的遊戲畫面：狀態列不跟著放大、置中貼在最下面，左右兩邊露出遊戲場景。
 * 2026-10-18 使用者實際的畫面就是這樣（天空之城，亮色磚地），找狀態列的程式把左邊的磚地當成 HP、MP，一直認不到。
 * 場景用固定亂數畫磚塊：米色、黃色（會被當成 EXP 的黃綠）、淺灰、白、紅、天藍，都是亮的；sky 時下面兩成再塗一大片天藍（會被當成 MP 的藍）。
 * 狀態列＝基準截圖最下面 panelRows 列（聊天列＋狀態列，含 EXP 那行字），整排照原寬貼在正中間。
 */
export function onScene(frame: Frame, width: number, height: number, options: { sky?: boolean; panelRows?: number } = {}): Frame {
  const data = new Uint8ClampedArray(width * height * 4);
  const palette: Array<[number, number, number]> = [
    [232, 214, 152],
    [240, 222, 96],
    [205, 205, 200],
    [250, 248, 236],
    [196, 48, 40],
    [120, 180, 235],
    [170, 150, 110],
  ];
  let seed = 20261018;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const tileW = 42;
  const tileH = 22;
  const colors = new Map<string, [number, number, number]>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const row = Math.floor(y / tileH);
      const col = Math.floor((x + (row % 2) * (tileW / 2)) / tileW);
      const key = `${row}:${col}`;
      if (!colors.has(key)) colors.set(key, palette[Math.floor(random() * palette.length)]);
      // 磚縫是淺褐（1 格，也算亮）：使用者的磚地整片都是亮的，從左邊數會先數到一大段磚地
      const seam = y % tileH === 0 || (x + (row % 2) * (tileW / 2)) % tileW === 0;
      const sky = options.sky && y >= height * 0.82 && y < height * 0.9;
      const [r, g, b] = sky ? [110, 175, 235] : seam ? [150, 138, 116] : colors.get(key)!;
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  const rows = options.panelRows ?? 70;
  const left = Math.floor((width - frame.width) / 2);
  for (let y = 0; y < rows; y++) {
    const from = ((frame.height - rows + y) * frame.width) * 4;
    const to = ((height - rows + y) * width + left) * 4;
    data.set(frame.data.subarray(from, from + frame.width * 4), to);
  }
  return { width, height, data };
}

/**
 * 在 1 倍的基準截圖上把 EXP 後面那串字換掉：「EXP」字樣右邊整塊塗成每一列的底色，再用遊戲的點陣字（STATUS_FONT）一個一個畫上去，
 * 字跟字隔 1 格（跟遊戲一樣）。基準截圖的經驗剛好沒有 8，要測全部數字只能這樣畫。
 * 位置照基準截圖量的：數字從 EXP 條左緣往右 30 格開始、上緣在條上方 12 格。
 */
export function paintExpLine(frame: Frame, bar: StatusBar, text: string): Frame {
  const data = new Uint8ClampedArray(frame.data);
  const x0 = bar.exp[0] + 26;
  const x1 = bar.exp[1];
  const top = bar.top - 12;
  for (let y = bar.top - 16; y < bar.top; y++) {
    const row: number[][] = [];
    for (let x = x0; x < x1; x++) {
      const i = (y * frame.width + x) * 4;
      row.push([data[i], data[i + 1], data[i + 2]]);
    }
    row.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
    const [r, g, b] = row[Math.floor(row.length / 2)];
    for (let x = x0; x < x1; x++) {
      const i = (y * frame.width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
  let x = bar.exp[0] + 30;
  for (const ch of text) {
    const glyph = STATUS_FONT[ch];
    if (!glyph) throw new Error(`狀態列沒有這個字：${ch}`);
    // 小數點在遊戲裡左右各多空 1 格、往上 1 格（基準截圖量的）
    const dot = ch === ".";
    if (dot) x += 1;
    glyph.rows.forEach((line, dy) => {
      for (let dx = 0; dx < line.length; dx++) {
        if (line[dx] !== "#") continue;
        const i = ((top + dy - (dot ? 1 : 0)) * frame.width + x + dx) * 4;
        [data[i], data[i + 1], data[i + 2]] = glyph.rgb;
      }
    });
    x += glyph.rows[0].length + 1 + (dot ? 1 : 0);
  }
  return { width: frame.width, height: frame.height, data };
}
