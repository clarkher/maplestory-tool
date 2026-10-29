// src/app/plan/speed/PracticeSpeed.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoadingBlock } from "@/components/PlanShell";
import { playBeep, unlockAudio } from "@/lib/boss/sound";
import { loadGuideCommon, loadItems, loadMaps, loadMonsters, loadSpeedNames, loadTraining, mapName, monsterImage } from "@/lib/data";
import { formatNumber } from "@/lib/format";
import { useStoredProfile } from "@/lib/profile";
import { startCapture, type CaptureHandle } from "@/lib/speed/capture";
import { curveBars, lowRunText, nextCurve, type Curve } from "@/lib/speed/curve";
import { durationText, etaText } from "@/lib/speed/format";
import type { RawSpeedNames } from "@/lib/speed/names";
import { nextLowHp, type LowHp } from "@/lib/speed/hp";
import { commitMeso, mesoForNewSegment, NO_MESO, potionLine, potionName, segmentLine, signedText, type MesoEntry } from "@/lib/speed/live-view";
import { mesoRates } from "@/lib/speed/meso";
import { backCalc, mapPartyExp, membersOf } from "@/lib/speed/party-exp";
import { nextPotions, potionKey, potionPriceFn, potionSummary, type PotionTrack } from "@/lib/speed/potions";
import { potionPoolIds, type FrameExtras } from "@/lib/speed/read-extras";
import type { FrameReading } from "@/lib/speed/read-frame";
import { resolveMap, settleTitle, type MapGuess, type TitleSettle } from "@/lib/speed/read-map";
import type { BoardRow } from "@/lib/speed/server/rules";
import { addRecord, compareRows, loadRecords, type SpeedRecord } from "@/lib/speed/records";
import { readMapMemory, rememberMap, useSpeedSettings, type SpeedParty, type SpeedSettings } from "@/lib/speed/settings";
import type { ShareCard } from "@/lib/speed/share-image";
import {
  createTracker, durationMs, feed, levelHints, mainMap, minutesToLevel, shouldSave, startManual, stopManual, switchMode, tenMinuteExp, tick,
  type Mode, type Sample, type Segment, type Step, type Tracker,
} from "@/lib/speed/tracker";
import {
  backCalcLine, couponMinutes, couponNote, FRESH_BLIND, jobName, levelPercent, manualControl, mapSource, nextBlind, nextHints, partySize, runBody, saveNote, splitOnIdChange, splitOnPartyChange, statusLine,
  type BlindMap, type Coupon, type HintState, type SaveOutcome, type SpeedStatus,
} from "@/lib/speed/view";
import type { Item, MapRecord, Monster, TrainingRow } from "@/lib/types";
import { CompareCard } from "./CompareCard";
import { CouponDialog, IdDialog, type IdChoice, type PendingCoupon } from "./Dialogs";
import { ExpCard } from "./ExpCard";
import { MesoCard, type PotionRow } from "./MesoCard";
import { MiniWindow, pipSupported } from "./MiniWindow";
import { PartyCard } from "./PartyCard";
import { BUTTON_LINE, BUTTON_MAIN, Card, Disclaimer, Leaderboard, MapChoices, MapPanel, type BoardState } from "./parts";
import { ShareDialog } from "./ShareDialog";

type Data = {
  maps: Record<string, MapRecord>;
  monsterById: Map<number, Monster>;
  items: Map<number, Item>;
  training: TrainingRow[];
  trainingIds: Set<number>;
  toNext: number[];
  names: RawSpeedNames;
};
/**
 * 小地圖標題穩定後的 key（餵給練功計算當 mapKey），跟這個 key 認出來的地圖；
 * picked、blind：標題一直讀不到時，玩家從清單選的地圖（這次分享才有效）跟「讀不到多久了」（mapSource、nextBlind）
 */
type Place = { settle: TitleSettle; key: string | null; guess: MapGuess | null; picked: number | null; blind: BlindMap };

declare global {
  interface Window {
    /** 驗收腳本用（正式機不掛）：直接丟一段進來存。假的分享畫面是靜止的，等不到真的一段，量不到「存好跳加倍券」 */
    __speedTestSave?: (seg: Segment) => void;
  }
}

