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
  assert.equal(keepName("券面設計師帽"), true);
});
test("雙手武器：islot WpSi，或 140～146 開頭（不管 islot）", () => {
  assert.equal(isTwoHanded({ id: 1402000, eq: { islot: "WpSi" } }), true);
  assert.equal(isTwoHanded({ id: 1702059, eq: { islot: "WpSi" } }), true);
  assert.equal(isTwoHanded({ id: 1302000, eq: { islot: "Wp" } }), false);
  assert.equal(isTwoHanded({ id: 1442000 }), true); assert.equal(isTwoHanded({ id: 1472103 }), false);
  // 槍、矛（143、144）遊戲裡是雙手，但 items.json 的 islot 寫 Wp，所以前三碼也要看
  assert.equal(isTwoHanded({ id: 1432000, eq: { islot: "Wp" } }), true);
  assert.equal(isTwoHanded({ id: 1442000, eq: { islot: "Wp" } }), true);
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

// ---- 5 字頭臉型（11/03 修：臉型是 20000～29999 加 50000～59999，髮型是 30000～49999 加 60000～69999）----
// items.json 的 5 字頭時裝只有這三款，全是臉型：燦爛耀眼臉型 50032、穩重臉型 51043、明亮大眼臉型 54038。
const FACE5 = [
  { id: 50032, n: "燦爛耀眼臉型", c: "時裝", s: "外觀/角色" },
  { id: 51043, n: "穩重臉型", c: "時裝", s: "外觀/角色" },
  { id: 54038, n: "明亮大眼臉型", c: "時裝", s: "外觀/角色" },
];
test("5 字頭臉型：拆款（款＝id 扣掉百位數×100）、瞳色＝百位數", () => {
  for (const [style, color, id] of [[50032, 0, 50032], [50032, 1, 50132], [50032, 7, 50732], [51043, 3, 51343], [54038, 0, 54038], [54038, 7, 54738]]) {
    assert.equal(faceStyleOf(id), style, String(id)); assert.equal(faceColorOf(id), color, String(id));
  }
});
test("5 字頭臉型的性別照千位數：50 男、51 女、52 不分、53 男、54 女、55 男、56 男（對過 maplestory.io 臉型清單的 requiredGender）", () => {
  assert.equal(avatarGender(50032), 0); assert.equal(avatarGender(51043), 1); assert.equal(avatarGender(54038), 1);
  for (const id of [50000, 50999, 53023, 55000, 56055]) assert.equal(avatarGender(id), 0, String(id));
  for (const id of [51000, 51097, 54000, 54099]) assert.equal(avatarGender(id), 1, String(id));
  assert.equal(avatarGender(52000), 2);
});
test("buildAvatar：5 字頭的三款是臉型，不在髮型裡；4 字頭、6 字頭仍是髮型", () => {
  const items = [
    ...FACE5,
    { id: 20000, n: "挑戰的臉型", c: "時裝", s: "外觀/角色" },
    { id: 30030, n: "黑色活力冒險造型", c: "時裝", s: "外觀/角色" },
    { id: 41007, n: "棕色可愛年下髮型", c: "時裝", s: "外觀/角色" },
    { id: 61050, n: "黑色夢幻長髮", c: "時裝", s: "外觀/角色" },
  ];
  const msio = { twms: [20000, 30030, 41000, 61050, 50032, 50132, 51043], jms: [54138], checked: [] };
  const a = buildAvatar(items, msio);
  // 髮型：沒有任何 5 字頭；4、6 字頭還在（畫得出來的在前，同組 id 大的在前）
  assert.deepEqual(a.hair.map(h => h.id), [61050, 41000, 30030]);
  assert.equal(a.hair.some(h => h.id >= 50000 && h.id < 60000), false);
  assert.deepEqual(a.hair.find(h => h.id === 41000), { id: 41000, n: "可愛年下髮型", g: 1, ic: 41007, t: [0], j: [] });
  assert.deepEqual(a.hair.find(h => h.id === 61050), { id: 61050, n: "夢幻長髮", g: 1, ic: 61050, t: [0], j: [] });
  // 臉型：三款都在，款 id＝50032、51043、54038；台服畫得出來的瞳色／只有日服畫得出來的瞳色
  assert.deepEqual(a.face.map(f => f.id), [54038, 51043, 50032, 20000]);
  assert.deepEqual(a.face.find(f => f.id === 50032), { id: 50032, n: "燦爛耀眼臉型", g: 0, ic: 50032, t: [0, 1], j: [] });
  assert.deepEqual(a.face.find(f => f.id === 51043), { id: 51043, n: "穩重臉型", g: 1, ic: 51043, t: [0], j: [] });
  assert.deepEqual(a.face.find(f => f.id === 54038), { id: 54038, n: "明亮大眼臉型", g: 1, ic: 54038, t: [], j: [1] });
});
test("候選 id：5 字頭臉型走 0～7 瞳色（款＋c×100），不走髮色（款＋c）；4、6 字頭仍走髮色", () => {
  const ids = avatarCandidates([...FACE5, { id: 41007, n: "棕色可愛年下髮型", c: "時裝", s: "外觀/角色" }, { id: 61050, n: "黑色夢幻長髮", c: "時裝", s: "外觀/角色" }]);
  for (const id of [50032, 50132, 50732, 51043, 51143, 51743, 54038, 54138, 54738, 41000, 41007, 61050, 61057]) assert.ok(ids.includes(id), String(id));
  // 把 5 字頭當髮型才會有的候選（款 50030、51040、54030 加 0～7）
  for (const id of [50030, 50031, 50033, 50037, 51040, 51041, 51047, 54030, 54031, 54037]) assert.equal(ids.includes(id), false, String(id));
  // 4、6 字頭不會被當臉型
  for (const id of [41100, 41700, 61150, 61750]) assert.equal(ids.includes(id), false, String(id));
});
test("髮型／臉型範圍邊界：臉 20000～29999、50000～59999；髮 30000～49999、60000～69999；其他不收", () => {
  // 候選裡一定有 8 個膚色的頭（12000～12011），所以只看 20000～99999（髮型、臉型的範圍）
  const cand = id => new Set(avatarCandidates([{ id, n: "測試造型", c: "時裝", s: "外觀/角色" }]).filter(x => x >= 20000 && x < 100000));
  const isFace = id => cand(id).has(faceStyleOf(id) + 100) && !cand(id).has(hairStyleOf(id) + 1);
  const isHair = id => cand(id).has(hairStyleOf(id) + 1) && !cand(id).has(faceStyleOf(id) + 100);
  for (const id of [20000, 29990, 50000, 59990]) assert.ok(isFace(id), `臉 ${id}`);
  for (const id of [30000, 49990, 60000, 69990]) assert.ok(isHair(id), `髮 ${id}`);
  for (const id of [19990, 70000, 79990]) assert.equal(cand(id).size, 0, `不收 ${id}`);
});
