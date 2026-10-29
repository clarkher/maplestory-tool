// src/app/plan/speed/ExpCard.tsx
"use client";

import type { Bar } from "@/lib/speed/curve";
import { BigNumber, Card } from "./parts";

/**
 * 經驗卡（v1.20 版面 C）：10 分鐘經驗、升級還要，下面每分鐘經驗長條（掉很多的那幾根金色＋一行說明），
 * 再下面一行小字「這段練了／拿到」，跟原本的組隊回推、等級經驗、上一段。
 */
export function ExpCard({
  per10,
  perLevel,
  eta,
  bars,
  lowText,
  segLine,
  backLine,
  readingLine,
  lastLine,
}: {
  per10: string;
  perLevel: string | undefined;
  eta: string;
  bars: Bar[] | null;
  lowText: string | null;
  segLine: string | null;
  backLine: string | null;
  readingLine: string;
  lastLine: string | null;
}) {
  return (
    <Card>
      <div className="grid grid-cols-2 gap-4">
        <BigNumber label="10 分鐘經驗" value={per10} note={perLevel} />
        <BigNumber label="升級還要" value={eta} />
      </div>
      {bars && bars.length ? <Chart bars={bars} /> : null}
      {lowText ? <p className="mt-1.5 text-[13px] font-bold text-[color:var(--gold)]">{lowText}</p> : null}
      {segLine ? <p className="mt-2 text-[13px] ink-soft">{segLine}</p> : null}
      {backLine ? <p className="mt-3 text-[13px] font-bold">{backLine}</p> : null}
      <p className="mt-3 text-[13px] ink-soft">{readingLine}</p>
      {lastLine ? <p className="mt-2 text-[13px]">{lastLine}</p> : null}
    </Card>
  );
}

/** 每分鐘經驗長條：最高那根頂到上緣；正在進行的那一分鐘淡一點 */
function Chart({ bars }: { bars: Bar[] }) {
  const max = Math.max(1, ...bars.map(bar => bar.value));
  const width = 100 / bars.length;
  // 左邊寫已經過完的分鐘（正在進行的那一根不算）
  const done = bars.length - (bars[bars.length - 1]?.current ? 1 : 0);
  return (
    <div className="mt-3">
      <svg width="100%" height={70} className="block" preserveAspectRatio="none" role="img" aria-label="每分鐘經驗">
        {bars.map((bar, index) => {
          const height = (bar.value / max) * 100;
          return (
            <rect
              key={index}
              x={`${index * width + width * 0.15}%`}
              y={`${100 - height}%`}
              width={`${width * 0.7}%`}
              height={`${height}%`}
              rx={2}
              fill={bar.low ? "var(--gold)" : "var(--leaf)"}
              opacity={bar.current ? 0.45 : 1}
            />
          );
        })}
      </svg>
      <div className="mt-0.5 flex justify-between text-[11px] ink-soft">
        <span>{done > 0 ? `${done} 分鐘前` : ""}</span>
        <span>每分鐘經驗</span>
        <span>現在</span>
      </div>
    </div>
  );
}
