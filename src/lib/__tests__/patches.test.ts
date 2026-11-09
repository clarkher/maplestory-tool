import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listPatchPages, getPatchPage, patchProblems, cardIcons, type PatchPage } from "../patches";

let dataDir = "";
let contentDir = "";

const patchFile = (version: string, date: string) => ({
  version, prev: null, base: "a", head: "b", date,
  counts: { items: 3, looks: 0, quests: 0, monsters: 0, maps: 0, changed: 1, goneItems: 0, goneLooks: 0, goneQuests: 0 },
  added: {
    items: [1, 2, 3, 4, 5, 6, 7, 8].map(id => ({ id, n: `道具${id}`, c: "裝備", s: "帽子" })),
    quests: [], monsters: [], maps: [],
  },
  changed: [{ id: 50, n: "改過的", kind: "price", before: "1", after: "2" }],
  gone: { items: [], quests: [] },
});

const hl = (ids: number[]) => ids.map(id => `- ${id} | 標題${id} | 小字${id}`).join("\n");

beforeAll(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "patches-"));
  dataDir = path.join(root, "data");
  contentDir = path.join(root, "content");
  fs.mkdirSync(dataDir);
  fs.mkdirSync(contentDir);
  fs.writeFileSync(path.join(dataDir, "1.0.0.json"), JSON.stringify(patchFile("1.0.0", "2026-10-15")));
  fs.writeFileSync(path.join(dataDir, "1.1.0.json"), JSON.stringify(patchFile("1.1.0", "2026-10-20")));
  fs.writeFileSync(path.join(dataDir, "1.2.0.json"), JSON.stringify(patchFile("1.2.0", "2026-10-25")));
  fs.writeFileSync(path.join(contentDir, "1.0.0.md"), `---\ntitle: 舊版\n---\n${hl([1, 2, 3, 4])}\n`);
  fs.writeFileSync(path.join(contentDir, "1.1.0.md"), `---\ntitle: 新版\ndate: 2026-10-08\n---\n${hl([1, 2, 3, 4])}\n`);
});

describe("listPatchPages / getPatchPage", () => {
  it("沒重點檔的版本不出現，新到舊", () => {
    const pages = listPatchPages({ dataDir, contentDir });
    expect(pages.map(p => p.version)).toEqual(["1.1.0", "1.0.0"]);
  });
  it("不存在的版本回 null；有資料沒重點檔也回 null", () => {
    expect(getPatchPage("不存在", { dataDir, contentDir })).toBeNull();
    expect(getPatchPage("1.2.0", { dataDir, contentDir })).toBeNull();
  });
  it("dateText：沒寫 date 用收錄日；有寫 date 用官方日", () => {
    const a = getPatchPage("1.0.0", { dataDir, contentDir })!;
    expect(a.dateText).toBe("10/15 收錄");
    expect(a.officialDate).toBe(false);
    const b = getPatchPage("1.1.0", { dataDir, contentDir })!;
    expect(b.dateText).toBe("10/8");
    expect(b.officialDate).toBe(true);
    expect(b.title).toBe("新版");
    expect(b.highlights[0]).toEqual({ icon: 1, title: "標題1", sub: "小字1" });
  });
  it("只有一個版本時只回一頁", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "patches1-"));
    const d = path.join(root, "d"), c = path.join(root, "c");
    fs.mkdirSync(d); fs.mkdirSync(c);
    fs.writeFileSync(path.join(d, "1.0.0.json"), JSON.stringify(patchFile("1.0.0", "2026-10-15")));
    fs.writeFileSync(path.join(c, "1.0.0.md"), `---\ntitle: 唯一\n---\n${hl([1, 2, 3, 4])}\n`);
    expect(listPatchPages({ dataDir: d, contentDir: c }).length).toBe(1);
  });
  it("contentDir 不存在也不炸", () => {
    expect(listPatchPages({ dataDir, contentDir: path.join(contentDir, "nope") })).toEqual([]);
  });
});

describe("patchProblems", () => {
  const base = () => getPatchPage("1.0.0", { dataDir, contentDir })!;
  it("正常沒問題", () => expect(patchProblems(base())).toEqual([]));
  it("重點不是 4 條", () => {
    const p: PatchPage = { ...base(), highlights: base().highlights.slice(0, 3) };
    expect(patchProblems(p).join()).toMatch(/4/);
  });
  it("icon 不在新增也不在改動", () => {
    const p: PatchPage = { ...base(), highlights: base().highlights.map((h, i) => (i === 0 ? { ...h, icon: 999 } : h)) };
    expect(patchProblems(p).join()).toMatch(/999/);
  });
  it("icon 在 changed 裡也算", () => {
    const p: PatchPage = { ...base(), highlights: base().highlights.map((h, i) => (i === 0 ? { ...h, icon: 50 } : h)) };
    expect(patchProblems(p)).toEqual([]);
  });
  it("title 沒填", () => {
    expect(patchProblems({ ...base(), title: "" }).join()).toMatch(/title/);
  });
});

describe("cardIcons", () => {
  const page = () => getPatchPage("1.0.0", { dataDir, contentDir })!;
  it("先重點 icon，再補 added.items，滿 6 個不重複", () => {
    expect(cardIcons(page(), () => true)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("has 為 false 的跳過", () => {
    expect(cardIcons(page(), id => id !== 2 && id !== 5)).toEqual([1, 3, 4, 6, 7, 8]);
  });
  it("重點 icon 排前面", () => {
    const p: PatchPage = { ...page(), highlights: [{ icon: 8, title: "a", sub: "" }, { icon: 7, title: "b", sub: "" }, { icon: 8, title: "c", sub: "" }, { icon: 1, title: "d", sub: "" }] };
    expect(cardIcons(p, () => true)).toEqual([8, 7, 1, 2, 3, 4]);
  });
});

describe("真資料", () => {
  it("每一頁 patchProblems 都是空（還沒有重點檔時回空陣列也算過）", () => {
    for (const p of listPatchPages()) expect(patchProblems(p), p.version).toEqual([]);
  });
});
