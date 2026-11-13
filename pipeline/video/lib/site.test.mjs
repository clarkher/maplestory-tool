import test from "node:test";
import assert from "node:assert/strict";
import { matchSitePage, sitePages, utmUrl } from "./site.mjs";

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
