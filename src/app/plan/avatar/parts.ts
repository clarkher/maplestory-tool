/** 紙娃娃角色卡、挑衣服卡共用的東西（只放一份） */
import type { SlotKey } from "@/lib/avatar/types";

/** 卡片外框（同衝卷模擬） */
export const CARD = "rounded-[var(--radius-card)] glass-solid p-4 sm:p-[18px]";

/** 12 類的名字，順序同挑衣服卡的分頁（接在髮型、臉型、膚色後面） */
export const SLOTS: { k: SlotKey; label: string }[] = [
  { k: "cap", label: "帽子" },
  { k: "overall", label: "套服" },
  { k: "coat", label: "上衣" },
  { k: "pants", label: "褲裙" },
  { k: "shoes", label: "鞋子" },
  { k: "glove", label: "手套" },
  { k: "cape", label: "披風" },
  { k: "weapon", label: "武器" },
  { k: "eyeAcc", label: "眼飾" },
  { k: "faceAcc", label: "臉飾" },
  { k: "earrings", label: "耳環" },
  { k: "shield", label: "盾牌" },
];
