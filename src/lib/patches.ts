/**
 * 改版整理（v1.94）：差異檔 public/data/patches/<版本>.json（機器產的）＋ 重點檔 src/content/patches/<版本>.md（人寫的）。
 * 沒有重點檔的版本不出現在站上。fs 只在伺服器端（建置時）讀，不要從 client 元件 import。
 *
 * 重點檔格式：
 *   ---
 *   title: 萬聖節祭典、冰原雪域任務
 *   date: 2026-10-15        （官方日期，可省略；省略時顯示「M/D 收錄」用差異檔的日期）
 *   ---
 *   - 4310522 | 萬聖節「雪原的面具祭典」 | 83 個活動任務、萬聖節硬幣換道具
 *   本文每行一條重點：`道具 id | 標題 | 小字`，剛好 4 行；id 要在該版新增或改動的道具裡。
 */
import fs from "node:fs";
import path from "node:path";

export type PatchFile = {
  version: string;
  prev: string | null;
  base: string;
  head: string;
  date: string;
  counts: {
    items: number; looks: number; quests: number; monsters: number; maps: number;
    changed: number; goneItems: number; goneLooks: number; goneQuests: number;
  };
  added: {
    items: { id: number; n: string; c: string; s: string; lv?: number }[];
    quests: { id: number; n: string; cat: string; minLv?: number; area?: string }[];
    monsters: { id: number; n: string; lv: number }[];
    maps: { id: number; zh: string; st: string }[];
  };
  changed: { id: number; n: string; kind: string; before: string; after: string }[];
  gone: { items: { id: number; n: string }[]; quests: { id: number; n: string }[] };
};

export type Highlight = { icon: number; title: string; sub: string };
export type PatchPage = PatchFile & {
  title: string;
  highlights: Highlight[];
  /** "10/15"（官方日期）或 "10/15 收錄" */
  dateText: string;
  officialDate: boolean;
};
type Opts = { dataDir?: string; contentDir?: string };

const defaultDataDir = () => path.join(process.cwd(), "public", "data", "patches");
const defaultContentDir = () => path.join(process.cwd(), "src", "content", "patches");

/** "2026-10-15" → "10/15"（不補零）；格式不對回原字串 */
function monthDay(date: string): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(date.trim());
  return m ? `${Number(m[2])}/${Number(m[3])}` : date.trim();
}

function parseHighlightFile(source: string): { meta: Record<string, string>; highlights: Highlight[] } {
  const text = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const meta: Record<string, string> = {};
  let body = text;
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (fm) {
    body = text.slice(fm[0].length);
    for (const line of fm[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  const highlights: Highlight[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim().replace(/^[-*]\s+/, "");
    if (!raw.trim().startsWith("-") && !raw.trim().startsWith("*")) continue;
    const [id, title = "", ...rest] = line.split("|").map(s => s.trim());
    highlights.push({ icon: Number(id), title, sub: rest.join(" | ") });
  }
  return { meta, highlights };
}

function readPage(version: string, dataDir: string, contentDir: string): PatchPage | null {
  // 版本字串直接進檔名，擋掉路徑字元
  if (!/^[\w.-]+$/.test(version)) return null;
  const mdPath = path.join(contentDir, `${version}.md`);
  const jsonPath = path.join(dataDir, `${version}.json`);
  if (!fs.existsSync(mdPath) || !fs.existsSync(jsonPath)) return null;
  const file = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as PatchFile;
  const { meta, highlights } = parseHighlightFile(fs.readFileSync(mdPath, "utf8"));
  const official = Boolean(meta.date);
  return {
    ...file,
    title: meta.title ?? "",
    highlights,
    dateText: official ? monthDay(meta.date) : `${monthDay(file.date)} 收錄`,
    officialDate: official,
  };
}

/** 只回有重點檔的版本，新到舊（先比差異檔日期，同日比版本號） */
export function listPatchPages(opts: Opts = {}): PatchPage[] {
  const dataDir = opts.dataDir ?? defaultDataDir();
  const contentDir = opts.contentDir ?? defaultContentDir();
  if (!fs.existsSync(contentDir)) return [];
  const pages: PatchPage[] = [];
  for (const f of fs.readdirSync(contentDir)) {
    if (!f.endsWith(".md")) continue;
    const page = readPage(f.slice(0, -3), dataDir, contentDir);
    if (page) pages.push(page);
  }
  const num = (v: string) => v.split(".").map(Number);
  const cmpVersion = (a: string, b: string) => {
    const x = num(a), y = num(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
    return 0;
  };
  return pages.sort((a, b) => b.date.localeCompare(a.date) || cmpVersion(b.version, a.version));
}

export function getPatchPage(version: string, opts: Opts = {}): PatchPage | null {
  return readPage(version, opts.dataDir ?? defaultDataDir(), opts.contentDir ?? defaultContentDir());
}

/** 重點檔的毛病；空陣列＝沒問題 */
export function patchProblems(page: PatchPage): string[] {
  const out: string[] = [];
  if (!page.title.trim()) out.push(`${page.version}：title 沒填`);
  if (page.highlights.length !== 4) out.push(`${page.version}：重點要剛好 4 條，現在 ${page.highlights.length} 條`);
  const known = new Set<number>([...page.added.items.map(i => i.id), ...page.changed.map(c => c.id)]);
  for (const h of page.highlights) {
    if (!known.has(h.icon)) out.push(`${page.version}：重點「${h.title}」的圖示 ${h.icon} 不在新增或改動的道具裡`);
  }
  return out;
}

/** 卡片上的 6 個小圖：先重點的 icon，再補該版新增道具（要有圖、不重複） */
export function cardIcons(page: PatchPage, has: (id: number) => boolean): number[] {
  const out: number[] = [];
  const take = (id: number) => {
    if (out.length < 6 && !out.includes(id) && has(id)) out.push(id);
  };
  for (const h of page.highlights) take(h.icon);
  for (const i of page.added.items) take(i.id);
  return out;
}

/** 最新一版的日期（YYYY-MM-DD）：有重點檔的版本先算；一個都沒有時退回差異檔總表 index.json 最新的一版 */
export function latestPatchDate(opts: Opts = {}): string {
  const first = listPatchPages(opts)[0];
  if (first) return first.date;
  const indexPath = path.join(opts.dataDir ?? defaultDataDir(), "index.json");
  if (!fs.existsSync(indexPath)) return "";
  const versions = (JSON.parse(fs.readFileSync(indexPath, "utf8")).versions ?? []) as { date: string }[];
  return versions.map(v => v.date).sort().at(-1) ?? "";
}
