// src/app/plan/speed/PracticeSpeed.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoadingBlock } from "@/components/PlanShell";
import { loadGuideCommon, loadItems, loadMaps, loadMonsters, loadSpeedNames, loadTraining, mapName } from "@/lib/data";
import { formatNumber } from "@/lib/format";
import { useStoredProfile } from "@/lib/profile";
import { startCapture, type CaptureHandle } from "@/lib/speed/capture";
import { durationText, etaText } from "@/lib/speed/format";
import type { RawSpeedNames } from "@/lib/speed/names";
import { backCalc, mapPartyExp, membersOf } from "@/lib/speed/party-exp";
import type { FrameReading } from "@/lib/speed/read-frame";
import { resolveMap, settleTitle, type MapGuess, type TitleSettle } from "@/lib/speed/read-map";
import type { BoardRow } from "@/lib/speed/server/rules";
import { readMapMemory, rememberMap, useSpeedSettings, type SpeedParty, type SpeedSettings } from "@/lib/speed/settings";
import {
  createTracker, durationMs, feed, levelHints, mainMap, minutesToLevel, shouldSave, startManual, stopManual, switchMode, tenMinuteExp, tick,
  type Mode, type Sample, type Segment, type Step, type Tracker,
} from "@/lib/speed/tracker";
import { backCalcLine, jobName, levelPercent, nextHints, partySize, runBody, saveNote, type HintState, type SaveOutcome } from "@/lib/speed/view";
import type { Item, MapRecord, Monster, TrainingRow } from "@/lib/types";
import { MiniWindow, pipSupported } from "./MiniWindow";
import { PartyCard } from "./PartyCard";
import { BigNumber, BUTTON_LINE, BUTTON_MAIN, Card, CharacterCard, Disclaimer, Leaderboard, MapChoices, MapPanel, type BoardState } from "./parts";

type Data = {
  maps: Record<string, MapRecord>;
  monsterById: Map<number, Monster>;
  items: Map<number, Item>;
  training: TrainingRow[];
  trainingIds: Set<number>;
  toNext: number[];
  names: RawSpeedNames;
};
type Status = "idle" | "waiting" | "reading" | "lost";
/** 小地圖標題穩定後的 key（餵給練功計算當 mapKey），跟這個 key 認出來的地圖 */
type Place = { settle: TitleSettle; key: string | null; guess: MapGuess | null };

const CLIENT_VER = "v0.95";
const FRESH_HINTS: HintState = { nullRun: 0, cleared: false };
const NO_PLACE: Place = { settle: { key: null, candidate: null, streak: 0 }, key: null, guess: null };

/** 電腦的 Chrome／Edge 才有分享畫面；手機、平板（手指操作）不給 */
function canShare(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia && !window.matchMedia("(pointer: coarse)").matches;
}

