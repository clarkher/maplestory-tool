"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { DRAW_HREF, SHOWCASE, loopSeconds, lookHref, type ShowcaseLook } from "@/lib/avatar/showcase";
import { track } from "@/lib/analytics";

const LOOP = loopSeconds(SHOWCASE);

/** 一排角色；第二排（copy）接在後面讓跑馬燈接得起來，鍵盤跟報讀軟體只走第一排 */
function Row({ copy }: { copy?: boolean }) {
  return (
    <ul aria-hidden={copy} className="flex shrink-0 items-end gap-3.5 pr-3.5">
      {SHOWCASE.map((look: ShowcaseLook, index) => (
        <li key={look.src} className="shrink-0">
          {/* 15 套 × 2 排：不預先載入，首頁才不會多打 30 個請求 */}
          <Link
            href={lookHref(look)}
            prefetch={false}
            tabIndex={copy ? -1 : undefined}
            aria-label={copy ? undefined : `穿上第 ${index + 1} 套`}
            onClick={() => track("avatar_showcase_click", { target: "look" })}
            className="block rounded-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={look.src}
              alt=""
              width={look.w}
              height={look.h}
              loading="lazy"
              decoding="async"
              style={{ "--w": look.w, "--h": look.h } as CSSProperties}
              className="h-[calc(var(--h)*1.5px)] w-[calc(var(--w)*1.5px)] [image-rendering:pixelated] sm:h-[calc(var(--h)*2px)] sm:w-[calc(var(--w)*2px)]"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * 首頁的紙娃娃輪播（v1.71，使用者選 A 一排跑馬燈）：先產好的隨機穿搭一排慢慢走，點角色穿那套、按「抽一套」抽新的。
 * 高度固定（圖最高 76 × 1.5 或 × 2），圖還沒到也不跳；討厭動畫的人（prefers-reduced-motion）改成自己滑。滑鼠移上去、鍵盤走到時停住才點得準。
 */
export function AvatarShowcase({ className = "" }: { className?: string }) {
  return (
    <section aria-label="紙娃娃" className={`overflow-hidden rounded-[var(--radius-card)] wood-frame bg-[color:var(--gold-wash)] ${className}`}>
      <div className="avatar-marquee flex h-[128px] items-end overflow-hidden pb-1.5 motion-reduce:overflow-x-auto sm:h-[166px]" style={{ "--loop": `${LOOP}s` } as CSSProperties}>
        <Row />
        <Row copy />
      </div>
      <Link
        href={DRAW_HREF}
        onClick={() => track("avatar_showcase_click", { target: "draw" })}
        className="flex items-center justify-between gap-3 bg-[color:var(--paper)] px-4 py-2.5"
      >
        <span className="min-w-0 text-[15px] font-black leading-snug">
          紙娃娃
          <span className="block text-[13px] font-medium ink-soft">隨機穿搭，你會抽到什麼？</span>
        </span>
        <span className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[color:var(--maple)] px-5 text-[15px] font-black text-[color:var(--on-accent)]">抽一套</span>
      </Link>
    </section>
  );
}
