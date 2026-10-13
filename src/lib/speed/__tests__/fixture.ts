// src/lib/speed/__tests__/fixture.ts
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { Frame } from "../frame";

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
