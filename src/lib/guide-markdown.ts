/**
 * 一般攻略文（v1.88 起，不是「職業×等級」那種）：src/content/guides/<slug>.md，建置時讀成區塊再畫。
 * 只認站上文章會用到的 Markdown：開頭 --- 設定 ---、## ### 標題、段落、- 1. 清單、| 表格 |、> 引言框、![圖](路徑)、---、**粗體**、[連結](網址)。
 * 不認的寫法照原文當段落，不會吃掉字；<!-- 註解 --> 拿掉。新文章丟一個 .md 進資料夾，攻略列表、sitemap 自動列。
 */
export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; c: Inline[] }
  | { t: "a"; href: string; c: Inline[] }
  | { t: "img"; src: string; alt: string };

export type Block =
  | { t: "h"; level: 2 | 3; id: string; c: Inline[] }
  | { t: "p"; c: Inline[] }
  | { t: "list"; ordered: boolean; start?: number; items: Inline[][] }
  | { t: "table"; head: Inline[][]; rows: Inline[][][] }
  | { t: "quote"; c: Block[] }
  | { t: "img"; src: string; alt: string }
  | { t: "hr" };

export type GuideMeta = {
  title: string;
  description: string;
  category: string;
  tags: string[];
  published: string;
  updated: string;
  heroAlt: string;
  /** 文末「接著看」手動指定的頁（related: /guides/a, /guide），排在自動配的前面（v2.19，guide-related.ts） */
  related: string[];
};

export type GuideDoc = GuideMeta & { slug: string; blocks: Block[] };

/** 行內：粗體、連結、圖片；括號沒配對就當一般字 */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  const push = (v: string) => {
    if (!v) return;
    const last = out.at(-1);
    if (last?.t === "text") last.v += v;
    else out.push({ t: "text", v });
  };
  const pattern = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*/;
  while (rest) {
    const m = pattern.exec(rest);
    if (!m) {
      push(rest);
      break;
    }
    push(rest.slice(0, m.index));
    if (m[2] !== undefined) out.push({ t: "img", alt: m[1], src: m[2] });
    else if (m[4] !== undefined) out.push({ t: "a", href: m[4], c: parseInline(m[3]) });
    else out.push({ t: "b", c: parseInline(m[5]) });
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

/** 標題的錨點：拿掉標點空白，留中英數（同一篇重複的補 -2、-3） */
function anchor(text: string, used: Map<string, number>): string {
  const base = text.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "section";
  const n = (used.get(base) ?? 0) + 1;
  used.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());

/** 標題的純文字：拿掉粗體、連結只留字（錨點不帶網址） */
const plainHeading = (text: string) => text.replace(/\*\*/g, "").replace(/!?\[([^\]]*)\]\([^)\s]+\)/g, "$1");

/** 正文（不含設定區）→ 區塊；第一個 # 大標拿掉（頁面自己畫標題），之後的 # 當 ## */
export function parseBlocks(body: string, used = new Map<string, number>(), state = { h1: false }): Block[] {
  // <!-- 註解 --> 是寫給自己看的（圖說草稿、待查），不上頁面
  const lines = body.replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, "").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^#\s/.test(line) && !state.h1) {
      state.h1 = true;
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const text = heading[2].trim();
      blocks.push({ t: "h", level: Math.max(2, heading[1].length) as 2 | 3, id: anchor(plainHeading(text), used), c: parseInline(text) });
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const inner: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) inner.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push({ t: "quote", c: parseBlocks(inner.join("\n"), used, state) });
      continue;
    }
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = cells(line).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]).map(parseInline));
      blocks.push({ t: "table", head, rows });
      continue;
    }
    const image = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line.trim());
    if (image) {
      blocks.push({ t: "img", alt: image[1], src: image[2] });
      i++;
      continue;
    }
    const bullet = /^\s*(?:[-*]|(\d+)\.)\s+/;
    if (bullet.test(line)) {
      const first = bullet.exec(line)![1];
      const ordered = Boolean(first);
      const items: Inline[][] = [];
      while (i < lines.length) {
        // 項目中間隔一行空白還是同一個清單
        if (!lines[i].trim() && i + 1 < lines.length && bullet.test(lines[i + 1]) && Boolean(bullet.exec(lines[i + 1])![1]) === ordered) i++;
        if (!bullet.test(lines[i])) break;
        const m = bullet.exec(lines[i])!;
        if (Boolean(m[1]) !== ordered) break;
        let text = lines[i++].slice(m[0].length);
        // 縮排的下一行接在同一項
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !bullet.test(lines[i])) text += lines[i++].trim();
        items.push(parseInline(text));
      }
      // 有序清單從幾號開始（中間被段落打斷、接著寫 3. 的要從 3 開始）
      blocks.push(ordered && Number(first) !== 1 ? { t: "list", ordered, start: Number(first), items } : { t: "list", ordered, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|\||!\[|\s*(?:[-*]|\d+\.)\s|-{3,}\s*$)/.test(lines[i])) para.push(lines[i++].trim());
    if (!para.length) para.push(lines[i++].trim());
    blocks.push({ t: "p", c: parseInline(para.join("")) });
  }
  return blocks;
}

