import test from "node:test";
import assert from "node:assert/strict";
import { mmdd, pickAvatars, youtubeText, buildDescription, capTitle } from "./make.mjs";

test("mmdd：公告日期轉 MM/DD", () => {
  assert.equal(mmdd("2026/11/12"), "11/12");
  assert.equal(mmdd("2026/1/5"), "01/05");
  assert.equal(mmdd(""), "");
});

test("pickAvatars：同一個 id 固定挑兩張相鄰的 png，跳過非 png", () => {
  const files = ["c.png", "a.png", "b.png", "readme.txt"];
  assert.deepEqual(pickAvatars(files, "84140"), pickAvatars(files, "84140"));
  assert.deepEqual(pickAvatars(files, "3"), ["a.png", "b.png"]);
  assert.deepEqual(pickAvatars(files, "5"), ["c.png", "a.png"]);
  assert.deepEqual(pickAvatars([], "5"), []);
});

test("youtubeText：標題、空行、說明欄、hashtag 行", () => {
  const t = youtubeText({ ytTitle: "閃亮彗星來了", description: "https://maplehelper.tw/?x\n說明" });
  assert.equal(t, "閃亮彗星來了\n\nhttps://maplehelper.tw/?x\n說明\n\n#楓之谷經典版 #楓谷幫手\n");
});

test("buildDescription：{{LINK}} 不管在哪一行都拿掉，utm 連結永遠是第一行", () => {
  const link = "https://maplehelper.tw/?utm=x";
  assert.equal(buildDescription("說明一\n看這裡 {{LINK}}\n{{LINK}}\n說明二", link), `${link}\n說明一\n看這裡\n說明二`);
  assert.equal(buildDescription("{{LINK}}\n說明", link), `${link}\n說明`);
  assert.equal(buildDescription("只有說明", link), `${link}\n只有說明`);
});

test("capTitle：YouTube 標題最多 100 字", () => {
  assert.equal(capTitle("短標題"), "短標題");
  assert.equal([...capTitle("字".repeat(150))].length, 100);
  assert.ok(capTitle("字".repeat(150)).endsWith("…"));
});
