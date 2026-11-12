/**
 * 楓葉商會換得到的 19 把楓葉武器（v2.18 楓葉武器衝卷規劃器）。
 * 名稱、等級、攻擊照楓之谷經典版台服遊戲檔案，兌換價照台服 11/12 公告（劍士）＋陸服（其他職業），
 * 跟攻略文 src/content/guides/maple-leaf-shop.md 的武器表、卷軸表同一份。
 * scrolls：這把能用的專用卷軸 100%／70%／15% 的道具 id。
 */
export type LeafWeapon = {
  id: number;
  name: string;
  job: string;
  lv: 35 | 43;
  /** 攻擊力（法師的長杖是魔攻） */
  atk: number;
  magic?: true;
  /** 兌換價（硬幣） */
  cost: 100 | 200;
  scrolls: { 100: number; 70: number; 15: number };
};

const SWORD = { 100: 2046414, 70: 2046415, 15: 2046416 };
const MAGE = { 100: 2046417, 70: 2046418, 15: 2046419 };
const ARCHER = { 100: 2046420, 70: 2046421, 15: 2046422 };
const CLAW = { 100: 2046423, 70: 2046424, 15: 2046425 };
const DAGGER = { 100: 2046426, 70: 2046427, 15: 2046428 };
const KNUCKLE = { 100: 2046429, 70: 2046430, 15: 2046431 };
const GUN = { 100: 2046432, 70: 2046433, 15: 2046434 };

const w = (id: number, name: string, job: string, lv: 35 | 43, atk: number, scrolls: LeafWeapon["scrolls"], magic?: true): LeafWeapon =>
  ({ id, name, job, lv, atk, cost: lv === 35 ? 100 : 200, scrolls, ...(magic ? { magic } : {}) });

export const LEAF_WEAPONS: LeafWeapon[] = [
  w(1412011, "楓葉戰斧", "劍士", 43, 68, SWORD),
  w(1422014, "楓葉戰鎚", "劍士", 43, 68, SWORD),
  w(1442024, "楓葉之矛", "劍士", 43, 68, SWORD),
  w(1432012, "楓葉之槍", "劍士", 43, 65, SWORD),
  w(1302030, "楓葉戰劍", "劍士", 43, 60, SWORD),
  w(1302020, "楓葉之劍", "劍士", 35, 48, SWORD),
  w(1382012, "楓葉法杖", "法師", 43, 58, MAGE, true),
  w(1382009, "楓葉之杖", "法師", 35, 48, MAGE, true),
  w(1452022, "楓葉之弓", "弓箭手", 43, 58, ARCHER),
  w(1452016, "楓葉神弓", "弓箭手", 35, 48, ARCHER),
  w(1462019, "楓葉之弩", "弓箭手", 43, 60, ARCHER),
  w(1462014, "楓葉玉弩", "弓箭手", 35, 52, ARCHER),
  w(1472032, "楓葉拳套", "盜賊", 43, 23, CLAW),
  w(1472030, "楓葉指套", "盜賊", 35, 20, CLAW),
  w(1332025, "楓葉短刀", "盜賊", 43, 58, DAGGER),
  w(1482021, "楓葉暴風指虎", "海盜", 43, 46, KNUCKLE),
  w(1482020, "楓葉指虎", "海盜", 35, 38, KNUCKLE),
  w(1492021, "楓葉暴風火槍", "海盜", 43, 44, GUN),
  w(1492020, "楓葉火槍", "海盜", 35, 36, GUN),
];

export const DEFAULT_WEAPON = 1412011;

export function findWeapon(id: number | null | undefined): LeafWeapon | undefined {
  return LEAF_WEAPONS.find(weapon => weapon.id === id);
}
