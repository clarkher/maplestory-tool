"use client";

import Image from "next/image";
import { npcImage } from "@/lib/data";

/**
 * 組隊任務的圖解。
 * 種子位置與跳桶金字塔是空間資訊，畫出來比文字快十倍。
 * 全部用 inline SVG 配主題色，NPC 用遊戲內的真實立繪。
 */

/* ---------------------------------------------------------------- 月妙 */

const SEEDS = [
  { pos: "左上", color: "藍", fill: "#4a90d9" },
  { pos: "右上", color: "綠", fill: "#58a84a" },
  { pos: "左中", color: "黃", fill: "#e0b52e" },
  { pos: "右中", color: "紫", fill: "#8a5fc0" },
  { pos: "左下", color: "黃褐", fill: "#b07b3e" },
  { pos: "右下", color: "紫紅", fill: "#c04a8a" },
] as const;

/** 月妙六色種子的平台位置圖 */
export function MoonBunnySeedDiagram() {
  return (
    <figure className="rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] p-3">
      <svg viewBox="0 0 340 220" className="mx-auto w-full max-w-sm" role="img" aria-label="月妙六色種子平台位置圖">
        {/* 中央月妙台 */}
        <rect x="130" y="88" width="80" height="44" rx="8" fill="var(--gold-wash)" stroke="var(--gold)" strokeWidth="1.5" />
        <text x="170" y="106" textAnchor="middle" fontSize="13" fontWeight="900" fill="var(--gold)">月妙</text>
        <text x="170" y="122" textAnchor="middle" fontSize="9" fill="var(--ink-faint)">搗滿 10 個年糕</text>

        {SEEDS.map((seed, index) => {
          const column = index % 2; // 0 左 1 右
          const row = Math.floor(index / 2); // 0 上 1 中 2 下
          const x = column === 0 ? 14 : 246;
          const y = 12 + row * 70;
          return (
            <g key={seed.pos}>
              <rect x={x} y={y} width="80" height="52" rx="10" fill={seed.fill} opacity="0.16" stroke={seed.fill} strokeWidth="1.5" />
              <circle cx={x + 22} cy={y + 26} r="10" fill={seed.fill} />
              <text x={x + 44} y={y + 22} fontSize="11" fontWeight="700" fill="var(--ink-soft)">{seed.pos}</text>
              <text x={x + 44} y={y + 38} fontSize="13" fontWeight="900" fill="var(--ink)">{seed.color}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1.5 text-center text-[11px] ink-faint">
        打花草怪掉六色種子，照這張圖的位置種下去
      </figcaption>
    </figure>
  );
}

/* ---------------------------------------------------------------- 超綠 */

/** 超綠第一關答題張數對照表 */
export function KpqAnswerTable() {
  const rows = [
    ["法師的轉職等級", 8],
    ["其他職業的轉職等級", 10],
    ["Lv.1 升 Lv.2 所需經驗", 15],
    ["法師轉職的智力需求", 20],
    ["弓箭手／盜賊轉職的敏捷需求", 25],
    ["劍士轉職的力量需求", 35],
  ] as const;
  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--paper-edge)]">
      <table className="w-full text-sm">
        <thead className="bg-[color:var(--paper-deep)]">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-bold">克魯特的問題</th>
            <th scope="col" className="px-3 py-2 text-right font-bold">交幾張優惠券</th>
          </tr>
        </thead>
        <tbody className="bg-[color:var(--paper)]">
          {rows.map(([question, count]) => (
            <tr key={question} className="border-t border-[color:var(--paper-edge)]">
              <td className="px-3 py-1.5">{question}</td>
              <td className="px-3 py-1.5 text-right text-[15px] font-black tabular-nums text-[color:var(--maple)]">{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="bg-[color:var(--paper-deep)] px-3 py-1.5 text-[11px] ink-faint">
        經典版張數最低 3、最高 15，可能與上表不同——一律以遊戲內題目為準
      </p>
    </div>
  );
}

/** 超綠第四關跳桶金字塔 */
export function KpqBarrelDiagram() {
  const barrels: Array<{ n: number; x: number; y: number; start?: boolean }> = [
    { n: 1, x: 150, y: 12 },
    { n: 2, x: 105, y: 68 },
    { n: 3, x: 195, y: 68 },
    { n: 4, x: 60, y: 124, start: true },
    { n: 5, x: 150, y: 124, start: true },
    { n: 6, x: 240, y: 124, start: true },
  ];
  return (
    <figure className="rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] p-3">
      <svg viewBox="0 0 340 185" className="mx-auto w-full max-w-sm" role="img" aria-label="超綠第四關跳桶金字塔位置圖">
        {barrels.map(barrel => (
          <g key={barrel.n}>
            <rect
              x={barrel.x - 26} y={barrel.y} width="52" height="44" rx="8"
              fill={barrel.start ? "var(--leaf-wash)" : "var(--paper-deep)"}
              stroke={barrel.start ? "var(--leaf)" : "var(--wood)"}
              strokeWidth="1.5"
            />
            <text x={barrel.x} y={barrel.y + 28} textAnchor="middle" fontSize="18" fontWeight="900"
              fill={barrel.start ? "var(--leaf)" : "var(--ink-soft)"}>
              {barrel.n}
            </text>
          </g>
        ))}
        <text x="170" y="182" textAnchor="middle" fontSize="10" fill="var(--ink-faint)">
          綠色 = 建議起手位（4・5・6 最好踩，也是順序表最後一組）
        </text>
      </svg>
      <figcaption className="mt-1.5 space-y-1 text-[11px] leading-relaxed ink-faint">
        <span className="block">
          依序測試 20 種組合：123 → 124 → 125 → 126 → 134 → 135 → 136 → 145 → 146 → 156 →
          234 → 235 → 236 → 245 → 246 → 256 → 345 → 346 → 356 → 456
        </span>
        <span className="block font-bold text-[color:var(--ink-soft)]">
          相鄰兩組通常只差一個位置——輪到的那個人動就好，其他兩人在原位別亂跳。
        </span>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------ 流程步驟 */

export type PqStage = {
  n: string;
  title: string;
  text: string;
  exp?: number;
  npcId?: number;
  npcName?: string;
};

export function PqStageList({ stages }: { stages: PqStage[] }) {
  return (
    <ol className="space-y-1.5">
      {stages.map(stage => (
        <li key={stage.n} className="flex items-start gap-2.5 rounded-xl bg-[color:var(--paper)] p-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[color:var(--maple-wash)] text-[13px] font-black tabular-nums text-[color:var(--maple)]">
            {stage.n}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[14px] font-bold">{stage.title}</span>
              {stage.exp ? (
                <span className="text-[11px] font-black tabular-nums text-[color:var(--gold)]">
                  +{stage.exp.toLocaleString()} 經驗
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block text-[13px] leading-relaxed ink-soft">{stage.text}</span>
          </span>
          {stage.npcId ? (
            <span className="flex shrink-0 flex-col items-center gap-0.5">
              <Image src={npcImage(stage.npcId)} alt="" width={36} height={36} className="size-9 object-contain" unoptimized />
              {stage.npcName ? <span className="text-[10px] ink-faint">{stage.npcName}</span> : null}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** 帶 NPC 立繪的入口資訊列 */
export function PqEntryBanner({
  npcId,
  npcName,
  place,
  party,
  exp,
  time,
}: {
  npcId: number;
  npcName: string;
  place: string;
  party: string;
  exp: string;
  time: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[color:var(--gold-wash)] p-3">
      <Image src={npcImage(npcId)} alt="" width={48} height={48} className="size-12 shrink-0 object-contain" unoptimized />
      <div className="min-w-0 flex-1">
        <p className="font-black">
          {place} 找 <span className="text-[color:var(--gold)]">{npcName}</span>
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] ink-soft">
          <span>{party}</span>
          <span className="font-bold text-[color:var(--gold)]">{exp}</span>
          <span>{time}</span>
        </p>
      </div>
    </div>
  );
}
