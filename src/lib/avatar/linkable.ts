// 查資料頁哪些道具可以放「穿上看看」：只給紙娃娃真的畫得出來的髮型、臉型、點裝、一般裝備。
// 規則：c 是「時裝」或「裝備」；髮型（hairDrawable）→ 臉型（faceDrawable）→ 其他要在 avatar.json 而且有 r（台服或日服有圖）。
// 不帶性別：紙娃娃那邊的 try 解析會依道具挑男女（男女都能的預設男）。
// 防漂移：__tests__/linkable.test.ts 會逐個有按鈕的 items.json id 去 parseOutfit(try=) 確認真的穿得上。
import type { Item } from "@/lib/types";
import { faceDrawable, hairDrawable, itemIndex } from "./outfit";
import type { AvatarData } from "./types";

/** 這件時裝、裝備能不能「穿上看看」；能就回紙娃娃的連結，不能回 null */
export function avatarLink(item: Pick<Item, "id" | "c">, data: AvatarData): string | null {
  if (item.c !== "時裝" && item.c !== "裝備") return null;
  if (hairDrawable(data, item.id) || faceDrawable(data, item.id) || itemIndex(data).get(item.id)?.r) {
    return `/plan/avatar?try=${item.id}`;
  }
  return null;
}
