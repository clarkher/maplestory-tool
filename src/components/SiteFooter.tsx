"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadMeta } from "@/lib/data";
import type { Meta } from "@/lib/types";

export function SiteFooter() {
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    loadMeta().then(setMeta).catch(() => setMeta(null));
  }, []);

  return (
    <footer className="mt-auto border-t border-[color:var(--paper-edge)] bg-[color:var(--paper-deep)]/60">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 text-sm sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md space-y-2">
            <p className="font-bold">楓谷幫手</p>
            <p className="ink-soft leading-relaxed">
              新楓之谷經典版的規劃工具。遊戲數值取自客戶端資料，地圖路線取自 v83 地圖檔。
              本站為玩家自製，與遊戲官方無關。
            </p>
            {meta ? (
              <p className="ink-faint text-xs leading-relaxed">
                遊戲版本 {meta.gameVersion ?? "—"}
                {meta.dataGeneratedAtText ? ` · 資料更新 ${meta.dataGeneratedAtText}` : ""}
              </p>
            ) : null}
          </div>

          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="頁尾選單">
            <Link className="ink-soft hover:text-[color:var(--maple)]" href="/about">資料從哪來</Link>
            <Link className="ink-soft hover:text-[color:var(--maple)]" href="/privacy">隱私權政策</Link>
            <Link className="ink-soft hover:text-[color:var(--maple)]" href="/terms">服務條款</Link>
            <Link className="ink-soft hover:text-[color:var(--maple)]" href="/contact">聯絡我們</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