export function PracticeSpeed() {
  const { profile } = useStoredProfile();
  const [settings, saveSettings, settingsLoaded] = useSpeedSettings();
  const [support, setSupport] = useState<"checking" | "ok" | "no">("checking");
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [starting, setStarting] = useState(false);
  const [reading, setReading] = useState<FrameReading | null>(null);
  const [place, setPlace] = useState<Place>(NO_PLACE);
  const [tracker, setTracker] = useState<Tracker>(() => createTracker("auto"));
  const [lastSaved, setLastSaved] = useState<{ seg: Segment; note: string } | null>(null);
  const [board, setBoard] = useState<BoardState>({ kind: "loading" });
  const [tab, setTab] = useState<"solo" | "party">("solo");
  const [mini, setMini] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const capture = useRef<CaptureHandle | null>(null);
  // 讀畫面的回呼在按「分享」那一刻就交出去了，之後不會換：裡面用到的東西都走 ref，才不會拿到舊的
  // （例如之後才填的角色 ID、之後才勾的組隊）
  const trackerRef = useRef(tracker);
  const dataRef = useRef(data);
  const settingsRef = useRef(settings);
  const profileJobRef = useRef(profile.job);
  const placeRef = useRef(place);
  const hintRef = useRef(FRESH_HINTS);
  const sentHints = useRef("");
  /** 這次分享看過的地圖 key → 地圖 id（自動認出來的、玩家點的）：一段開始時還沒認出地圖，存的時候補上 */
  const knownMaps = useRef(new Map<string, number>());

  useEffect(() => {
    dataRef.current = data;
    settingsRef.current = settings;
    profileJobRef.current = profile.job;
  }, [data, settings, profile.job]);

  useEffect(() => setSupport(canShare() ? "ok" : "no"), []);
  useEffect(() => {
    if (!settingsLoaded) return;
    trackerRef.current = createTracker(settingsRef.current.mode);
    setTracker(trackerRef.current);
  }, [settingsLoaded]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadMaps(), loadMonsters(), loadItems(), loadTraining(), loadGuideCommon(), loadSpeedNames()]).then(
      ([maps, monsters, items, training, common, names]) => {
        if (cancelled) return;
        setData({
          maps,
          monsterById: new Map(monsters.map(monster => [monster.id, monster])),
          items: new Map(items.map(item => [item.id, item])),
          training,
          trainingIds: new Set(training.map(row => row.m)),
          toNext: common.expTable.toNext,
          names,
        });
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // 離開這頁就停止分享
  useEffect(() => () => capture.current?.stop(), []);

  const updateSettings = useCallback(
    (patch: Partial<SpeedSettings>) => {
      const next = { ...settingsRef.current, ...patch };
      settingsRef.current = next;
      saveSettings(next);
    },
    [saveSettings],
  );

  /** 一段收掉了：夠長就存進排行，「上一段」那行寫結果 */
  const save = useCallback(async (seg: Segment) => {
    if (seg.gained <= 0) return;
    const current = dataRef.current;
    const set = settingsRef.current;
    const where = mainMap(seg);
    const mapId = where.mapId ?? (where.key !== null ? knownMaps.current.get(where.key) ?? null : null);
    const body = runBody(seg, { mapId, mapName: mapId !== null && current ? mapName(current.maps, mapId) : null }, {
      charId: set.charId, isPublic: set.isPublic, party: set.party, profileJob: profileJobRef.current, clientVer: CLIENT_VER,
    });
    const note = (outcome: SaveOutcome) => setLastSaved({ seg, note: saveNote(outcome, body) });
    if (!shouldSave(seg)) return note({ kind: "short" });
    if (!set.charId) return note({ kind: "noId" });
    try {
      const response = await fetch("/api/speed/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; ranked?: boolean; error?: string };
      note({ kind: "response", status: response.status, ok: response.ok && result.ok === true, ranked: result.ranked, error: result.error });
    } catch {
      note({ kind: "network" });
    }
  }, []);

  const apply = useCallback(
    (step: Step) => {
      trackerRef.current = step.tracker;
      setTracker(step.tracker);
      if (step.closed) void save(step.closed);
    },
    [save],
  );

  const sendHints = useCallback((hints: number[]) => {
    const text = hints.join(",");
    if (text === sentHints.current) return;
    sentHints.current = text;
    capture.current?.setHints(hints);
  }, []);

  const onReading = useCallback(
    (next: FrameReading, at: number) => {
      const current = dataRef.current;
      if (!current) return;
      setReading(next);
      setStatus(next.bar ? "reading" : "waiting");

      // 地圖：標題的長相連續幾張一樣才算換圖（settleTitle）；換了才重新認是哪張圖
      const before = placeRef.current;
      const settle = settleTitle(before.settle, next.title?.signature ?? null);
      let { key, guess } = before;
      if (settle.key !== key) {
        key = settle.key;
        guess = key !== null && next.title ? resolveMap(next.title, current.maps, current.trainingIds, readMapMemory()) : null;
        if (key !== null && guess?.mapId != null) knownMaps.current.set(key, guess.mapId);
      }
      const nextPlace = { settle, key, guess };
      placeRef.current = nextPlace;
      if (key !== before.key || guess !== before.guess) setPlace(nextPlace);

      let accepted = false;
      if (next.exp) {
        const sample: Sample = {
          at, exp: next.exp.exp, level: next.exp.level, mapKey: key, mapId: guess?.mapId ?? null, job: next.job, party: partySize(settingsRef.current.party),
        };
        const step = feed(trackerRef.current, sample, current.toNext);
        apply(step);
        accepted = step.tracker.last === sample;
      }
      const hint = nextHints(hintRef.current, { bar: next.bar, exp: next.exp !== null }, { accepted, hints: levelHints(trackerRef.current) });
      hintRef.current = hint.state;
      if (hint.hints) sendHints(hint.hints);
    },
    [apply, sendHints],
  );

  // 每秒：自動模式 1 分鐘沒動就停；畫面上「練了多久」跟著走
  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      apply(tick(trackerRef.current, at));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status, apply]);

  const mapId = place.guess?.mapId ?? null;
  useEffect(() => {
    if (mapId === null) return;
    let cancelled = false;
    setBoard({ kind: "loading" });
    fetch(`/api/speed/board?map=${mapId}`)
      .then(async response => {
        if (!response.ok) throw new Error(String(response.status));
        const result = (await response.json()) as { open: boolean; solo: BoardRow[]; party: BoardRow[] };
        if (!cancelled) setBoard({ kind: "ok", open: result.open, solo: result.solo ?? [], party: result.party ?? [] });
      })
      .catch(() => {
        if (!cancelled) setBoard({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [mapId, lastSaved]);

  const onStart = async () => {
    if (!data || starting) return;
    setStarting(true);
    try {
      const handle = await startCapture({ toNext: data.toNext, names: data.names }, onReading);
      capture.current = handle;
      hintRef.current = FRESH_HINTS;
      sentHints.current = "";
      sendHints(levelHints(trackerRef.current));
      setStatus("waiting");
      handle.ended.then(() => {
        if (capture.current === handle) capture.current = null;
        setStatus("lost");
        // 分享停了：進行中的那段收掉（自動算到最後一次變動、手動算到現在）
        apply(switchMode(trackerRef.current, trackerRef.current.mode, Date.now()));
      });
    } catch {
      // 玩家在選視窗那一步按取消，或瀏覽器不給：回到原本的樣子
    } finally {
      setStarting(false);
    }
  };

  const onMode = (mode: Mode) => {
    if (mode === trackerRef.current.mode) return;
    updateSettings({ mode });
    apply(switchMode(trackerRef.current, mode, Date.now()));
  };

  const onPickMap = (id: number) => {
    const key = placeRef.current.key;
    if (key !== null) {
      rememberMap(key, id);
      knownMaps.current.set(key, id);
    }
    const nextPlace = { ...placeRef.current, guess: { mapId: id, confident: true, choices: [] } };
    placeRef.current = nextPlace;
    setPlace(nextPlace);
  };

  const closeMini = useCallback(() => setMini(false), []);
  const onParty = useCallback((party: SpeedParty) => updateSettings({ party }), [updateSettings]);

  const seg = tracker.seg;
  const per10 = seg ? tenMinuteExp(seg) : null;
  const eta = seg && data ? minutesToLevel(seg, data.toNext) : null;
  const elapsed = seg ? (seg.mode === "manual" ? Math.max(0, now - seg.startedAt) : seg.lastChangeAt - seg.startedAt) : 0;
  const jobId = reading?.job ?? (profile.job >= 0 ? profile.job : null);
  // 自己的等級：練功計算接受的那張 → 畫面剛讀到的 → 「我的路線」填的
  const selfLevel = tracker.last?.level ?? reading?.exp?.level ?? (profile.level > 0 ? profile.level : null);
  const party = settings.party;
  const members = useMemo(() => (party.on && party.others.length && selfLevel !== null ? membersOf(selfLevel, party) : null), [party, selfLevel]);
  const backLine = useMemo(() => {
    if (!members || per10 === null || mapId === null || !data) return null;
    const row = data.training.find(item => item.m === mapId);
    if (!row) return null;
    return backCalcLine(backCalc(per10, mapPartyExp(row, data.monsterById, members).perKill), members.map(member => member.level));
  }, [members, per10, mapId, data]);

  const statusText = useMemo(() => {
    if (status === "idle") return "還沒分享畫面";
    if (status === "lost") return "分享停了，再按一次「分享遊戲畫面」";
    if (status === "waiting" || !reading?.bar) return "認不到遊戲畫面：選楓之谷的視窗、別縮到最小";
    if (!reading.exp) return "讀不到經驗：視窗太小或被擋住，放大一點";
    if (tracker.mode === "manual" && !tracker.manualOn) return "按「開始」就開始算";
    if (!seg) return "等經驗一動就開始算";
    return "量中";
  }, [status, reading, tracker, seg]);

  if (support === "no") {
    return (
      <Shell>
        <Card>
          <p className="font-bold">要用電腦的 Chrome 或 Edge 開。</p>
          <p className="mt-1.5 text-sm ink-soft">手機的瀏覽器不能分享畫面。</p>
        </Card>
        <Disclaimer />
      </Shell>
    );
  }
  if (failed) {
    return (
      <Shell>
        <Card>
          <p className="font-bold">資料沒載到，等一下再過來。</p>
        </Card>
      </Shell>
    );
  }
  if (!data || support === "checking" || !settingsLoaded) {
    return (
      <Shell>
        <LoadingBlock />
      </Shell>
    );
  }

  const sharing = status === "waiting" || status === "reading";
  const percent = reading?.exp ? levelPercent(reading.exp.exp, reading.exp.level, data.toNext) : null;
  const perLevel = per10 !== null && seg && data.toNext[seg.level] ? (per10 / data.toNext[seg.level]) * 100 : null;
  const job = jobName(jobId);

  return (
    <Shell>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <CharacterCard settings={settings} onSave={updateSettings} />
          <PartyCard party={party} selfLevel={selfLevel} onChange={onParty} />
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              {sharing ? (
                <button type="button" onClick={() => capture.current?.stop()} className="rounded-full border border-[color:var(--paper-edge)] px-4 py-2 font-bold hover:bg-[color:var(--maple-wash)]">
                  停止分享
                </button>
              ) : (
                <button type="button" onClick={onStart} disabled={starting} className={BUTTON_MAIN}>
                  分享遊戲畫面
                </button>
              )}
              <div className="flex rounded-full border border-[color:var(--paper-edge)] p-0.5" role="radiogroup" aria-label="模式">
                {(["auto", "manual"] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={tracker.mode === mode}
                    onClick={() => onMode(mode)}
                    className={`rounded-full px-3 py-1 text-sm font-bold ${tracker.mode === mode ? "bg-[color:var(--maple)] text-[color:var(--on-accent)]" : "ink-soft"}`}
                  >
                    {mode === "auto" ? "自動" : "手動"}
                  </button>
                ))}
              </div>
              {tracker.mode === "manual" && status === "reading" ? (
                tracker.manualOn ? (
                  <button type="button" onClick={() => apply(stopManual(trackerRef.current, Date.now()))} className={BUTTON_LINE}>
                    停止
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => apply({ tracker: startManual(trackerRef.current, Date.now()), closed: null })}
                    className="rounded-full bg-[color:var(--maple)] px-3 py-1.5 text-sm font-bold text-[color:var(--on-accent)]"
                  >
                    開始
                  </button>
                )
              ) : null}
              {pipSupported() && status !== "idle" ? (
                <button type="button" onClick={() => setMini(value => !value)} className={BUTTON_LINE}>
                  {mini ? "收起小浮窗" : "小浮窗"}
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-sm ink-soft" role="status">
              {statusText}
              {tracker.mode === "auto" ? "（自動：經驗 1 分鐘沒動就停）" : "（手動：按停止才停）"}
            </p>
          </Card>

          <Card>
            <div className="grid grid-cols-2 gap-4">
              <BigNumber label="10 分鐘經驗" value={per10 !== null ? formatNumber(per10) : "—"} note={perLevel !== null ? `這一級的 ${perLevel.toFixed(1)}%` : undefined} />
              <BigNumber label="升級還要" value={eta !== null ? etaText(eta) : "—"} />
              <BigNumber label="這段練了" value={seg ? durationText(elapsed) : "—"} />
              <BigNumber label="這段拿到" value={seg ? formatNumber(seg.gained) : "—"} />
            </div>
            {backLine ? <p className="mt-3 text-[13px] font-bold">{backLine}</p> : null}
            <p className="mt-3 text-[13px] ink-soft">
              {reading?.exp ? `Lv.${reading.exp.level} · 經驗 ${formatNumber(reading.exp.exp)}${percent !== null ? `（${percent.toFixed(2)}%）` : ""}` : "等級、經驗：還沒讀到"}
              {job ? ` · ${job}` : ""}
              {reading ? ` · ${partySize(party) > 1 ? `組隊 ${partySize(party)} 人` : "單練"}` : ""}
            </p>
            {lastSaved ? (
              <p className="mt-2 text-[13px]">
                上一段：{durationText(durationMs(lastSaved.seg))}、拿到 {formatNumber(lastSaved.seg.gained)}。{lastSaved.note}
              </p>
            ) : null}
          </Card>
        </div>

        <div className="space-y-4">
          {mapId !== null ? (
            <>
              <MapPanel mapId={mapId} maps={data.maps} monsterById={data.monsterById} items={data.items} training={data.training} party={members} />
              <Leaderboard board={board} tab={tab} onTab={setTab} />
            </>
          ) : place.key !== null && place.guess ? (
            <Card>
              <MapChoices choices={place.guess.choices} maps={data.maps} onPick={onPickMap} />
            </Card>
          ) : status === "reading" ? (
            <Card>
              <p className="text-sm ink-soft">{reading?.title ? "正在認地圖…" : "認不到在哪張圖：把小地圖打開。"}</p>
            </Card>
          ) : null}
        </div>
      </div>
      <Disclaimer />
      <MiniWindow open={mini} onClose={closeMini}>
        <div className="space-y-1 p-3">
          <p className="text-[12px] font-bold ink-soft">10 分鐘經驗</p>
          <p className="text-[26px] font-black leading-none tabular-nums">{per10 !== null ? formatNumber(per10) : "—"}</p>
          <p className="text-[13px]">升級還要 {eta !== null ? etaText(eta) : "—"}</p>
          <p className="text-[12px] ink-soft">{statusText}</p>
        </div>
      </MiniWindow>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-4 py-3 sm:py-6">
      <header>
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">練功測速</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">分享遊戲畫面，自動算 10 分鐘拿多少經驗、還要多久升級；看每張圖別人練得多快。</p>
      </header>
      {children}
    </div>
  );
}
