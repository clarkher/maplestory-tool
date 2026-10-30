// src/lib/boss/types.ts
// 野王計時的型別與固定資料（重生時間讀 data/boss/respawn.json）
import respawnJson from "../../../data/boss/respawn.json";

export type ServerKey = "xuejila" | "gugu";

/** 兩台伺服器（每台 1～60 分流） */
export const SERVERS: { key: ServerKey; name: string }[] = [
  { key: "xuejila", name: "雪吉拉" },
  { key: "gugu", name: "菇菇寶貝" },
];

export type BossDef = {
  id: number;
  name: string;
  maps: string[];
  /** 台服實測最短／最長重生分鐘；沒有實測就 null */
  min: number | null;
  max: number | null;
  samples: number;
  confidence: "高" | "中" | null;
  note?: string;
  sources: string[];
};

/** 照 spec 表的順序（實測筆數多、等級低的在前） */
export const BOSSES: BossDef[] = (respawnJson as unknown as { bosses: BossDef[] }).bosses;

export type BossEvent =
  | { id: string; server: ServerKey; boss: number; ch: number; kind: "kill" | "empty"; at: number }
  | { id: string; server: ServerKey; boss: number; ch: number; kind: "retract"; target: string; at: number };

export type ChannelState = {
  ch: number;
  kind: "none" | "wait" | "maybe" | "sure" | "since" | "empty";
  /** 從紀錄時間到現在經過的分鐘（小數，最小 0） */
  minutes: number;
  label: string;
  event?: BossEvent;
};
