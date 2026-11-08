import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// marks.json 跟圖集都是 scripts/client/guild-mark.py 從台服客戶端切出來的；這裡驗產出的形狀，客戶端改版重跑後一樣要過
type MarkEntry = { id: number; row: number; colours: number[]; box: number[] };
type MarksJson = {
  atlas: string;
  cell: number;
  backgrounds: MarkEntry[];
  marks: Record<"Animal" | "Plant" | "Pattern" | "Letter" | "Etc", MarkEntry[]>;
  bgSwatches: string[];
  markSwatches: string[];
};

const file = join(process.cwd(), "src/lib/guild-mark/marks.json");
const data = (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null) as MarksJson | null;
const ALL16 = Array.from({ length: 16 }, (_, i) => i + 1);

describe("marks.json（公會徽章索引）", () => {
  it("檔案存在", () => {
    expect(data, "先跑 python -E -P scripts/client/guild-mark.py").not.toBeNull();
  });

  it("底圖 31 個，id 從 1000 連到 1030", () => {
    expect(data!.cell).toBe(17);
    expect(data!.backgrounds.map((b) => b.id)).toEqual(Array.from({ length: 31 }, (_, i) => 1000 + i));
  });

  it("圖案各分類數量、頭尾 id", () => {
    const m = data!.marks;
    expect(Object.keys(m)).toEqual(["Animal", "Plant", "Pattern", "Letter", "Etc"]);
    expect([m.Animal.length, m.Plant.length, m.Pattern.length, m.Letter.length, m.Etc.length]).toEqual([21, 7, 22, 36, 27]);
    expect(m.Animal[0].id).toBe(2000);
    expect(m.Etc[m.Etc.length - 1].id).toBe(9026);
  });

  it("顏色：9026 只有第 1 色，其餘都是 1～16", () => {
    const all = [...data!.backgrounds, ...Object.values(data!.marks).flat()];
    for (const e of all) expect(e.colours, String(e.id)).toEqual(e.id === 9026 ? [1] : ALL16);
    for (const e of all) {
      const [x, y, w, h] = e.box;
      expect(w > 0 && h > 0 && x >= 0 && y >= 0 && x + w <= 17 && y + h <= 17, `${e.id} box`).toBe(true);
    }
  });

  it("row 不重複、0～143 全用到；底圖在前", () => {
    const all = [...data!.backgrounds, ...Object.values(data!.marks).flat()];
    const rows = all.map((e) => e.row).sort((a, b) => a - b);
    expect(rows).toEqual(Array.from({ length: 144 }, (_, i) => i));
    expect(data!.backgrounds.map((b) => b.row)).toEqual(Array.from({ length: 31 }, (_, i) => i));
  });

  it("圖集檔存在、272×2448、檔名雜湊對得上", () => {
    const m = data!.atlas.match(/^\/assets\/guild-mark\/marks-([0-9a-f]{10})\.png$/);
    expect(m, data!.atlas).not.toBeNull();
    const png = join(process.cwd(), "public", data!.atlas);
    expect(existsSync(png)).toBe(true);
    const buf = readFileSync(png);
    // PNG 開頭 8 bytes 簽章，接著 IHDR：長度 4＋"IHDR" 4＋寬 4＋高 4
    expect(buf.toString("latin1", 12, 16)).toBe("IHDR");
    expect(buf.readUInt32BE(16)).toBe(16 * 17);
    expect(buf.readUInt32BE(20)).toBe(144 * 17);
    expect(createHash("sha256").update(buf).digest("hex").slice(0, 10)).toBe(m![1]);
  });

  it("兩套色票各 16 個 #rrggbb、而且不完全一樣", () => {
    for (const s of [data!.bgSwatches, data!.markSwatches]) {
      expect(s).toHaveLength(16);
      for (const c of s) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(data!.bgSwatches).not.toEqual(data!.markSwatches);
  });
});
