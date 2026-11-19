import test from "node:test";
import assert from "node:assert/strict";
import { coverHtml } from "./cover.mjs";

test("coverHtml：主角圖、標題、紅標都在，字會跳脫", () => {
  const h = coverHtml({ title: "雪天使<來了>", sub: "閃亮彗星新外觀", tag: "快報", hero: "hero-a.jpg", avatar: "av-01.png" }, "C:/fonts");
  assert.ok(h.includes('src="hero-a.jpg"'));
  assert.ok(h.includes("雪天使&lt;來了&gt;"));
  assert.ok(h.includes('<span class="red">快報</span>'));
  assert.ok(h.includes('class="av" src="av-01.png"'));
  assert.ok(h.includes("NotoSansTC-Black.otf"));
});

test("coverHtml：怪物放大不糊、地圖填滿；沒角色就不留位置", () => {
  assert.ok(coverHtml({ title: "木妖在哪打？", tag: "在哪打", hero: "m.png", pixel: true }, "/f").includes("image-rendering:pixelated"));
  const g = coverHtml({ title: "螞蟻洞Ⅰ怎麼去？", tag: "怎麼去", hero: "r.webp", fill: true }, "/f");
  assert.ok(g.includes("object-fit:cover"));
  assert.ok(!g.includes('class="av"'));
  assert.ok(g.includes("bottom:0px"));
});
