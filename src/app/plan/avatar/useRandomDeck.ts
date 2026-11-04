"use client";

/**
 * 紙娃娃「隨機穿搭」的下一套：按過一次之後，舞台閒下來就先算好一套、先要第 0 格，下次按直接用（舞台查得到預載，不等 250ms）。
 *
 *   const deck = useRandomDeck(data, outfit, locks);
 *   <Stage ... onReady={deck.stageReady} />
 *   const next = deck.draw();   // 有備好就回那一套，沒有就現算；data、outfit 還沒好回 null
 *
 * 什麼時候才預載：舞台的預載 Map 只留一張，preloadFrame 會把上一張清掉。所以要等舞台把「現在這一套」的第 0 格畫好
 * （stageReady，接 Stage 的 onReady）才預載下一套；太早預載會清掉剛抽走、舞台還沒拿的那張，白等 250ms。
 * 不能看 onBusy：它在 250ms 等待跟要圖的前 150ms 都是 false，false 不代表閒著。
 *
 * 備好的那套什麼時候不能用：deckKey 變了（動作、表情、翻面、性別、鎖、鎖住的那幾件）。
 *   動作、表情、翻面、性別、鎖住的那件一變，舞台會重畫，畫好（stageReady）才重算；
 *   只有鎖變的時候舞台不重畫，stageReady 不會再來，這裡看到 key 變了就自己重算。
 * 還沒按過不預載；瀏覽器開省流量（navigator.connection.saveData）不預載，每次按現算。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { deckKey } from "@/lib/avatar/looks";
import type { LockKey } from "@/lib/avatar/looks";
import type { Outfit } from "@/lib/avatar/outfit";
import { randomOutfit } from "@/lib/avatar/random";
import { characterUrl } from "@/lib/avatar/render";
import type { AvatarData } from "@/lib/avatar/types";
import { preloadFrame } from "./Stage";

/** 要跟 Stage 組的第 0 格一字不差，舞台才查得到預載 */
const firstFrame = (o: Outfit, data: AvatarData) => characterUrl(o, data, { frame: 0, resize: 1, mode: 4 });

/** TS 內建的 Navigator 沒有 connection（Network Information API，Chrome 系才有，其他瀏覽器當作沒開省流量） */
const saveData = () => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

export function useRandomDeck(data: AvatarData | null, outfit: Outfit | null, locks: ReadonlySet<LockKey>) {
  const key = outfit ? deckKey(outfit, locks) : "";
  const frameUrl = outfit && data ? firstFrame(outfit, data) : null;
  /** 舞台畫好第 0 格的是哪一張：跟現在這套對得上才算閒著（穿搭、動作、表情、翻面一變就對不上；鎖變了還對得上） */
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);
  const prepared = useRef<{ key: string; outfit: Outfit } | null>(null);
  /** 剛抽走時那一套的第 0 格：網址換過去之前它才載好不算閒著（不然會預載下一套，把抽走的那張清掉） */
  const leaving = useRef<string | null>(null);
  const idle = frameUrl !== null && readyUrl === frameUrl;

  useEffect(() => {
    if (!idle || !pressed || !data || !outfit) return;
    if (prepared.current?.key === key || saveData()) return;
    const next = randomOutfit(data, outfit, Math.random, locks);
    preloadFrame(firstFrame(next, data));
    prepared.current = { key, outfit: next };
  }, [idle, pressed, key, data, outfit, locks]);

  const stageReady = useCallback(() => {
    if (frameUrl === leaving.current) return;
    leaving.current = null;
    setReadyUrl(frameUrl);
  }, [frameUrl]);

  const draw = useCallback((): Outfit | null => {
    if (!data || !outfit) return null;
    const next = prepared.current?.key === key ? prepared.current.outfit : randomOutfit(data, outfit, Math.random, locks);
    prepared.current = null;
    leaving.current = frameUrl;
    setReadyUrl(null); // 等舞台畫好抽走的這套才預載下一套
    setPressed(true);
    return next;
  }, [data, outfit, locks, key, frameUrl]);

  return { draw, stageReady };
}
