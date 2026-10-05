"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertIcon, BoatIcon, ChevronDown, ChevronRight, PinIcon, RouteIcon } from "@/components/Icons";
import { MapPicker } from "@/components/MapPicker";
import { EmptyBlock, LoadingBlock } from "@/components/PlanShell";
import { loadGraph, loadMaps, loadNearestTown, mapName, minimapImage } from "@/lib/data";
import { normalizeJob } from "@/lib/jobs";
import { portalDirection, portalSentence } from "@/lib/portal-text";
import { useProfile } from "@/lib/profile";
import {
  MAIN_TOWNS, VICTORIA_PORT, findRoute, goNoteText, goStart, suggestStart, townChips, townsTitle, victoriaReach, type GoNote, type RouteStep, type StartChoice,
} from "@/lib/route";
import { isIslandMap } from "@/lib/route-planner";
import type { MapRecord, PortalEdge } from "@/lib/types";

/** 玩家上次自己選的起點（目的地本身是城鎮時拿來當預設起點） */
const START_KEY = "ms-go-start";

function readRememberedStart(): number | null {
  try {
    const value = Number(localStorage.getItem(START_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function rememberStart(mapId: number) {
  try {
    localStorage.setItem(START_KEY, String(mapId));
  } catch {
    // 停用本機儲存時照樣能用，只是下次不會記得
  }
}

export function GoNavigator() {
  const router = useRouter();
  const params = useSearchParams();
  const target = Number(params.get("to")) || null;
  const forcedStart = Number(params.get("from")) || null;

  const [maps, setMaps] = useState<Record<string, MapRecord> | null>(null);
  const [graph, setGraph] = useState<Record<string, PortalEdge[]> | null>(null);
  const [nearestTown, setNearestTown] = useState<Record<string, [number, number]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remembered, setRemembered] = useState<number | null>(null);

  useEffect(() => {
    setRemembered(readRememberedStart());
    Promise.all([loadMaps(), loadGraph(), loadNearestTown()])
      .then(([mapData, graphData, townData]) => {
        setMaps(mapData);
        setGraph(graphData);
        setNearestTown(townData);
      })
      .catch(loadError => setError(String(loadError.message ?? loadError)));
  }, []);

  // 初心者不管幾等都可能還在楓之島（看本機存的角色）：沒自己選起點時從船靠岸的維多利亞港出發，路線上面先說要搭船（route.ts goStart）
  const { profile, loaded } = useProfile();
  const novice = loaded && profile.level > 0 && normalizeJob(profile.job) === 0;

  // 自己選的起點（網址的 from）照用；沒選就用最近的城鎮，目的地本身是城鎮時改用上次選的起點，都不行就先問；初心者見上
  const decided = useMemo<{ choice: StartChoice; notes: GoNote[] } | null>(() => {
    if (!target) return forcedStart ? { choice: { kind: "start", map: forcedStart }, notes: [] } : null;
    if (!graph || !maps || !nearestTown) return null;
    return goStart({
      target,
      // 沒有名字的圖（未開放）不能當起點，網址帶了也不算
      picked: forcedStart && maps[String(forcedStart)]?.zh ? forcedStart : null,
      suggested: suggestStart(graph, maps, nearestTown, target),
      remembered,
      novice,
      reaches: from => findRoute(graph, from, target).ok,
      reach: victoriaReach(graph),
    });
  }, [forcedStart, graph, maps, nearestTown, target, remembered, novice]);
  const choice = decided?.choice ?? null;
  const notes = decided?.notes ?? [];
  const start = choice?.kind === "start" ? choice.map : null;

  const plan = useMemo(() => {
    if (!graph || !target || !start) return null;
    return findRoute(graph, start, target);
  }, [graph, start, target]);

  const setParam = useCallback(
    (key: string, value: number | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null) next.delete(key);
      else next.set(key, String(value));
      router.replace(`/go?${next.toString()}`);
    },
    [params, router],
  );

  /** 玩家自己選起點：記下來，下次目的地是城鎮時就從這裡出發。沒有名字的圖（未開放）不能當起點 */
  const pickStart = useCallback(
    (mapId: number) => {
      if (!maps?.[String(mapId)]?.zh) return;
      rememberStart(mapId);
      setRemembered(mapId);
      setParam("from", mapId);
    },
    [maps, setParam],
  );

  // 角色也要讀到（初心者的起點不一樣），不然會先排一條路再換掉
  const ready = Boolean(maps && graph && nearestTown) && loaded;

  return (
    <div className="space-y-5 py-3 sm:py-6">
      <nav aria-label="麵包屑" className="flex items-center gap-1 text-sm ink-faint">
        <Link href="/" className="hover:text-[color:var(--maple)]">我的路線</Link>
        <ChevronRight size={13} />
        <span className="text-[color:var(--ink-soft)]">帶我去</span>
      </nav>

      <header>
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">帶我去</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">
          一段一段告訴你走哪個傳送門。出發點不對就自己改。
        </p>
      </header>

      {error ? (
        <EmptyBlock title="資料載入失敗" hint={error} />
      ) : !ready ? (
        <LoadingBlock label="載入地圖資料…" />
      ) : (
        <>
          <div className="grid gap-3 rounded-[var(--radius-card)] glass wood-frame p-3.5 sm:grid-cols-2 sm:p-4">
            <MapPicker
              label="從哪裡出發"
              value={start}
              maps={maps!}
              onSelect={pickStart}
              placeholder={choice?.kind === "ask" ? "輸入地圖名稱" : "預設是最近的城鎮"}
            />
            <MapPicker
              label="要去哪裡"
              value={target}
              maps={maps!}
              onSelect={mapId => setParam("to", mapId)}
              placeholder="輸入地圖名稱"
            />
          </div>

          {!target ? (
            <EmptyBlock title="先選一個目的地" hint="或從練功、任務、打寶的結果直接按「帶我去」。" />
          ) : choice?.kind === "ask" ? (
            <section className="space-y-3">
              <GoNotes notes={notes} from="" />
              {/* 城鎮捷徑：維多利亞島的主要城鎮先排、走得到目的地的才給；按了就是自己選的起點（記下來、不再提島上的事） */}
              <div className="rounded-[var(--radius-card)] border border-dashed border-[color:var(--paper-edge)] px-4 py-6 text-center">
                <p className="font-bold">你現在在哪個城鎮？選好就幫你排路線。</p>
                <TownChips
                  towns={townChips(maps!, graph!, target, { first: MAIN_TOWNS, exceptTarget: true })}
                  maps={maps!}
                  onPick={pickStart}
                  className="mt-3 justify-center"
                />
              </div>
            </section>
          ) : !start ? (
            <EmptyBlock
              title="找不到可以走過去的起點"
              hint="這張圖在客戶端資料裡沒有連到任何城鎮，可能是活動地圖或副本。"
            />
          ) : plan?.ok ? (
            <RouteList steps={plan.steps} maps={maps!} hops={plan.hops} graph={graph!} notes={notes} />
          ) : plan && plan.reason === "different-area" ? (
            <CrossAreaNotice
              maps={maps!}
              graph={graph!}
              from={start}
              to={target}
              novice={novice}
              onPickStart={pickStart}
            />
          ) : (
            <EmptyBlock title="算不出路線" hint="兩張圖之間沒有傳送門相連。" />
          )}
        </>
      )}
    </div>
  );
}

/** 路線上面要自己搭船的那段（route.ts goStart）；我們沒有船班資料，只照實說、不編路線。from：起點的名字（跨區那句用） */
function GoNotes({ notes, from, className = "" }: { notes: GoNote[]; from: string; className?: string }) {
  if (!notes.length) return null;
  return (
    <div className={`flex items-start gap-2.5 rounded-xl bg-[color:var(--gold-wash)] px-3.5 py-2.5 ${className}`}>
      <BoatIcon size={18} className="mt-0.5 shrink-0 text-[color:var(--gold)]" />
      <div className="space-y-1">
        {notes.map(note => (
          <p key={note} className="text-sm font-bold leading-relaxed">{goNoteText(note, from)}</p>
        ))}
      </div>
    </div>
  );
}

function RouteList({
  steps,
  maps,
  hops,
  graph,
  notes,
}: {
  steps: RouteStep[];
  maps: Record<string, MapRecord>;
  hops: number;
  graph: Record<string, PortalEdge[]>;
  notes: GoNote[];
}) {
  return (
    <section aria-label="路線">
      <GoNotes notes={notes} from={mapName(maps, steps[0]?.map)} className="mb-3" />
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-[color:var(--leaf-wash)] px-3.5 py-2.5">
        <RouteIcon size={18} className="shrink-0 text-[color:var(--leaf)]" />
        <p className="text-sm font-bold">
          {hops === 0 ? "你已經在目的地了" : `共 ${hops} 段，經過 ${steps.length} 張圖`}
        </p>
      </div>

      <ol className="space-y-2">
        {steps.map((step, index) => (
          <RouteCard
            key={`${step.map}-${index}`}
            step={step}
            index={index}
            total={steps.length}
            maps={maps}
            graph={graph}
            previous={steps[index - 1]?.map}
          />
        ))}
      </ol>
    </section>
  );
}

function RouteCard({
  step,
  index,
  total,
  maps,
  graph,
  previous,
}: {
  step: RouteStep;
  index: number;
  total: number;
  maps: Record<string, MapRecord>;
  graph: Record<string, PortalEdge[]>;
  previous?: number;
}) {
  const [open, setOpen] = useState(false);
  const record = maps[String(step.map)];
  const name = mapName(maps, step.map);
  const isStart = index === 0;
  const isEnd = index === total - 1;
  const unnamed = !record?.zh;
  const previousEdges = previous !== undefined ? graph[String(previous)] ?? [] : [];
  const direction = portalDirection(step.via, step.x, step.y, previousEdges.map(([, , px, py]) => [px, py] as [number, number]));

  return (
    <li className="overflow-hidden rounded-[var(--radius-card)] glass wood-frame">
      <div className="flex items-start gap-3 p-3.5">
        <div className="flex shrink-0 flex-col items-center">
          <span
            className="grid size-8 place-items-center rounded-full text-sm font-black tabular-nums"
            style={{
              backgroundColor: isEnd ? "var(--maple)" : isStart ? "var(--leaf)" : "var(--paper-deep)",
              color: isEnd || isStart ? "#fff" : "var(--ink-soft)",
            }}
          >
            {isEnd ? <PinIcon size={16} /> : index + 1}
          </span>
          {!isEnd ? <span className="mt-1 h-full min-h-6 w-px bg-[color:var(--paper-edge)]" /> : null}
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[17px] font-black leading-tight">{unnamed ? "一條小通道（遊戲裡沒有名字）" : name}</span>
            {record?.st ? <span className="text-xs ink-faint">{record.st}</span> : null}
          </p>

          {isStart ? (
            <p className="mt-0.5 text-sm font-bold text-[color:var(--leaf)]">出發點</p>
          ) : (
            <p className="mt-0.5 text-sm ink-soft">{portalSentence(direction)}</p>
          )}
          {isEnd && !isStart ? (
            <p className="mt-0.5 text-sm font-bold text-[color:var(--maple)]">到了</p>
          ) : null}

          {record?.mm ? (
            <>
              <button
                type="button"
                onClick={() => setOpen(value => !value)}
                className="tap-safe mt-1 inline-flex items-center gap-1 text-[13px] font-bold ink-soft hover:text-[color:var(--maple)]"
                aria-expanded={open}
              >
                {open ? "收起小地圖" : "看小地圖"}
                <ChevronDown size={14} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
              </button>
              {open ? (
                <figure className="mt-2 overflow-hidden rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] p-2">
                  <Image
                    src={minimapImage(step.map)}
                    alt={unnamed ? "小通道 小地圖" : `${name} 小地圖`}
                    width={640}
                    height={200}
                    className="mx-auto h-auto w-full object-contain"
                    unoptimized
                  />
                </figure>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** 「從 X 出發」的城鎮按鈕（跨區、問起點時共用）；按了就是玩家自己選的起點 */
function TownChips({
  towns,
  maps,
  onPick,
  className = "",
}: {
  towns: number[];
  maps: Record<string, MapRecord>;
  onPick: (mapId: number) => void;
  className?: string;
}) {
  if (!towns.length) return null;
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`}>
      {towns.map(mapId => (
        <li key={mapId}>
          <button
            type="button"
            onClick={() => onPick(mapId)}
            className="tap-safe rounded-full bg-[color:var(--paper-deep)] px-3 py-1.5 text-sm font-bold transition-colors hover:bg-[color:var(--maple-wash)] hover:text-[color:var(--maple)]"
          >
            從 {mapName(maps, mapId)} 出發
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * 走不到就照實說，並列出走得到目的地的城鎮（真的城鎮才列：民宅、沒有名字的圖不算；初心者把維多利亞港排第一）。
 * 楓之谷跨大陸本來就要搭船或計程車，那一段不是傳送門，我們不假裝算得出來；從楓之島出發的那段是搭船。
 */
function CrossAreaNotice({
  maps,
  graph,
  from,
  to,
  novice,
  onPickStart,
}: {
  maps: Record<string, MapRecord>;
  graph: Record<string, PortalEdge[]>;
  from: number;
  to: number;
  novice: boolean;
  onPickStart: (mapId: number) => void;
}) {
  const towns = townChips(maps, graph, to, { first: novice ? [VICTORIA_PORT] : [] });

  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-[var(--radius-card)] bg-[color:var(--gold-wash)] p-3.5">
        <BoatIcon size={20} className="mt-0.5 shrink-0 text-[color:var(--gold)]" />
        <div className="min-w-0 text-sm leading-relaxed">
          <p className="font-bold">
            {mapName(maps, from)} 走不到 {mapName(maps, to)}
          </p>
          <p className="mt-1 ink-soft">
            這兩張圖不在同一個可步行區域。楓之谷跨大陸要搭船或計程車，那一段沒有傳送門資料，
            所以我們不會編一條路線給你。先在遊戲裡{isIslandMap(from) ? "搭船" : "搭車"}過去，再從下面挑一個當地城鎮重算路線。
          </p>
        </div>
      </div>

      {towns.length ? (
        <div className="rounded-[var(--radius-card)] glass wood-frame p-3.5">
          <p className="mb-2 text-sm font-bold">{townsTitle(maps, towns)}</p>
          <TownChips towns={towns} maps={maps} onPick={onPickStart} />
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-[var(--radius-card)] glass p-3.5 text-sm ink-soft">
          <AlertIcon size={17} className="mt-0.5 shrink-0" />
          <p>目標區域在資料裡找不到城鎮，可能是副本或活動地圖。</p>
        </div>
      )}
    </section>
  );
}
