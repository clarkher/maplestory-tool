"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronRight, ChestIcon, RouteIcon, ScrollIcon, SwordIcon } from "@/components/Icons";
import { ProfileForm } from "@/components/ProfileForm";
import { loadMeta } from "@/lib/data";
import { useProfile } from "@/lib/profile";
import type { Meta } from "@/lib/types";

const MODES = [
  {
    href: "/plan/quest",
    label: "解任務",
    lead: "現在接得到的任務都在這",
    detail: "照等級跟職業篩過，附上去找誰、要交什麼、拿多少經驗",
    Icon: ScrollIcon,
    tone: "var(--gold)",
    wash: "var(--gold-wash)",
  },
  {
    href: "/plan/train",
    label: "打怪練功",
    lead: "這個等級該去哪一張圖",
    detail: "看刷怪點多不多、回生多快、你的命中夠不夠",
    Icon: SwordIcon,
    tone: "var(--maple)",
    wash: "var(--maple-wash)",
  },
  {
    href: "/plan/farm",
    label: "刷寶物",
    lead: "這等級該收什麼，直接列給你",
    detail: "任務要交的、該換的裝備、值錢的掉落物，勾了就排地圖",
    Icon: ChestIcon,
    tone: "var(--leaf)",
    wash: "var(--leaf-wash)",
  },
] as const;

export default function HomePage() {
  const { profile, setProfile, loaded } = useProfile();
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    loadMeta().then(setMeta).catch(() => setMeta(null));
  }, []);

  return (
    <div className="space-y-7 py-4 sm:py-8">
      <section className="text-center">
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[color:var(--maple-wash)] px-3 py-1 text-xs font-bold text-[color:var(--maple)]">
          <Image src="/brand-emblem.png" alt="" width={14} height={14} className="size-3.5" />
          新楓之谷經典版
        </p>
        <h1 className="text-[28px] font-black leading-tight tracking-tight sm:text-[40px]">
          今天想幹嘛？
        </h1>
        <p className="mx-auto mt-2.5 max-w-md text-[15px] leading-relaxed ink-soft sm:text-base">
          選一個，填上等級跟職業，直接跳出該去哪。<br className="hidden sm:block" />
          選好之後會一段一段帶你走過去。
        </p>
      </section>

      <section aria-label="選擇今天要做的事">
        <ul className="grid gap-3 sm:grid-cols-3">
          {MODES.map(mode => (
            <li key={mode.href}>
              <Link
                href={mode.href}
                className="group flex h-full flex-col gap-2.5 rounded-[var(--radius-card)] glass wood-frame p-4 transition-transform duration-200 hover:-translate-y-0.5 sm:p-5"
              >
                <span
                  className="grid size-11 place-items-center rounded-2xl"
                  style={{ backgroundColor: mode.wash, color: mode.tone }}
                >
                  <mode.Icon size={22} />
                </span>
                <span className="text-lg font-black">{mode.label}</span>
                <span className="text-[15px] font-bold leading-snug" style={{ color: mode.tone }}>
                  {mode.lead}
                </span>
                <span className="text-sm leading-relaxed ink-soft">{mode.detail}</span>
                <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-bold text-[color:var(--ink-soft)] transition-colors group-hover:text-[color:var(--maple)]">
                  開始
                  <ChevronRight size={15} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="你的角色" className="space-y-2">
        <h2 className="px-1 text-sm font-bold ink-soft">先填一次，之後都記得</h2>
        <ProfileForm profile={profile} onChange={setProfile} />
        {loaded && profile.level > 0 ? (
          <p className="px-1 text-sm ink-soft">
            已記住 Lv.{profile.level}，三個規劃都會直接套用。
          </p>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/guide"
          className="flex items-center gap-3 rounded-[var(--radius-card)] glass wood-frame p-4 transition-transform hover:-translate-y-0.5"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[color:var(--maple-wash)] text-[color:var(--maple)]">
            <ScrollIcon size={20} />
          </span>
          <span className="min-w-0">
            <span className="block font-bold">1–30 懶人包</span>
            <span className="block text-sm ink-soft">新手任務 → 月妙 → 超綠，一條路帶你到 30</span>
          </span>
        </Link>

        <Link
          href="/plan/bundle"
          className="flex items-center gap-3 rounded-[var(--radius-card)] glass wood-frame p-4 transition-transform hover:-translate-y-0.5"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[color:var(--gold-wash)] text-[color:var(--gold)]">
            <ScrollIcon size={20} />
          </span>
          <span className="min-w-0">
            <span className="block font-bold">任務打包</span>
            <span className="block text-sm ink-soft">要跑同一張圖的任務併成一趟，數量直接加總</span>
          </span>
        </Link>

        <Link
          href="/go"
          className="flex items-center gap-3 rounded-[var(--radius-card)] glass wood-frame p-4 transition-transform hover:-translate-y-0.5"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[color:var(--sky-wash)] text-[color:var(--sky)]">
            <RouteIcon size={20} />
          </span>
          <span className="min-w-0">
            <span className="block font-bold">直接帶我去某張圖</span>
            <span className="block text-sm ink-soft">輸入地圖名，給你一段一段的走法</span>
          </span>
        </Link>

        <div className="rounded-[var(--radius-card)] glass wood-frame p-4">
          <p className="text-sm font-bold">資料現況</p>
          {meta ? (
            <p className="mt-1 text-sm leading-relaxed ink-soft">
              遊戲版本 {meta.gameVersion}，{meta.counts.monsters} 隻怪、{meta.counts.items.toLocaleString()} 個道具、
              {meta.counts.quests} 個任務、{meta.counts.portalEdges.toLocaleString()} 條傳送門路線。
              <br />
              <span className="ink-faint text-xs">更新於 {meta.dataGeneratedAtText ?? "—"}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm ink-faint">讀取中…</p>
          )}
        </div>
      </section>
    </div>
  );
}
