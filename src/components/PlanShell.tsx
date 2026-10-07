"use client";

import Link from "next/link";
import { ChevronRight, RouteIcon } from "./Icons";
import { ProfileForm } from "./ProfileForm";
import type { Profile } from "@/lib/types";

export function PlanShell({
  title,
  lead,
  profile,
  onProfileChange,
  needsProfile,
  children,
}: {
  title: string;
  lead: string;
  profile: Profile;
  onProfileChange: (next: Profile) => void;
  needsProfile: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5 py-3 sm:py-6">
      <nav aria-label="麵包屑" className="flex items-center gap-1 text-sm ink-faint">
        <Link href="/" className="hover:text-[color:var(--maple)]">我的路線</Link>
        <ChevronRight size={13} />
        <span className="text-[color:var(--ink-soft)]">{title}</span>
      </nav>

      <header>
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">{title}</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">{lead}</p>
      </header>

      <ProfileForm profile={profile} onChange={onProfileChange} compact />

      {needsProfile ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-[color:var(--paper-edge)] px-4 py-8 text-center text-[15px] ink-soft">
          先選職業、填好等級，下面就會跳出建議。
        </p>
      ) : (
        children
      )}
    </div>
  );
}

/** 每張結果卡右下角都有的「帶我去」，接到導航頁。 */
export function GoButton({ to, label = "帶我去" }: { to: number; label?: string }) {
  return (
    <Link
      href={`/go?to=${to}`}
      className="tap-safe inline-flex items-center gap-1.5 rounded-full bg-[color:var(--maple)] px-3.5 py-2 text-sm font-bold text-white shadow-sm transition-transform hover:-translate-y-px"
    >
      <RouteIcon size={15} />
      {label}
    </Link>
  );
}

/** 讀取中：讀螢幕軟體會唸出 label（role=status），轉圈本身不唸 */
export function LoadingBlock({ label = "整理資料中…" }: { label?: string }) {
  return (
    <div role="status" className="grid place-items-center gap-3 rounded-[var(--radius-card)] glass py-14">
      <span aria-hidden="true" className="relative grid size-9 place-items-center">
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-[color:var(--paper-edge)] border-t-[color:var(--maple)]" />
      </span>
      <p className="text-sm ink-soft">{label}</p>
    </div>
  );
}

export function EmptyBlock({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-[color:var(--paper-edge)] px-4 py-10 text-center">
      <p className="font-bold">{title}</p>
      {hint ? <p className="mt-1.5 text-sm ink-soft">{hint}</p> : null}
    </div>
  );
}
