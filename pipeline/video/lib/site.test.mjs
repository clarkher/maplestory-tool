import test from "node:test";
import assert from "node:assert/strict";
import { matchSitePage, sitePages, utmUrl, withCta, DEFAULT_CTA } from "./site.mjs";
import { factTokens } from "./facts.mjs";

test("sitePages 順序與內容", () => {
  const p = sitePages();
  assert.equal(p[0].path, "/plan/leaf");
  assert.deepEqual(p.map((x) => x.path), ["/plan/leaf", "/plan/avatar", "/guides", "/updates"]);
  for (const x of p) assert.ok(x.title && x.summary && x.keywords.length && !/\d/.test(x.summary));
});

test("matchSitePage：標題優先，其次內文，都沒有 null", () => {
  const p = sitePages();
  assert.equal(matchSitePage("楓葉商會開張", "", p).path, "/plan/leaf");
  assert.equal(matchSitePage("閃亮彗星", "", p).path, "/plan/avatar");
  assert.equal(matchSitePage("週年慶活動", "", p).path, "/guides");
  assert.equal(matchSitePage("V003 改版內容預告", "", p).path, "/updates");
  assert.equal(matchSitePage("公告", "內文提到楓葉商會", p).path, "/plan/leaf");
  assert.equal(matchSitePage("標題在更新", "內文有轉蛋", p).path, "/updates");
  assert.equal(matchSitePage("無關", "無關", p), null);
});

test("utmUrl", () => {
  assert.equal(utmUrl("/plan/leaf", "84140"),
    "https://maplehelper.tw/plan/leaf?utm_source=youtube&utm_medium=video&utm_campaign=announce-84140");
});

test("每頁都有 cta、沒有數字（不用過來源比對）", () => {
  const ctas = Object.fromEntries(sitePages().map((p) => [p.path, p.cta]));
  assert.deepEqual(ctas, {
    "/plan/leaf": "每天換什麼、去哪打幣，楓谷幫手的楓葉規劃器幫你排好",
    "/plan/avatar": "想先看穿起來的樣子，楓谷幫手的紙娃娃可以直接試穿",
    "/guides": "練功、任務攻略都整理在楓谷幫手網站",
    "/updates": "每次改版改了什麼，楓谷幫手網站都有整理",
  });
  assert.equal(DEFAULT_CTA, "更多遊戲資料都在楓谷幫手網站");
  for (const c of [...Object.values(ctas), DEFAULT_CTA]) assert.deepEqual(factTokens(c), []);
});

const SCRIPT = () => ({
  title: "t", subtitle: "", ticker: [], ytTitle: "y", images: [],
  cards: [{ big: "a", line: "b" }, { big: "c", line: "d" }],
  narration: ["卡一", "卡二", "補充", "楓谷幫手網站的攻略能直接看重點"],
  shortsNarration: ["卡一", "卡二", "站內有整理"],
  description: "https://maplehelper.tw/guides?x\n活動說明\n想看重點可以去楓谷幫手網站",
});

test("withCta：結尾句換成那頁的 cta，模型自己寫的網站句拿掉；卡片配的句子不動", () => {
  const page = sitePages().find((p) => p.path === "/guides");
  const s = withCta(SCRIPT(), page);
  assert.deepEqual(s.narration, ["卡一", "卡二", "補充", "練功、任務攻略都整理在楓谷幫手網站"]);
  assert.deepEqual(s.shortsNarration, ["卡一", "卡二", "練功、任務攻略都整理在楓谷幫手網站"]);
  assert.equal(s.description, "https://maplehelper.tw/guides?x\n活動說明\n練功、任務攻略都整理在楓谷幫手網站");
});

test("withCta：沒有對到頁面用預設句", () => {
  const s = withCta(SCRIPT(), null);
  assert.equal(s.narration.at(-1), DEFAULT_CTA);
  assert.equal(s.description.split("\n").at(-1), DEFAULT_CTA);
});
