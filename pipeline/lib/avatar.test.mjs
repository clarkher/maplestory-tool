import test from "node:test";
import assert from "node:assert/strict";
import {
  avatarSlot, avatarGender, hairStyleOf, hairColorOf, faceStyleOf, faceColorOf,
  stripHairColor, keepName, isTwoHanded, avatarCandidates, buildAvatar,
} from "./avatar.mjs";

test("分類照 id 前三碼", () => {
  assert.equal(avatarSlot(1002140), "cap"); assert.equal(avatarSlot(1012000), "faceAcc");
  assert.equal(avatarSlot(1022073), "eyeAcc"); assert.equal(avatarSlot(1032000), "earrings");
  assert.equal(avatarSlot(1040002), "coat"); assert.equal(avatarSlot(1050000), "overall");
  assert.equal(avatarSlot(1060002), "pants"); assert.equal(avatarSlot(1072001), "shoes");
  assert.equal(avatarSlot(1082002), "glove"); assert.equal(avatarSlot(1092000), "shield");
  assert.equal(avatarSlot(1102000), "cape");
  for (const id of [1302000, 1312000, 1322000, 1332000, 1372000, 1382000, 1402000, 1412000, 1422000, 1432000, 1442000, 1452002, 1462000, 1472000, 1482000, 1492000, 1702310])
    assert.equal(avatarSlot(id), "weapon", String(id));
  for (const id of [1112957, 1122000, 1132000, 1142000, 1342004, 1602000, 30030, 20000]) assert.equal(avatarSlot(id), null, String(id));
});
test("性別：裝備千位數 0 男 1 女；髮型臉型千位數 0356 男、1478 女、29 不分", () => {
  assert.equal(avatarGender(1050000), 0); assert.equal(avatarGender(1051000), 1); assert.equal(avatarGender(1052000), 2);
  assert.equal(avatarGender(1702310), 2);
  for (const id of [30030, 33000, 35000, 36000, 40000, 43000, 20000, 23018, 25000]) assert.equal(avatarGender(id), 0, String(id));
  for (const id of [31470, 34000, 37000, 38000, 41000, 44910, 21009, 24025]) assert.equal(avatarGender(id), 1, String(id));
  for (const id of [32000, 39000, 42000, 22035]) assert.equal(avatarGender(id), 2, String(id));
});
test("髮型臉型拆款", () => {
  assert.equal(hairStyleOf(35767), 35760); assert.equal(hairColorOf(35767), 7);
  assert.equal(faceStyleOf(20723), 20023); assert.equal(faceColorOf(20723), 7);
});
test("髮色前綴拿掉", () => {
  assert.equal(stripHairColor("咖啡色可愛年下男髮型"), "可愛年下男髮型");
  assert.equal(stripHairColor("棕色中國女孩造型"), "中國女孩造型");
  assert.equal(stripHairColor("黑色嬉皮公主髮型 (女)"), "嬉皮公主髮型 (女)");
  assert.equal(stripHairColor("加加頭"), "加加頭");
});
test("名字要有中文、不能有韓文、不能是券", () => {
  assert.equal(keepName("Amdusias Hat"), false); assert.equal(keepName("[TW]7주년 기념 모자"), false);
  assert.equal(keepName("費倫髮型券"), false); assert.equal(keepName("6週年慶星光棒"), true);
});
test("雙手武器：islot WpSi，或沒寫 islot 時 140～146 開頭", () => {
  assert.equal(isTwoHanded({ id: 1402000, eq: { islot: "WpSi" } }), true);
  assert.equal(isTwoHanded({ id: 1702059, eq: { islot: "WpSi" } }), true);
  assert.equal(isTwoHanded({ id: 1302000, eq: { islot: "Wp" } }), false);
  assert.equal(isTwoHanded({ id: 1442000 }), true); assert.equal(isTwoHanded({ id: 1472103 }), false);
});
test("buildAvatar：髮型併款、瞳色看凍結檔、畫不出來排最後、點裝排前面、性別、膚色", () => {
  const items = [
    { id: 30030, n: "黑色活力冒險造型", c: "時裝", s: "外觀/角色" },
    { id: 30037, n: "棕色活力冒險造型", c: "時裝", s: "外觀/角色" },
    { id: 20000, n: "挑戰的臉型", c: "時裝", s: "外觀/角色" },
    { id: 1040002, n: "白棉T恤", c: "裝備", s: "上衣", eq: { islot: "Ma" } },
    { id: 1042311, n: "糖果T恤", c: "時裝", s: "上衣", eq: { islot: "Ma" } },
    { id: 1042999, n: "畫不出來的衣服", c: "時裝", s: "上衣" },
    { id: 1003995, n: "Amdusias Hat", c: "時裝", s: "帽子" },
    { id: 1402000, n: "木製大劍", c: "裝備", s: "雙手劍", eq: { islot: "WpSi" } },
  ];
  const msio = { twms: [12000, 12001, 12002, 12003, 12004, 12009, 12010, 12011, 20000, 20100, 20200, 30030, 30031, 1040002, 1042311, 1402000], jms: [30037], checked: [] }; // buildAvatar 不看 checked（build-gear 用它算「沒比對過」件數）
  const a = buildAvatar(items, msio);
  assert.deepEqual(a.hair, [{ id: 30030, n: "活力冒險造型", g: 0, ic: 30030, t: [0, 1], j: [7] }]);
  assert.deepEqual(a.face, [{ id: 20000, n: "挑戰的臉型", g: 0, ic: 20000, t: [0, 1, 2], j: [] }]);
  assert.deepEqual(a.items.filter(i => i.k === "coat").map(i => i.id), [1042311, 1040002, 1042999]);
  assert.equal(a.items.find(i => i.id === 1042311).cash, 1);
  assert.equal(a.items.find(i => i.id === 1042999).r, undefined);
  assert.equal(a.items.find(i => i.id === 1402000).h, 1);
  assert.equal(a.items.some(i => i.id === 1003995), false);
  assert.equal(a.skin.length, 8); assert.deepEqual(a.skin[0], { id: 2000, n: "奶油皮膚" });
});
test("候選 id：髮型每款 0～7 色、臉型每款 0～7 瞳色、12 類道具、膚色頭部", () => {
  const ids = avatarCandidates([{ id: 30037, n: "棕色活力冒險造型", c: "時裝", s: "外觀/角色" }, { id: 20000, n: "挑戰的臉型", c: "時裝", s: "外觀/角色" }, { id: 1040002, n: "白棉T恤", c: "裝備", s: "上衣" }]);
  for (const id of [30030, 30031, 30037, 20000, 20100, 20700, 1040002, 12000, 12011]) assert.ok(ids.includes(id), String(id));
  assert.equal(ids.includes(20800), false); assert.equal(ids.includes(30038), false);
});
