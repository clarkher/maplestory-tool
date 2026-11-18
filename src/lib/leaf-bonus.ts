/**
 * 楓葉武器衝完加多少（懶人包走完的平均）：攻略文 maple-leaf-weapon-jobs（leaf-weapons.ts）跟傷害計算機的全幸、全智預設（damage-view.ts）共用。
 * 單獨一檔：leaf-weapons.ts 引用 damage-view.ts，常數放這裡兩邊才不會互相引用。
 */

/** 懶人包走完的平均（+11.6）取整 */
export const LEAF_SCROLL_BONUS = 12;
/** 法師的卷另外加智力：懶人包走完平均 +6.1 取整（v2.36，巴哈網友指正；智力加在角色能力值上，計算機照常算進魔力） */
export const LEAF_INT_BONUS = 6;
