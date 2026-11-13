import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { extractContent, fetchDetail } from "./detail.mjs";

const fixture = JSON.parse(readFileSync(new URL("./__fixtures__/84140.json", import.meta.url), "utf8"));
const html = fixture.data.myDataSet.table.content;

test("抽字抽圖：抓到圖、字、去掉法務段", () => {
  const { text, images } = extractContent(html);
  assert.ok(images.includes("https://tw.hicdn.beanfun.com/beanfun/WebImage/1793819119332.jpg"));
  assert.match(text, /喵喵管家/);
  assert.doesNotMatch(text, /此為機會中獎商品/);
  assert.doesNotMatch(text, /圖片與文案僅供參考/);
  assert.doesNotMatch(text, /<|&amp;/);
});

test("圖去重保序、只收 https", () => {
  const { images } = extractContent('<img src="https://a/1.jpg"><img src="http://a/2.jpg"><img src="https://a/0.jpg"><img src="https://a/1.jpg">');
  assert.deepEqual(images, ["https://a/1.jpg", "https://a/0.jpg"]);
});

test("內文是 null 不爆", () => {
  assert.deepEqual(extractContent(null), { text: "", images: [] });
});

test("fetchDetail：POST、回整理後的欄位", async () => {
  let seen;
  const fetcher = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => fixture }; };
  const d = await fetchDetail("84140", { fetcher });
  assert.equal(seen.url, "https://maplestoryclassic.beanfun.com/api/Bulletin/BulletinDetail?pbid=84140");
  assert.equal(seen.init.method, "POST");
  assert.ok(seen.init.signal, "要有逾時 signal");
  assert.equal(seen.init.body, '{"pbid":84140}');
  assert.equal(d.id, "84140");
  assert.equal(typeof d.startDate, "string");
  assert.ok(d.html.includes("喵喵管家"));
});

test("fetchDetail：code 不是 1 就丟錯", async () => {
  const fetcher = async () => ({ ok: true, json: async () => ({ code: -2 }) });
  await assert.rejects(() => fetchDetail("1", { fetcher }), /-2/);
});

test("注意事項標題只丟標題本身，底下的活動期間要留", () => {
  const { text } = extractContent("<p>【限定活動】</p><p>注意事項：</p><p>1.活動期間：11/19～12/16</p><p>2.此為機會中獎商品，請見說明</p><p>3.若有任何特殊異動將另行公告</p>");
  assert.match(text, /1\.活動期間：11\/19～12\/16/);
  assert.doesNotMatch(text, /注意事項/);
  assert.doesNotMatch(text, /此為機會中獎商品/);
  assert.doesNotMatch(text, /特殊異動/);
});
