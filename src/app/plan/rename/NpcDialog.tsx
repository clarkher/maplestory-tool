"use client";

/**
 * 經典版 NPC 對話框：深藍灰外框、淺色內框、白底文字區、底下一條淺灰按鈕列。
 * NPC 在左邊（原圖朝左，翻成朝右看著台詞）、腳下黑底白字名牌；台詞在右，關鍵字藍／紅。
 * 按鈕用客戶端原圖（public/rename/bt-*.png，scripts/client/dlg-buttons.py 抽的），
 * 一律整數 2 倍、pixelated 放大；滑過、按下換客戶端那兩張。手機放不下一排：上排靠右［拒絕］［接受］（或［下頁］）、
 * 下排靠左［停止對話］；sm 以上一排。NPC 手機原尺寸、sm 以上 2 倍。
 * 台詞換了而對話框不在畫面裡（例：簽名格往下捲了按簽好了），捲回來讓人看到 NPC 說什麼。
 * 對話框顏色寫死（遊戲畫面），深色主題也一樣。
 */
import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Seg } from "@/lib/rename/lines";

export type DlgButton = "close" | "no" | "yes" | "next";

const BT: Record<DlgButton, { w: number; h: number; label: string }> = {
  close: { w: 85, h: 19, label: "停止對話" },
  no: { w: 57, h: 17, label: "拒絕" },
  yes: { w: 57, h: 17, label: "接受" },
  next: { w: 46, h: 18, label: "下頁" },
};

const SEG_COLOR = { blue: "#1e5ac8", red: "#c8323c" } as const;

function GameButton({ kind, onClick }: { kind: DlgButton; onClick: () => void }) {
  const b = BT[kind];
  const style = {
    "--w": `${b.w}px`,
    "--h": `${b.h}px`,
    "--n": `url(/rename/bt-${kind}.png)`,
    "--o": `url(/rename/bt-${kind}-hover.png)`,
    "--d": `url(/rename/bt-${kind}-down.png)`,
    imageRendering: "pixelated",
  } as CSSProperties;
  return (
    <button
      type="button"
      data-bt={kind}
      aria-label={b.label}
      title={b.label}
      onClick={onClick}
      style={style}
      className="block h-[calc(var(--h)*2)] w-[calc(var(--w)*2)] flex-none bg-[length:100%_100%] bg-no-repeat [background-image:var(--n)] hover:[background-image:var(--o)] active:[background-image:var(--d)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ea6a2e]"
    />
  );
}

export function Lines({ lines }: { lines: Seg[][] }) {
  return (
    <>
      {lines.map((row, i) => (
        <p key={i} className={i > 0 ? "mt-3" : undefined}>
          {row.map((s, j) =>
            s.c ? (
              <b key={j} style={{ color: SEG_COLOR[s.c] }}>
                {s.t}
              </b>
            ) : (
              <span key={j}>{s.t}</span>
            ),
          )}
        </p>
      ))}
    </>
  );
}

export function NpcDialog({
  lines,
  extra,
  left,
  right,
  onButton,
}: {
  lines: Seg[][];
  /** 台詞下面再加一行（例：筆畫 21→6　像度 81%） */
  extra?: ReactNode;
  left: DlgButton[];
  right: DlgButton[];
  onButton: (b: DlgButton) => void;
}) {
  const box = useRef<HTMLElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // 台詞那一塊被導覽列蓋住（--header-offset，導覽列收起來時是 0）、或在畫面下面，就捲回來（scroll-mt 讓開導覽列）
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 0;
    if (r.top < header || r.top > window.innerHeight - 80) el.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [lines]);
  return (
    <section ref={box} data-dialog className="scroll-mt-[calc(var(--header-h,64px)+8px)] rounded-[10px] bg-[#4e5c78] p-1 shadow-sm">
      <div className="rounded-[8px] bg-[#bec8d7] p-1.5">
        <div className="flex min-h-[210px] gap-2 bg-white px-2 pb-2 pt-3 sm:min-h-[330px] sm:gap-4 sm:px-4">
          <figure className="flex w-[120px] flex-none flex-col items-center justify-end sm:w-[256px]">
            {/* 原圖 128×148，四邊各 4px 透明；手機原尺寸、sm 以上 2 倍 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/rename/npc.png"
              alt=""
              width={128}
              height={148}
              className="block h-[148px] w-[128px] max-w-none -scale-x-100 [image-rendering:pixelated] sm:h-[296px] sm:w-[256px]"
            />
            {/* 名牌是遊戲畫面的固定色（深底白字，深色主題也一樣），不是主題的實心按鈕：不用 --on-accent（深色主題會變深字），白字寫成色碼 */}
            <figcaption className="-mt-1 whitespace-nowrap rounded-[5px] bg-[rgb(30_30_40/0.8)] px-2 py-0.5 text-[12px] font-bold text-[#fff] sm:text-[13px]">
              公會櫃台 米菈
            </figcaption>
          </figure>
          <div data-lines aria-live="polite" className="min-w-0 flex-1 pt-1 text-[15px] leading-[1.7] text-[#282828] sm:text-[17px]">
            <Lines lines={lines} />
            {extra ? <p className="mt-3 text-[#6e6e6e]">{extra}</p> : null}
          </div>
        </div>
        {/* 手機：上排靠右（拒絕／接受／下頁）、下排靠左（停止對話）；sm 以上一排 */}
        <div className="mt-1 flex flex-col-reverse gap-1.5 bg-[#e6eaf0] px-1.5 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-3">
          <div className="flex gap-2">
            {left.map(b => (
              <GameButton key={b} kind={b} onClick={() => onButton(b)} />
            ))}
          </div>
          {right.length > 0 ? (
            <div className="flex justify-end gap-2">
              {right.map(b => (
                <GameButton key={b} kind={b} onClick={() => onButton(b)} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
