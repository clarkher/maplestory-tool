/**
 * 文章 md 裡的產生區塊（v2.26）：<!-- gen:<key> --> 到 <!-- /gen --> 之間是程式從資料產的，外面是人寫的。
 * 頁面讀 md 時註解會拿掉、中間的字照畫（guide-markdown.ts），所以標記不會上頁面。
 */
const BLOCK = /<!-- gen:([a-z]+) -->\n([\s\S]*?)\n<!-- \/gen -->/g;

/** 換掉每個區塊的內容（前後各留一行空白，Markdown 才會分段）；檔案原本是 CRLF 換完還是 CRLF */
export function replaceGenSections(md: string, sections: Record<string, string>): { md: string; missing: string[] } {
  const crlf = md.includes("\r\n");
  const missing: string[] = [];
  const out = md.replace(/\r\n/g, "\n").replace(BLOCK, (whole, key: string) => {
    if (!(key in sections)) {
      missing.push(key);
      return whole;
    }
    return `<!-- gen:${key} -->\n\n${sections[key]}\n\n<!-- /gen -->`;
  });
  return { md: crlf ? out.replace(/\n/g, "\r\n") : out, missing };
}

export function readGenSections(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, key, body] of md.replace(/\r\n/g, "\n").matchAll(BLOCK)) out[key] = body.trim();
  return out;
}
