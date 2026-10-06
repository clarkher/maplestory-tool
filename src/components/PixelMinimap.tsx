"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { minimapScale } from "@/lib/minimap";

type Measured = { width: number; height: number; pixelated: boolean };

/**
 * 遊戲內小地圖的原始圖都很小（中位數 91×71px），直接拉滿卡片寬度會整張糊掉
 * （放大用的是瀏覽器平滑縮放，不是遊戲原本的像素）。
 *
 * 這裡量容器實際寬度，照 lib/minimap.ts 的 minimapScale 算出「不糊」的最大整數倍，
 * 用明確的 px 寬高畫出來、置中，不再撐滿卡片。圖本身比容器還大的例外情況
 * （例如極少數的寬圖）才縮小＋改用平滑算圖，不然放大一律維持像素銳利。
 *
 * 圖載入前容器先保留一點高度，避免載完突然跳版面。
 */
export function PixelMinimap({
  src,
  alt,
  maxHeight = 260,
  className = "",
}: {
  src: string;
  alt: string;
  /** 放大後最高幾 px，預設 260——卡片裡夠看就好，不用逼近整個螢幕高 */
  maxHeight?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const naturalRef = useRef<{ w: number; h: number } | null>(null);
  const [measured, setMeasured] = useState<Measured | null>(null);

  const recompute = () => {
    const natural = naturalRef.current;
    const container = containerRef.current;
    if (!natural || !container) return;
    const maxW = container.clientWidth || natural.w;
    const scale = minimapScale(natural.w, natural.h, maxW, maxHeight);
    setMeasured({
      width: Math.round(natural.w * scale),
      height: Math.round(natural.h * scale),
      pixelated: scale >= 1,
    });
  };

  // 換了另一張圖（src 變了）就重新量，不要沿用上一張算出來的尺寸
  useEffect(() => {
    naturalRef.current = null;
    setMeasured(null);
  }, [src]);

  // 視窗寬度變了（例如轉橫向、手動縮放視窗）重新量一次容器寬度
  useEffect(() => {
    if (!measured) return;
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured]);

  return (
    <div ref={containerRef} className={`flex w-full justify-center ${className}`} style={!measured ? { minHeight: 80 } : undefined}>
      <Image
        src={src}
        alt={alt}
        width={measured?.width ?? 1}
        height={measured?.height ?? 1}
        unoptimized
        onLoad={event => {
          const img = event.currentTarget;
          naturalRef.current = { w: img.naturalWidth, h: img.naturalHeight };
          recompute();
        }}
        className={`object-contain ${measured ? (measured.pixelated ? "[image-rendering:pixelated]" : "") : "opacity-0"}`}
        style={measured ? { width: measured.width, height: measured.height } : undefined}
      />
    </div>
  );
}
