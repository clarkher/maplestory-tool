// src/lib/speed/names.ts
import { bbox, grid, type Mask } from "./ink";

/** public/data/speed-names.json：[字, 寬高比, 格子（每格一個 0–f）]，行高 8 格、每個字 8 格寬 */
export type RawSpeedNames = { jobFont: string; titleFont: string; gh: number; cell: number; jobs: [string, number, string][]; titles: [string, number, string][] };
export type NameEntry = { text: string; aspect: number; gw: number; grid: Float32Array };
export type SpeedNames = { gh: number; jobs: NameEntry[]; titles: NameEntry[] };
export type Ranked = { text: string; d: number };

function entry([text, aspect, cells]: [string, number, string], gh: number): NameEntry {
  const values = new Float32Array(cells.length);
  for (let i = 0; i < cells.length; i++) values[i] = parseInt(cells[i], 16) / 15;
  return { text, aspect, gw: values.length / gh, grid: values };
}

export function parseNames(raw: RawSpeedNames): SpeedNames {
  return { gh: raw.gh, jobs: raw.jobs.map(row => entry(row, raw.gh)), titles: raw.titles.map(row => entry(row, raw.gh)) };
}

/**
 * 一行字跟名單裡每個名字比（整行縮成格子比平均平方差，加寬高比差），差最小的排前面。
 * 名單是封閉的（職業幾十個、地圖幾百個），選最像的就好，不用真的認字。
 */
export function rankText(mask: Mask, entries: NameEntry[], gh: number): Ranked[] {
  const box = bbox(mask);
  if (!box || box.y1 - box.y0 < 4) return [];
  const aspect = (box.x1 - box.x0) / (box.y1 - box.y0);
  const seen = new Map<number, Float32Array>();
  const ranked = entries.map(candidate => {
    let cells = seen.get(candidate.gw);
    if (!cells) {
      cells = grid(mask, box, candidate.gw, gh);
      seen.set(candidate.gw, cells);
    }
    let diff = 0;
    for (let i = 0; i < cells.length; i++) diff += (cells[i] - candidate.grid[i]) ** 2;
    return { text: candidate.text, d: diff / cells.length + 0.4 * Math.abs(Math.log(aspect / candidate.aspect)) };
  });
  return ranked.sort((a, b) => a.d - b.d);
}
