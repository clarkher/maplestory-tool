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