const CLIENT_VER = "v1.10";
const FRESH_HINTS: HintState = { nullRun: 0, cleared: false };
const NO_PLACE: Place = { settle: { key: null, candidate: null, streak: 0 }, key: null, guess: null, picked: null, blind: FRESH_BLIND };
/** 標題讀不到、請玩家從清單選時那張卡的第一句 */
const BLIND_HEADING = "讀不到小地圖的地圖名：從清單選你在哪張圖";
/** 快捷鍵連續讀不到這麼久，楓幣收益卡才提醒（偶爾一張被擋到不吵） */
const NO_SLOT_MS = 10_000;
const NO_POTIONS: PotionTrack = { slots: {} };

/** 這台電腦的 localStorage（隱私模式、被擋時拿不到就是 null） */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 2026/10/29 */
function dateText(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

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
  const [status, setStatus] = useState<SpeedStatus>("idle");
  const [starting, setStarting] = useState(false);
  const [reading, setReading] = useState<FrameReading | null>(null);
  const [place, setPlace] = useState<Place>(NO_PLACE);
  const [tracker, setTracker] = useState<Tracker>(() => createTracker("auto"));
  const [lastSaved, setLastSaved] = useState<{ seg: Segment; note: string } | null>(null);
  const [board, setBoard] = useState<BoardState>({ kind: "loading" });
  /** 最近一次存成功的時間（0＝還沒存過）：排行跟著重抓，網址帶上它跳過 5 分鐘快取（沒存到的不用重抓） */
  const [boardVersion, setBoardVersion] = useState(0);
  const [tab, setTab] = useState<"solo" | "party">("solo");
  const [mini, setMini] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  /** 這次分享填的角色 ID（null＝沒填，存成匿名）：只記在這次開著的頁面，不存電腦（一個人會練很多隻） */
  const [charId, setCharId] = useState<string | null>(null);
  /** 問角色 ID 的對話框：start＝按分享時問（按了就開始分享）、edit＝從控制卡那行打開來改 */
  const [idDialog, setIdDialog] = useState<"start" | "edit" | null>(null);
  /** 存好、等玩家說有沒有開加倍券的段（排隊，一次問一段） */
  const [coupons, setCoupons] = useState<PendingCoupon[]>([]);
  /** 每分鐘經驗曲線跟畫的時間（一段停了留著最後的樣子，下一段開始才換） */
  const [curveView, setCurveView] = useState<{ curve: Curve; at: number } | null>(null);
  /** 藥水用量：跟著哪一段（startedAt）算的 */
  const [potions, setPotions] = useState<{ startedAt: number | null; track: PotionTrack }>({ startedAt: null, track: NO_POTIONS });
  const [noQuickslot, setNoQuickslot] = useState(false);
  const [mesoStart, setMesoStart] = useState<MesoEntry>(NO_MESO);
  const [mesoNow, setMesoNow] = useState<MesoEntry>(NO_MESO);
  /** 楓幣兩格正在打的字（離開欄位或按 Enter 才算填好，打到一半的不算） */
  const [startText, setStartText] = useState("");
  const [nowText, setNowText] = useState("");
  /** 我的練功紀錄（只在這台電腦），掛上去之後才讀 */
  const [records, setRecords] = useState<SpeedRecord[]>([]);
  const [shareCard, setShareCard] = useState<ShareCard | null>(null);

  const capture = useRef<CaptureHandle | null>(null);
  // 讀畫面的回呼在按「分享」那一刻就交出去了，之後不會換：裡面用到的東西都走 ref，才不會拿到舊的
  // （例如之後才填的角色 ID、之後才勾的組隊）
  const trackerRef = useRef(tracker);
  const dataRef = useRef(data);
  const settingsRef = useRef(settings);
  const profileJobRef = useRef(profile.job);
  const charIdRef = useRef(charId);
  const placeRef = useRef(place);
  const hintRef = useRef(FRESH_HINTS);
  const sentHints = useRef("");
  /** 這次分享看過的地圖 key → 地圖 id（自動認出來的、玩家點的）：一段開始時還沒認出地圖，存的時候補上 */
  const knownMaps = useRef(new Map<string, number>());
  const curveRef = useRef<Curve | null>(null);
  const potionsRef = useRef(potions);
  /** 快捷鍵從什麼時候開始讀不到（null＝讀得到） */
  const slotMissRef = useRef<number | null>(null);
  const lowHpRef = useRef<LowHp>({ armed: true });
  /** 現在算得出的每 10 分鐘淨賺：存一段時一起記進這台電腦的紀錄 */
  const mesoNetRef = useRef<number | null>(null);
  const mesoStartRef = useRef<MesoEntry>(NO_MESO);
  const mesoNowRef = useRef<MesoEntry>(NO_MESO);
  /** 看過的這段開始時間：換到新的一段時看要不要清楓幣那兩格 */
  const segStartRef = useRef<number | null>(null);
  /** 上一段收掉的時間（換隊伍、改 ID 切開的不算，是 null）：新的一段開始時，在這之前填的楓幣清掉 */
  const prevEndRef = useRef<number | null>(null);

  useEffect(() => {
    dataRef.current = data;
    settingsRef.current = settings;
    profileJobRef.current = profile.job;
  }, [data, settings, profile.job]);

  useEffect(() => setSupport(canShare() ? "ok" : "no"), []);
  useEffect(() => {
    const store = storage();
    if (store) setRecords(loadRecords(store));
  }, []);
  useEffect(() => {
    if (!settingsLoaded) return;
    trackerRef.current = createTracker(settingsRef.current.mode);
    setTracker(trackerRef.current);
  }, [settingsLoaded]);

  // 資料只在能用的瀏覽器才載（手機上用不到，不白抓那幾個檔）
  useEffect(() => {
    if (support !== "ok") return;
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
  }, [support]);

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

  /**
   * 一段收掉了：夠長就存進排行，「上一段」那行寫結果。party、charId 是這段練的時候的隊伍跟角色 ID
   * （練到一半換隊伍、改 ID 會先收掉這段，照原本的存）
   */
  const save = useCallback(async (seg: Segment, party: SpeedParty, charId: string | null) => {
    if (seg.gained <= 0) return;
    const current = dataRef.current;
    const set = settingsRef.current;
    const where = mainMap(seg);
    const mapId = where.mapId ?? (where.key !== null ? knownMaps.current.get(where.key) ?? null : null);
    // 沒填角色 ID 也存（2026-10-20 使用者：超過 10 分鐘都要記），伺服器存成匿名
    const body = runBody(seg, { mapId, mapName: mapId !== null && current ? mapName(current.maps, mapId) : null }, {
      charId, isPublic: set.isPublic, party, profileJob: profileJobRef.current, clientVer: CLIENT_VER,
    });
    const note = (outcome: SaveOutcome) => setLastSaved({ seg, note: saveNote(outcome, body) });
    if (!shouldSave(seg)) return note({ kind: "short" });
    // 記在這台電腦（跟我之前比）：認得出地圖、算得出 10 分鐘經驗才記；淨賺是存的這一刻算得出來的（之後才填的不補）
    const exp10 = tenMinuteExp(seg);
    const store = storage();
    if (store && mapId !== null && exp10 !== null && current) {
      const job = seg.job ?? (profileJobRef.current >= 0 ? profileJobRef.current : null);
      setRecords(addRecord(store, { at: Date.now(), mapId, mapName: mapName(current.maps, mapId), level: seg.level, job, charId, exp10, net10: mesoNetRef.current }));
    }
    try {
      const response = await fetch("/api/speed/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; ranked?: boolean; error?: string; id?: string; token?: string };
      const ok = response.ok && result.ok === true;
      note({ kind: "response", status: response.status, ok, ranked: result.ranked, error: result.error });
      if (ok) setBoardVersion(Date.now());
      // 存好了就問有沒有開加倍券（先當沒開存，勾了再改同一筆）
      if (ok && result.id && result.token) {
        const pending: PendingCoupon = {
          id: result.id, token: result.token, startedAt: seg.startedAt, minutes: couponMinutes(seg), duration: durationText(durationMs(seg)), gained: seg.gained,
          run: { durationSec: body.durationSec, mapId: body.mapId, charId: body.charId },
        };
        setCoupons(queue => [...queue, pending]);
      }
    } catch {
      note({ kind: "network" });
    }
  }, []);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_VERCEL_ENV === "production") return;
    window.__speedTestSave = seg => void save(seg, settingsRef.current.party, charIdRef.current);
    return () => {
      delete window.__speedTestSave;
    };
  }, [save]);

  /** 換上新的練功狀態；有收掉的一段就存（隊伍、角色 ID 沒給就是現在的） */
  const apply = useCallback(
    (step: Step, party: SpeedParty = settingsRef.current.party, charId: string | null = charIdRef.current) => {
      trackerRef.current = step.tracker;
      setTracker(step.tracker);
      if (step.closed) {
        prevEndRef.current = step.closed.mode === "auto" ? step.closed.lastChangeAt : step.closed.endedAt;
        void save(step.closed, party, charId);
      }
    },
    [save],
  );

  const sendHints = useCallback((hints: number[]) => {
    const text = hints.join(",");
    if (text === sentHints.current) return;
    sentHints.current = text;
    capture.current?.setHints(hints);
  }, []);

  /** HP、快捷鍵（v1.20）：低血響一聲、藥水用量跟著這段算、快捷鍵讀不到多久了 */
  const onExtras = useCallback((extras: FrameExtras, at: number) => {
    const low = nextLowHp(lowHpRef.current, extras.hp);
    lowHpRef.current = low.s;
    if (low.beep && settingsRef.current.lowHp) playBeep();
    if (extras.slots === undefined) return;
    const slots = extras.slots;
    slotMissRef.current = slots ? null : (slotMissRef.current ?? at);
    const missing = slotMissRef.current !== null && at - slotMissRef.current >= NO_SLOT_MS;
    setNoQuickslot(missing);
    const seg = trackerRef.current.seg;
    if (!slots || !seg) return;
    const before = potionsRef.current;
    const track = nextPotions(
      before.startedAt === seg.startedAt ? before.track : NO_POTIONS,
      slots.map(slot => ({ index: slot.index, itemId: slot.ids ? potionKey(slot.ids) : null, count: slot.count })),
    );
    potionsRef.current = { startedAt: seg.startedAt, track };
    setPotions(potionsRef.current);
  }, []);

  const onReading = useCallback(
    (next: FrameReading, at: number, extras: FrameExtras | null = null) => {
      const current = dataRef.current;
      if (!current) return;
      setReading(next);
      setNow(at);
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
      // 標題一直讀不到（讀到狀態列起 5 秒還沒有長相）：請玩家從清單選；選了就用 pick:<id>
      const blind = nextBlind(before.blind, { bar: Boolean(next.bar), titleKey: settle.key }, at);
      const nextPlace = { ...before, settle, key, guess, blind };
      placeRef.current = nextPlace;
      if (key !== before.key || guess !== before.guess || blind.ask !== before.blind.ask) setPlace(nextPlace);
      const where = mapSource({ key, mapId: guess?.mapId ?? null }, nextPlace.picked);

      let accepted = false;
      if (next.exp) {
        const sample: Sample = {
          at, exp: next.exp.exp, level: next.exp.level, mapKey: where.key, mapId: where.mapId, job: next.job, party: partySize(settingsRef.current.party),
        };
        const step = feed(trackerRef.current, sample, current.toNext);
        apply(step);
        accepted = step.tracker.last === sample;
      }
      // 每分鐘經驗：這段還在才跟著長；停了留著最後的樣子
      const curve = nextCurve(curveRef.current, trackerRef.current.seg, at);
      if (curve) {
        curveRef.current = curve;
        setCurveView({ curve, at });
      }
      if (extras) onExtras(extras, at);
      const hint = nextHints(hintRef.current, { bar: next.bar, exp: next.exp !== null }, { accepted, hints: levelHints(trackerRef.current) });
      hintRef.current = hint.state;
      if (hint.hints) sendHints(hint.hints);
    },
    [apply, sendHints, onExtras],
  );

  // 每秒：自動模式 1 分鐘沒動就停；手動計時中畫面上「這段練了」跟著走（只有那時候用得到現在時間，其他時候不重畫）。
  // 只看「在不在分享」：畫面一下認得到、一下認不到（waiting／reading 來回）不重設計時器
  const sharing = status === "waiting" || status === "reading";
  useEffect(() => {
    if (!sharing) return;
    const timer = window.setInterval(() => {
      const at = Date.now();
      const current = trackerRef.current;
      if (current.mode === "manual" && current.seg) setNow(at);
      apply(tick(current, at));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sharing, apply]);

  const mapId = mapSource({ key: place.key, mapId: place.guess?.mapId ?? null }, place.picked).mapId;
  useEffect(() => {
    if (mapId === null) return;
    let cancelled = false;
    setBoard({ kind: "loading" });
    // 存成功後重抓：帶上存的時間，才不會拿到 5 分鐘快取裡還沒有這筆的排行
    fetch(`/api/speed/board?map=${mapId}${boardVersion ? `&v=${boardVersion}` : ""}`)
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
  }, [mapId, boardVersion]);

  const onStart = async () => {
    if (!data || starting) return;
    setStarting(true);
    try {
      const handle = await startCapture({ toNext: data.toNext, names: data.names, potionIds: potionPoolIds(data.items.values()) }, onReading);
      slotMissRef.current = null;
      setNoQuickslot(false);
      lowHpRef.current = { armed: true };
      curveRef.current = null;
      capture.current = handle;
      // 從清單選的圖只在這次分享有效；「標題讀不到多久了」也重算
      placeRef.current = { ...placeRef.current, picked: null, blind: FRESH_BLIND };
      setPlace(placeRef.current);
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

  /** 標題讀不到時從清單選：沒有長相可以記，只在這次分享有效（mapSource 用 pick:<id>） */
  const onPickBlind = (id: number) => {
    knownMaps.current.set(`pick:${id}`, id);
    const nextPlace = { ...placeRef.current, picked: id };
    placeRef.current = nextPlace;
    setPlace(nextPlace);
  };

  const closeMini = useCallback(() => setMini(false), []);

  /** 按「分享遊戲畫面」：要問角色 ID 就先跳對話框（對話框的按鈕再開始分享），玩家勾過「下次不要再問我」就直接開始 */
  const onShareClick = () => {
    // 之後低血要響：趁玩家點的這一下把聲音解鎖
    unlockAudio();
    if (settingsRef.current.askId) setIdDialog("start");
    else void onStart();
  };

  /** 角色 ID 對話框按下去：ID 只記在這次開著的頁面；公開與否、要不要再問記在電腦裡。start＝接著開始分享（還在玩家點擊的當下） */
  const onIdConfirm = (choice: IdChoice, start: boolean) => {
    // 練到一半改成別的 ID：先把這段照原本的 ID 收掉存（原本沒填、現在補填的照舊算進這段）
    const at = Date.now();
    const split = splitOnIdChange(trackerRef.current, charIdRef.current, choice.charId, at);
    if (split) {
      setNow(at);
      apply(split, settingsRef.current.party, charIdRef.current);
      // 改 ID 切開的不算休息：楓幣兩格留著
      prevEndRef.current = null;
    }
    charIdRef.current = choice.charId;
    setCharId(choice.charId);
    updateSettings({ isPublic: choice.isPublic, askId: choice.askId });
    setIdDialog(null);
    if (start) void onStart();
  };

  /** 補填加倍券：改同一筆（伺服器重算實際的 10 分鐘經驗、排行）；回錯誤訊息，null＝好了 */
  const onCoupon = async (pending: PendingCoupon, coupon: Coupon): Promise<string | null> => {
    try {
      const response = await fetch("/api/speed/runs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pending.id, token: pending.token, coupon }),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; ranked?: boolean; expPer10?: number; error?: string };
      const ok = response.ok && result.ok === true;
      if (!ok) return couponNote({ ok: false, error: result.error ?? "等一下再過來" }, coupon);
      // 「上一段」那行是同一段才換：進不進排行照伺服器重算的（扣掉加倍後組隊隻數可能變成在上限內），再補上回推的速度；排隊問的是更早的段就不動
      const note = `${saveNote({ kind: "response", status: response.status, ok: true, ranked: result.ranked }, pending.run)}${couponNote({ ok: true, expPer10: result.expPer10 }, coupon)}`;
      setLastSaved(last => (last && last.seg.startedAt === pending.startedAt ? { ...last, note } : last));
      setBoardVersion(Date.now());
      return null;
    } catch {
      return couponNote({ ok: false }, coupon);
    }
  };
  /** 問完一段就從排隊裡拿掉那一段（照 id，不是拿掉第一個：送出中又按關掉不會多拿掉後面那段） */
  const closeCoupon = (id: string) => setCoupons(queue => queue.filter(item => item.id !== id));
  /**
   * 組隊改了：隊伍真的換了（勾不勾、隊友等級、誰在打）而且正在練，就先把這段照原本的隊伍收掉存起來，
   * 一段紀錄只會有一種隊伍。手動計時中接著開新的一段，計時不斷。
   */
  const onParty = useCallback(
    (next: SpeedParty) => {
      const before = settingsRef.current.party;
      const at = Date.now();
      const split = splitOnPartyChange(trackerRef.current, before, next, at);
      if (split) {
        setNow(at);
        apply(split, before);
        prevEndRef.current = null;
      }
      updateSettings({ party: next });
    },
    [apply, updateSettings],
  );

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

  // 換到新的一段：只清在上一段結束前填的（休息時填的、換隊伍／改 ID 切開的都留著）
  const segStart = seg?.startedAt ?? null;
  // 先同步兩格目前填好的值（effect 照宣告順序跑，下面那個才拿得到這次畫面的值）
  useEffect(() => {
    mesoStartRef.current = mesoStart;
    mesoNowRef.current = mesoNow;
  }, [mesoStart, mesoNow]);
  useEffect(() => {
    if (segStart === null || segStartRef.current === segStart) return;
    segStartRef.current = segStart;
    const end = prevEndRef.current;
    prevEndRef.current = null;
    if (mesoStartRef.current !== mesoForNewSegment(mesoStartRef.current, end)) {
      setMesoStart(NO_MESO);
      setStartText("");
    }
    if (mesoNowRef.current !== mesoForNewSegment(mesoNowRef.current, end)) {
      setMesoNow(NO_MESO);
      setNowText("");
    }
  }, [segStart]);

  // 給「跟我之前比」、分享圖、藥水用的這段：還在練的那段，停了就是剛收掉的上一段
  const shownSeg = seg ?? lastSaved?.seg ?? null;
  const shownMinutes = shownSeg ? (seg ? elapsed : durationMs(shownSeg)) / 60_000 : 0;
  const priceOf = useMemo(() => (data ? potionPriceFn([...data.items.values()]) : () => null), [data]);
  const potionTrack = shownSeg && potions.startedAt === shownSeg.startedAt ? potions.track : NO_POTIONS;
  const summary = potionSummary(potionTrack, shownMinutes, priceOf);
  const potionMeso10 = summary.uses.reduce((sum, use) => sum + (use.meso10 ?? 0), 0);
  /** 有藥水分不出是哪一種（長得一樣、價格不同）：藥水錢跟撿到都算不出來，不寫 */
  const potionUnpriced = summary.uses.some(use => use.meso10 === null);
  const meso = mesoRates(
    mesoStart.value !== null && mesoNow.value !== null ? { startMeso: mesoStart.value, startAt: mesoStart.at, nowMeso: mesoNow.value, nowAt: mesoNow.at } : null,
    potionMeso10,
  );
  useEffect(() => {
    mesoNetRef.current = meso.net10;
  }, [meso.net10]);

  const statusText = statusLine({
    status, bar: !!reading?.bar, exp: !!reading?.exp, mode: tracker.mode, manualOn: tracker.manualOn, running: seg !== null,
  });
  const manualButton = manualControl(tracker.mode, tracker.manualOn, sharing);

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

  const percent = reading?.exp ? levelPercent(reading.exp.exp, reading.exp.level, data.toNext) : null;
  const perLevel = per10 !== null && seg && data.toNext[seg.level] ? (per10 / data.toNext[seg.level]) * 100 : null;
  const job = jobName(jobId);

  // 經驗卡：每分鐘長條（只看這一段已經過了幾分鐘，最多 60 根）
  const bars = curveView ? curveBars(curveView.curve, curveView.at) : null;
  const totalMinutes = curveView ? Math.max(0, Math.floor((curveView.at - curveView.curve.startedAt) / 60_000)) + 1 : 0;
  const readingLine = `${reading?.exp ? `Lv.${reading.exp.level} · 經驗 ${formatNumber(reading.exp.exp)}${percent !== null ? `（${percent.toFixed(2)}%）` : ""}` : "等級、經驗：還沒讀到"}${job ? ` · ${job}` : ""}${reading ? ` · ${partySize(party) > 1 ? `組隊 ${partySize(party)} 人` : "單練"}` : ""}`;

  // 楓幣收益卡
  const potionRows: PotionRow[] = summary.uses.map(use => ({
    key: String(use.itemId),
    iconId: use.ids[0],
    text: potionLine(potionName(use.ids, data.items), use),
  }));
  const potionCell = potionUnpriced ? "—" : summary.uses.length === 0 ? (Object.keys(potionTrack.slots).length ? "0" : "—") : signedText(-potionMeso10);
  const pickedCell = !potionUnpriced && meso.picked10 !== null ? signedText(meso.picked10) : "—";

  // 跟我之前比、分享圖
  const shownPer10 = shownSeg ? tenMinuteExp(shownSeg) : null;
  const shownWhere = shownSeg ? mainMap(shownSeg) : null;
  const shownMapId = shownWhere ? (shownWhere.mapId ?? (shownWhere.key !== null ? knownMaps.current.get(shownWhere.key) : undefined) ?? (seg ? mapId : null)) : null;
  const shownMapName = shownMapId !== null ? mapName(data.maps, shownMapId) : null;
  const shownJob = shownSeg?.job ?? jobId;
  const rows =
    shownPer10 !== null && shownMapName !== null
      ? compareRows(records, { mapId: shownMapId, mapName: shownMapName, exp10: shownPer10, job: shownJob, charId })
      : [];
  const onShare = () => {
    if (!shownSeg || shownPer10 === null) return;
    const name = jobName(shownJob);
    const shownEta = minutesToLevel(shownSeg, data.toNext);
    // 這張圖第一隻怪（跟右邊地圖卡同一個順序）
    const firstMob = shownMapId !== null ? data.training.find(row => row.m === shownMapId)?.mobs.find(([id]) => data.monsterById.has(id))?.[0] ?? null : null;
    setShareCard({
      title: [`${name ? `${name} ` : ""}Lv.${shownSeg.level}`, shownMapName].filter(Boolean).join("・"),
      exp10: shownPer10,
      second: meso.net10 !== null ? { label: "淨賺楓幣", value: String(Math.round(meso.net10)) } : { label: "這段拿到", value: String(shownSeg.gained) },
      eta: shownEta !== null ? etaText(shownEta) : "—",
      monsterSrc: firstMob !== null ? monsterImage(firstMob) : null,
      date: dateText(Date.now()),
    });
  };

  return (
    <Shell>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <PartyCard party={party} selfLevel={selfLevel} onChange={onParty} />
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              {sharing ? (
                <button type="button" onClick={() => capture.current?.stop()} className="rounded-full border border-[color:var(--paper-edge)] px-4 py-2 font-bold hover:bg-[color:var(--maple-wash)]">
                  停止分享
                </button>
              ) : (
                <button type="button" onClick={onShareClick} disabled={starting} className={BUTTON_MAIN}>
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
              {manualButton === "stop" ? (
                <button type="button" onClick={() => apply(stopManual(trackerRef.current, Date.now()))} className={BUTTON_LINE}>
                  停止
                </button>
              ) : manualButton === "start" ? (
                <button
                  type="button"
                  onClick={() => {
                    const at = Date.now();
                    setNow(at);
                    apply({ tracker: startManual(trackerRef.current, at), closed: null });
                  }}
                  className="rounded-full bg-[color:var(--maple)] px-3 py-1.5 text-sm font-bold text-[color:var(--on-accent)]"
                >
                  開始
                </button>
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
            <p className="mt-1.5 text-sm">
              {charId ? (
                <>
                  <span className="font-bold">這次的角色：{charId}</span>
                  <span className="ink-soft">（{settings.isPublic ? "排行顯示這個 ID" : "排行寫匿名玩家"}）</span>
                </>
              ) : (
                <span className="ink-soft">這次沒填角色 ID，排行寫匿名玩家。</span>
              )}{" "}
              <button type="button" onClick={() => setIdDialog("edit")} className="font-bold text-[color:var(--sky)] hover:underline">
                {charId ? "改" : "填角色 ID"}
              </button>
            </p>
            <div className="mt-2.5 flex items-center justify-between gap-3">
              <span id="speed-low-hp" className="text-sm font-bold">
                HP 低於 30% 響一聲
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={settings.lowHp}
                aria-labelledby="speed-low-hp"
                onClick={() => {
                  if (!settings.lowHp) unlockAudio();
                  updateSettings({ lowHp: !settings.lowHp });
                }}
                className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors ${settings.lowHp ? "bg-[color:var(--maple)]" : "bg-[color:var(--paper-edge)]"}`}
              >
                <span className={`absolute top-[3px] size-5 rounded-full bg-[color:var(--paper)] transition-[left] ${settings.lowHp ? "left-[21px]" : "left-[3px]"}`} />
              </button>
            </div>
          </Card>

          <ExpCard
            per10={per10 !== null ? formatNumber(per10) : "—"}
            perLevel={perLevel !== null ? `這一級的 ${perLevel.toFixed(1)}%` : undefined}
            eta={eta !== null ? etaText(eta) : "—"}
            bars={bars}
            lowText={bars ? lowRunText(bars, totalMinutes) : null}
            segLine={seg ? segmentLine(durationText(elapsed), seg.gained) : null}
            backLine={backLine}
            readingLine={readingLine}
            lastLine={lastSaved ? `上一段：${durationText(durationMs(lastSaved.seg))}、拿到 ${formatNumber(lastSaved.seg.gained)}。${lastSaved.note}` : null}
          />
          <MesoCard
            picked={pickedCell}
            potion={potionCell}
            net={meso.net10 !== null ? signedText(meso.net10) : "—"}
            startText={startText}
            nowText={nowText}
            onStartText={setStartText}
            onNowText={setNowText}
            onStartCommit={() => setMesoStart(entry => commitMeso(entry, startText, Date.now(), true))}
            onNowCommit={() => setMesoNow(entry => commitMeso(entry, nowText, Date.now(), false))}
            unpriced={potionUnpriced}
            potions={potionRows}
            noQuickslot={sharing && noQuickslot}
            restocked={summary.restocked}
            uncounted={summary.uncounted}
          />
          <CompareCard rows={rows} byId={charId !== null} onShare={onShare} canShare={shownPer10 !== null} />
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
          ) : sharing && place.blind.ask ? (
            <Card>
              <MapChoices choices={[]} maps={data.maps} onPick={onPickBlind} heading={BLIND_HEADING} />
            </Card>
          ) : status === "reading" ? (
            <Card>
              <p className="text-sm ink-soft">{reading?.title ? "正在認地圖…" : "認不到在哪張圖：把小地圖打開。"}</p>
            </Card>
          ) : null}
        </div>
      </div>
      <Disclaimer />
      <IdDialog mode={idDialog} initial={{ charId, isPublic: settings.isPublic, askId: settings.askId }} onConfirm={onIdConfirm} onClose={() => setIdDialog(null)} />
      <CouponDialog pending={idDialog === null && shareCard === null ? coupons[0] ?? null : null} onSubmit={onCoupon} onClose={closeCoupon} />
      <ShareDialog card={shareCard} onClose={() => setShareCard(null)} />
      <MiniWindow open={mini} onClose={closeMini}>
        <div className="space-y-1 p-3">
          <p className="text-[12px] font-bold ink-soft">10 分鐘經驗</p>
          <p className="text-[26px] font-black leading-none tabular-nums">{per10 !== null ? formatNumber(per10) : "—"}</p>
          <p className="text-[13px]">升級還要 {eta !== null ? etaText(eta) : "—"}</p>
          {meso.net10 !== null ? <p className="text-[13px] font-bold tabular-nums">淨賺 {signedText(meso.net10)}</p> : null}
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