/** 設定區：一行一個 key: value；tags 用逗號分 */
export function parseGuide(slug: string, source: string): GuideDoc {
  const text = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) throw new Error(`${slug}.md 開頭要有 --- 設定區 ---`);
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  for (const key of ["title", "description", "category", "published", "updated", "heroAlt"]) {
    if (!meta[key]) throw new Error(`${slug}.md 設定區少 ${key}`);
  }
  return {
    slug,
    title: meta.title,
    description: meta.description,
    category: meta.category,
    tags: (meta.tags ?? "").split(/[,，]/).map(tag => tag.trim()).filter(Boolean),
    published: meta.published,
    updated: meta.updated,
    heroAlt: meta.heroAlt,
    related: (meta.related ?? "").split(/[,，]/).map(link => link.trim()).filter(Boolean),
    blocks: parseBlocks(text.slice(m[0].length)),
  };
}

/** 文章裡用到的所有圖（檢查檔案存在用） */
export function guideImages(blocks: Block[]): string[] {
  const out: string[] = [];
  const inline = (nodes: Inline[]) => nodes.forEach(node => (node.t === "img" ? out.push(node.src) : "c" in node ? inline(node.c) : null));
  for (const block of blocks) {
    if (block.t === "img") out.push(block.src);
    else if (block.t === "quote") out.push(...guideImages(block.c));
    else if (block.t === "p" || block.t === "h") inline(block.c);
    else if (block.t === "list") block.items.forEach(inline);
    else if (block.t === "table") [block.head, ...block.rows].forEach(row => row.forEach(inline));
  }
  return out;
}

/** 全文純文字（檢查「楓之谷經典版」有沒有寫到內文用） */
export function guideText(blocks: Block[]): string {
  const inline = (nodes: Inline[]): string => nodes.map(node => (node.t === "text" ? node.v : node.t === "img" ? "" : inline(node.c))).join("");
  return blocks
    .map(block => {
      if (block.t === "quote") return guideText(block.c);
      if (block.t === "p" || block.t === "h") return inline(block.c);
      if (block.t === "list") return block.items.map(inline).join("\n");
      if (block.t === "table") return [block.head, ...block.rows].map(row => row.map(inline).join(" ")).join("\n");
      return "";
    })
    .join("\n");
}

/** 一篇的防呆：回錯誤（空＝過） */
export function guideProblems(doc: GuideDoc, fileExists: (publicPath: string) => boolean): string[] {
  const errors: string[] = [];
  if (!doc.title.includes("楓之谷經典版")) errors.push(`${doc.slug}：標題要寫「楓之谷經典版」`);
  if (!guideText(doc.blocks).includes("楓之谷經典版")) errors.push(`${doc.slug}：內文要寫「楓之谷經典版」`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.published) || !/^\d{4}-\d{2}-\d{2}$/.test(doc.updated)) errors.push(`${doc.slug}：published、updated 要 YYYY-MM-DD`);
  for (const src of guideImages(doc.blocks)) if (!src.startsWith("/") || !fileExists(src)) errors.push(`${doc.slug}：圖不存在 ${src}`);
  return errors;
}
