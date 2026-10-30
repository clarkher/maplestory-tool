// 衝卷模擬的資料形狀（public/data/scroll-sim.json，建置時寫好）

/** 一張可衝的卷軸 */
export type SimScroll = {
  id: number;
  /** 同名同成功率的重複 id（網址帶哪個都認） */
  ids: number[];
  n: string;
  /** 能衝的部位；null＝只對 only 裡的裝備 */
  slot: string | null;
  /** 專用卷：只對這幾件裝備 id */
  only?: number[];
  /** 成功率 0～100 */
  rate: number;
  /** 失敗爆裝率 0～1 */
  boom: number;
  effect: string;
  stats: Array<{ k: string; v: number }>;
  /** 有掉落、任務或商店來源 */
  src: boolean;
};

/** 白衣卷軸 */
export type SimWhite = { id: number; n: string; rate: number };

/** 可衝的裝備（tuc＝可衝次數） */
export type SimEquip = { id: number; n: string; s: string; tuc: number; lv: number; src: boolean };

export type ScrollSimData = { scrolls: SimScroll[]; white: SimWhite[]; equips: SimEquip[] };
