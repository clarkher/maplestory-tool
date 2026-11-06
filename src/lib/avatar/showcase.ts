/**
 * 首頁紙娃娃輪播（v1.71）的角色：showcase.gen.ts 先產好的圖跟它的穿搭。
 * 不跟最新的 avatar.json 比對：資料每天更新，少一件時點進去只是少穿那件，不該讓自動更新紅燈。
 */
import looks from "./showcase.json";

/** q 是 outfitQuery；w、h 是 1 倍圖的寬高；src 是站上的圖 */
export type ShowcaseLook = { q: string; w: number; h: number; src: string };

export const SHOWCASE: ShowcaseLook[] = looks;

/** 按「抽一套」：紙娃娃頁看到 draw 就抽一套新的，不穿回這個分頁上次那套 */
export const DRAW_HREF = "/plan/avatar?draw=1";

/** 點輪播裡的角色：直接穿上那一套 */
export const lookHref = (look: ShowcaseLook) => `/plan/avatar?${look.q}`;

/** 跑一圈幾秒：照實際寬度算（每秒約 28px），挑的角色變多也一樣慢 */
export function loopSeconds(list: ShowcaseLook[]): number {
  return Math.round(list.reduce((sum, look) => sum + look.w * 1.5 + 14, 0) / 28);
}
