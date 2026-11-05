/** 紙娃娃（/plan/avatar）用的型別；資料由 pipeline/build-gear.mjs 寫成 public/data/avatar.json */

export type SlotKey = "cap" | "overall" | "coat" | "pants" | "shoes" | "glove" | "cape" | "weapon" | "eyeAcc" | "faceAcc" | "earrings" | "shield";
export type Gender = 0 | 1;
export type Region = "t" | "j";
/** 一款髮型／臉型：id 是黑色（0 號）那個；t 台服畫得出的顏色碼、j 只有日服有的；ic 有小圖的 id */
export type AvatarStyle = { id: number; n: string; g: 0 | 1 | 2; ic: number; t: number[]; j: number[] };
/** k 類別、g 性別（2 不分）、cash 點裝、r 從哪畫（沒有＝畫不出來）、h 雙手武器、pr 商城單件的樂豆點（沒有＝商城沒賣單件） */
export type AvatarItem = { id: number; n: string; k: SlotKey; g: 0 | 1 | 2; cash?: 1; r?: Region; h?: 1; pr?: number };
export type AvatarSkin = { id: number; n: string };
export type AvatarData = { src: { t: string; j: string }; skin: AvatarSkin[]; hair: AvatarStyle[]; face: AvatarStyle[]; items: AvatarItem[] };
