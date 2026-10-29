"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilterTag } from "@/components/FilterTag";
import { parseChannel } from "@/lib/boss/input";
import { intervalOnKill } from "@/lib/boss/interval";
import { dueReminders } from "@/lib/boss/remind";
import { normalizeRoomCode } from "@/lib/boss/room-code";
import { playBeep, unlockAudio } from "@/lib/boss/sound";
import { EXPIRE_MS, channelState, latestByChannel, rankNext } from "@/lib/boss/state";
import { loadEvents, loadPrefs, saveEvents, savePrefs, type BossPrefs } from "@/lib/boss/store";
import { BOSSES, SERVERS, type BossEvent, type ChannelState, type ServerKey } from "@/lib/boss/types";
import { ActionButton, BossChip, BossInfo, CARD, ChannelGrid, ChannelRow, NextCard } from "./parts";

const POLL_MS = 20_000;
const TICK_MS = 15_000;
const TOAST_MS = 5_000;
const BATCH = 100;
const UNSENT_KEY = "ms-boss:unsent";
/** 補記最多往前幾分鐘（12 小時以前的紀錄本來就不顯示） */
const MAX_AGO_MIN = 720;

/** 伺服器畫面跟瀏覽器接手那一格都用這組（不讀瀏覽器存檔），接手後才換成記住的 */
const FIRST_PREFS: BossPrefs = { server: "xuejila", boss: BOSSES[0].id, room: null, remind: false, device: "" };

type Toast = { text: string; undo?: BossEvent };
type Room = { code: string; online: number | null };
type Stats = Record<string, { n: number; median: number }>;

function loadUnsent(): BossEvent[] {
  try {
    const raw = localStorage.getItem(UNSENT_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as BossEvent[]).filter((e) => e && typeof e.id === "string" && Date.now() - e.at < EXPIRE_MS) : [];
  } catch {
    return [];
  }
}

function saveUnsent(list: BossEvent[]): void {
  try {
    localStorage.setItem(UNSENT_KEY, JSON.stringify(list));
  } catch {
    // 存不了就只留在記憶體
  }
}

const KIND_TEXT = { kill: "剛打死", empty: "沒王" } as const;

export function BossTimer() {
  const [ready, setReady] = useState(false);
  const [prefs, setPrefsState] = useState<BossPrefs>(FIRST_PREFS);
  const [events, setEvents] = useState<BossEvent[]>([]);
  const [now, setNow] = useState(0);
  const [room, setRoom] = useState<Room | null>(null);
  const [noDb, setNoDb] = useState(false);
  const [roomMsg, setRoomMsg] = useState<string | null>(null);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [stats, setStats] = useState<Stats>({});
  const [chInput, setChInput] = useState("");
  const [agoOpen, setAgoOpen] = useState(false);
  const [agoInput, setAgoInput] = useState("");
  const [inputMsg, setInputMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);

  const eventsRef = useRef<BossEvent[]>([]);
  const prefsRef = useRef<BossPrefs>(FIRST_PREFS);
  const roomRef = useRef<Room | null>(null);
  const unsentRef = useRef<BossEvent[]>([]);
  const cursorRef = useRef(0);
  const firedRef = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  const setPrefs = useCallback((patch: Partial<BossPrefs>) => {
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    savePrefs(localStorage, next);
    setPrefsState(next);
  }, []);

  /** 改紀錄：記憶體、瀏覽器存檔、畫面一起更新；12 小時前的順手丟掉 */
  const commit = useCallback((next: BossEvent[]) => {
    const t = Date.now();
    const kept = next.filter((e) => t - e.at <= EXPIRE_MS);
    eventsRef.current = kept;
    saveEvents(localStorage, kept);
    setEvents(kept);
    setNow(t);
  }, []);

  /** 別人送來的紀錄：本機沒有的才加 */
  const mergeRemote = useCallback(
    (incoming: BossEvent[]) => {
      const have = new Set(eventsRef.current.map((e) => e.id));
      const fresh = incoming.filter((e) => !have.has(e.id));
      if (fresh.length > 0) commit([...eventsRef.current, ...fresh]);
    },
    [commit],
  );

  const setRoomBoth = useCallback((r: Room | null) => {
    roomRef.current = r;
    setRoom(r);
  }, []);

  /** 離開房間（房間的紀錄留在自己瀏覽器） */
  const leaveRoom = useCallback(
    (msg: string | null) => {
      setRoomBoth(null);
      cursorRef.current = 0;
      unsentRef.current = [];
      saveUnsent([]);
      setSendMsg(null);
      setRoomMsg(msg);
      setPrefs({ room: null });
    },
    [setPrefs, setRoomBoth],
  );

  /** 回應是 503／404／400 時的共同處理；回 true 表示房間已經不能用 */
  const handleRoomError = useCallback(
    (status: number): boolean => {
      if (status === 503) {
        setNoDb(true);
        leaveRoom(null);
        return true;
      }
      if (status === 404 || status === 400) {
        leaveRoom("房間已失效");
        return true;
      }
      return false;
    },
    [leaveRoom],
  );

  /** 把還沒送到的紀錄送進房間（伺服器照編號去重，重送不會多一筆） */
  const flush = useCallback(async (): Promise<void> => {
    const r = roomRef.current;
    if (!r || unsentRef.current.length === 0) return;
    const device = prefsRef.current.device;
    while (unsentRef.current.length > 0 && roomRef.current?.code === r.code) {
      const batch = unsentRef.current.slice(0, BATCH);
      let res: Response;
      try {
        res = await fetch("/api/boss/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ room: r.code, device, events: batch }),
        });
      } catch {
        setSendMsg("沒送到隊友，等一下會再送");
        return;
      }
      if (handleRoomError(res.status)) return;
      if (!res.ok) {
        setSendMsg("沒送到隊友，等一下會再送");
        return;
      }
      const sent = new Set(batch.map((e) => e.id));
      unsentRef.current = unsentRef.current.filter((e) => !sent.has(e.id));
      saveUnsent(unsentRef.current);
    }
    setSendMsg(null);
  }, [handleRoomError]);

  /** 先補送，再拉上次之後的新紀錄 */
  const poll = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await flush();
      const r = roomRef.current;
      if (!r) return;
      const q = new URLSearchParams({ room: r.code, since: String(cursorRef.current), device: prefsRef.current.device });
      let res: Response;
      try {
        res = await fetch(`/api/boss/events?${q}`, { cache: "no-store" });
      } catch {
        return;
      }
      if (handleRoomError(res.status)) return;
      if (!res.ok) return;
      const body = (await res.json().catch(() => null)) as { ok?: boolean; events?: BossEvent[]; seq?: number; online?: number } | null;
      if (!body?.ok || roomRef.current?.code !== r.code) return;
      if (Array.isArray(body.events)) mergeRemote(body.events);
      if (typeof body.seq === "number") cursorRef.current = Math.max(cursorRef.current, body.seq);
      setRoomBoth({ code: r.code, online: typeof body.online === "number" ? body.online : null });
    } finally {
      busyRef.current = false;
    }
  }, [flush, mergeRemote, setRoomBoth]);

  /** 加入房間：本機這台伺服器 12 小時內的紀錄一起送進去 */
  const joinRoom = useCallback(
    (code: string) => {
      const t = Date.now();
      const server = prefsRef.current.server;
      const mine = eventsRef.current.filter((e) => e.server === server && t - e.at < EXPIRE_MS);
      const queued = new Set(unsentRef.current.map((e) => e.id));
      unsentRef.current = [...unsentRef.current, ...mine.filter((e) => !queued.has(e.id))];
      saveUnsent(unsentRef.current);
      cursorRef.current = 0;
      setRoomMsg(null);
      setCodeOpen(false);
      setCodeInput("");
      setRoomBoth({ code, online: null });
      setPrefs({ room: code });
      void poll();
    },
    [poll, setPrefs, setRoomBoth],
  );

  // 接手後：讀記住的設定與紀錄、網址帶的房間
  useEffect(() => {
    const t = Date.now();
    const loaded = loadPrefs(localStorage);
    const stored = loaded.room ? normalizeRoomCode(loaded.room) : null;
    prefsRef.current = { ...loaded, room: stored };
    savePrefs(localStorage, prefsRef.current); // 第一次來要把裝置代號存下來
    setPrefsState(prefsRef.current);
    eventsRef.current = loadEvents(localStorage, t);
    setEvents(eventsRef.current);
    unsentRef.current = loadUnsent();
    setNow(t);
    setReady(true);

    const param = new URLSearchParams(window.location.search).get("room");
    if (param !== null) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
      const code = normalizeRoomCode(param);
      if (code) {
        if (code !== stored) joinRoom(code);
        else setRoomBoth({ code, online: null });
      } else {
        setRoomMsg("房間已失效");
      }
    } else if (stored) {
      setRoomBoth({ code: stored, online: null });
    }

    fetch("/api/boss/intervals")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { ok?: boolean; stats?: Stats } | null) => {
        if (b?.ok && b.stats) setStats(b.stats);
      })
      .catch(() => {});
    // 只在接手時跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 選中的王捲到看得見
  useEffect(() => {
    if (!ready) return;
    const el = chipsRef.current?.querySelector<HTMLElement>(`[data-boss="${prefs.boss}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    // 只在讀完存檔那一次對齊；之後是使用者自己點的，本來就看得見
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // 在房間時：分頁看得見才每 20 秒拉一次
  const roomCode = room?.code ?? null;
  useEffect(() => {
    if (!roomCode) return;
    void poll();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [roomCode, poll]);

  // 每 15 秒重算狀態＋檢查提醒；分頁回到前景立刻重算
  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const p = prefsRef.current;
      if (!p.remind) return;
      const due = dueReminders(eventsRef.current, p.server, t, firedRef.current);
      if (due.length === 0) return;
      for (const d of due) firedRef.current.add(d.eventId);
      playBeep();
      if ("Notification" in window && Notification.permission === "granted") {
        for (const d of due) {
          try {
            new Notification(`${d.boss.name} ${d.ch} 頻快出了`, { body: "再 3 分鐘進入重生時間", tag: d.eventId });
          } catch {
            // 手機瀏覽器不能直接 new Notification，響聲還是有
          }
        }
      }
    };
    tick();
    const id = setInterval(tick, TICK_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ready]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const showToast = useCallback((next: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  /** 新紀錄：先寫本機，在房間就送出（送不到排隊重送） */
  const addEvents = useCallback(
    (evs: BossEvent[]) => {
      commit([...eventsRef.current, ...evs]);
      if (roomRef.current) {
        unsentRef.current = [...unsentRef.current, ...evs];
        saveUnsent(unsentRef.current);
        void flush();
      }
    },
    [commit, flush],
  );

  const boss = BOSSES.find((b) => b.id === prefs.boss) ?? BOSSES[0];

  /** 記一筆：kind＝打死／沒王，ago＝幾分鐘前 */
  const record = useCallback(
    (ch: number, kind: "kill" | "empty", ago = 0) => {
      const p = prefsRef.current;
      const t = Date.now();
      const prev = latestByChannel(eventsRef.current, p.server, p.boss, t).get(ch);
      const ev: BossEvent = { id: crypto.randomUUID(), server: p.server, boss: p.boss, ch, kind, at: t - ago * 60_000 };
      addEvents([ev]);
      if (kind === "kill") {
        const seconds = intervalOnKill(prev, ev);
        if (seconds !== null) {
          fetch("/api/boss/intervals", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ server: p.server, boss: p.boss, seconds }),
          }).catch(() => {});
        }
      }
      const what = kind === "kill" ? (ago > 0 ? `${ago} 分鐘前打死` : KIND_TEXT.kill) : KIND_TEXT.empty;
      showToast({ text: `已記 ${ch} 頻 ${what}`, undo: ev });
    },
    [addEvents, showToast],
  );

  /** 撤回：送「撤回某一筆」，隊友那邊也會拿掉 */
  const retract = useCallback(
    (targets: BossEvent[]) => {
      const t = Date.now();
      addEvents(
        targets.map((e) => ({ id: crypto.randomUUID(), server: e.server, boss: e.boss, ch: e.ch, kind: "retract" as const, target: e.id, at: t })),
      );
    },
    [addEvents],
  );

  const undo = () => {
    if (!toast?.undo) return;
    retract([toast.undo]);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text: `已復原 ${toast.undo.ch} 頻` });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  };

  /** 刪掉一個頻道：這個頻道還看得到的紀錄全部撤回 */
  const deleteChannel = (ch: number) => {
    const p = prefsRef.current;
    const t = Date.now();
    const retracted = new Set(eventsRef.current.flatMap((e) => (e.kind === "retract" ? [e.target] : [])));
    const live = eventsRef.current.filter(
      (e) => e.kind !== "retract" && e.server === p.server && e.boss === p.boss && e.ch === ch && !retracted.has(e.id) && t - e.at <= EXPIRE_MS,
    );
    if (live.length > 0) retract(live);
    setOpenRow(null);
    showToast({ text: `已刪掉 ${ch} 頻的紀錄` });
  };

  const submit = (kind: "kill" | "empty") => {
    const ch = parseChannel(chInput);
    if (ch === null) {
      setInputMsg("頻道是 1～60");
      chRef.current?.focus();
      return;
    }
    let ago = 0;
    if (kind === "kill" && agoOpen && agoInput.trim() !== "") {
      const n = Number(agoInput.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim());
      if (!Number.isInteger(n) || n < 0 || n > MAX_AGO_MIN) {
        setInputMsg(`分鐘是 0～${MAX_AGO_MIN}`);
        return;
      }
      ago = n;
    }
    setInputMsg(null);
    record(ch, kind, ago);
    setChInput("");
    setAgoInput("");
    setAgoOpen(false);
    chRef.current?.focus();
  };

  const openRoom = async () => {
    setRoomMsg(null);
    try {
      const res = await fetch("/api/boss/rooms", { method: "POST" });
      if (res.status === 503) {
        setNoDb(true);
        return;
      }
      const body = (await res.json().catch(() => null)) as { ok?: boolean; code?: string; error?: string } | null;
      const code = body?.ok && body.code ? normalizeRoomCode(body.code) : null;
      if (!code) {
        setRoomMsg(body?.error ?? "連不上，等一下再過來");
        return;
      }
      joinRoom(code);
    } catch {
      setRoomMsg("連不上，等一下再過來");
    }
  };

  const enterCode = () => {
    const code = normalizeRoomCode(codeInput);
    if (!code) {
      setRoomMsg("代碼是 6 個英文字母或數字");
      return;
    }
    joinRoom(code);
  };

  const share = async () => {
    if (!room) return;
    const url = `${window.location.origin}/plan/boss?room=${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setRoomMsg("已複製連結，貼給隊友就能一起記");
    } catch {
      setRoomMsg(`把這個連結貼給隊友：${url}`);
    }
  };

  const toggleRemind = async () => {
    const on = !prefsRef.current.remind;
    setPrefs({ remind: on });
    setNotifyMsg(null);
    if (!on) return;
    unlockAudio();
    if (!("Notification" in window)) {
      setNotifyMsg("這個瀏覽器不能跳通知，到時候只會響聲");
      return;
    }
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission().catch(() => "denied" as NotificationPermission);
    if (perm !== "granted") setNotifyMsg("通知被瀏覽器擋了，到時候只會響聲");
  };

  const switchServer = (key: ServerKey) => {
    setPrefs({ server: key });
    setOpenRow(null);
  };

  const switchBoss = (id: number) => {
    setPrefs({ boss: id });
    setOpenRow(null);
  };

  // 目前這台伺服器、這隻王的 60 個頻道
  const all: ChannelState[] = useMemo(() => {
    if (!ready) return [];
    const latest = latestByChannel(events, prefs.server, boss.id, now);
    return Array.from({ length: 60 }, (_, i) => channelState(i + 1, latest.get(i + 1), boss, now));
  }, [ready, events, prefs.server, boss, now]);
  const ranked = useMemo(() => rankNext(all), [all]);

  return (
    <div className="mx-auto max-w-3xl space-y-3 py-3 sm:py-6">
      <header>
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">野王計時</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">打死就按一下，幫你算哪個頻道快出了。重生時間是台服玩家實測。</p>
      </header>

      <div className="flex gap-2 pt-1" role="group" aria-label="伺服器">
        {SERVERS.map((s) => (
          <FilterTag key={s.key} on={prefs.server === s.key} onClick={() => switchServer(s.key)}>
            {s.name}
          </FilterTag>
        ))}
      </div>

      {/* 隊友房間 */}
      <section aria-label="隊友房間" className="rounded-[14px] bg-[color:var(--sky-wash)] px-3 py-1.5 text-[14px] font-bold text-[color:var(--sky)]">
        {noDb ? (
          <div className="flex min-h-11 items-center justify-between gap-2">
            <span>隊友房間</span>
            <span className="ink-soft">房間功能還沒開</span>
          </div>
        ) : room ? (
          <div className="flex flex-wrap items-center justify-between gap-x-2">
            <span>
              隊友房間 {room.code}
              {room.online !== null ? `・${room.online} 人在線` : ""}
            </span>
            <span className="flex gap-1">
              <button type="button" onClick={share} className="tap-safe px-2 underline underline-offset-2">
                分享代碼
              </button>
              <button type="button" onClick={() => leaveRoom(null)} className="tap-safe px-2 underline underline-offset-2">
                離開
              </button>
            </span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-2">
              <span>隊友房間</span>
              <span className="flex gap-1">
                <button type="button" onClick={openRoom} disabled={!ready} className="tap-safe px-2 underline underline-offset-2">
                  開房間
                </button>
                <button
                  type="button"
                  aria-expanded={codeOpen}
                  onClick={() => setCodeOpen(!codeOpen)}
                  disabled={!ready}
                  className="tap-safe px-2 underline underline-offset-2"
                >
                  輸入代碼
                </button>
              </span>
            </div>
            {codeOpen && (
              <form
                className="flex gap-2 pb-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  enterCode();
                }}
              >
                <input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  aria-label="房間代碼"
                  placeholder="6 碼代碼"
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={10}
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 text-[16px] uppercase text-[color:var(--ink)] outline-none focus:border-[color:var(--sky)]"
                />
                <ActionButton type="submit">加入</ActionButton>
              </form>
            )}
          </>
        )}
        {roomMsg && <p className="break-all pb-1.5 text-[13px] font-normal text-[color:var(--ink-soft)]">{roomMsg}</p>}
        {sendMsg && <p className="pb-1.5 text-[13px] font-normal text-[color:var(--ink-soft)]">{sendMsg}</p>}
      </section>

      {/* 王 */}
      <div ref={chipsRef} className="scroll-x -mx-1 flex gap-2 px-1 pb-1 pt-1" role="group" aria-label="選哪隻王">
        {BOSSES.map((b) => (
          <BossChip key={b.id} boss={b} on={prefs.boss === b.id} onClick={() => switchBoss(b.id)} />
        ))}
      </div>
      <BossInfo key={boss.id} boss={boss} stat={stats[String(boss.id)]} />

      <NextCard boss={boss} ranked={ranked} ready={ready} />

      {/* 記一筆 */}
      <section className={CARD} aria-label="記一筆">
        <b className="text-[16px]">記一筆</b>
        <form
          className="mt-2.5 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit("kill");
          }}
        >
          <input
            ref={chRef}
            value={chInput}
            onChange={(e) => {
              setChInput(e.target.value);
              setInputMsg(null);
            }}
            inputMode="numeric"
            enterKeyHint="done"
            autoComplete="off"
            placeholder="頻道 1～60"
            aria-label="頻道"
            aria-invalid={inputMsg !== null}
            className="min-h-12 w-0 min-w-0 flex-1 rounded-[14px] border border-[color:var(--paper-edge)] bg-transparent px-3.5 text-[18px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-faint)] focus:border-[color:var(--maple)]"
          />
          <ActionButton solid type="submit">剛打死</ActionButton>
          <ActionButton onClick={() => submit("empty")}>沒王</ActionButton>
        </form>
        {inputMsg && (
          <p role="alert" className="mt-1.5 text-[13px] font-bold text-[color:var(--maple)]">
            {inputMsg}
          </p>
        )}
        {agoOpen ? (
          <label className="mt-2 flex items-center gap-2 text-[14px] ink-soft">
            補記：
            <input
              value={agoInput}
              onChange={(e) => setAgoInput(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              aria-label="幾分鐘前打死"
              placeholder="50"
              className="min-h-11 w-20 rounded-xl border border-[color:var(--paper-edge)] bg-transparent px-3 text-[16px] text-[color:var(--ink)] outline-none focus:border-[color:var(--maple)]"
            />
            分鐘前打死，填好按「剛打死」
          </label>
        ) : (
          <button type="button" onClick={() => setAgoOpen(true)} className="tap-safe mt-1 text-[14px] font-bold text-[color:var(--maple)] underline underline-offset-2">
            補記：幾分鐘前打死
          </button>
        )}
      </section>

      {/* 有記錄的頻道 */}
      <section className={CARD} aria-label="有記錄的頻道">
        <b className="text-[16px]">有記錄的頻道（{ranked.length}）</b>
        {ranked.length > 0 && (
          <ul className="mt-2">
            {ranked.map((s) => (
              <ChannelRow
                key={s.ch}
                s={s}
                open={openRow === s.ch}
                onToggle={() => setOpenRow(openRow === s.ch ? null : s.ch)}
                onKill={() => {
                  record(s.ch, "kill");
                  setOpenRow(null);
                }}
                onEmpty={() => {
                  record(s.ch, "empty");
                  setOpenRow(null);
                }}
                onDelete={() => deleteChannel(s.ch)}
              />
            ))}
          </ul>
        )}
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll(!showAll)}
          disabled={!ready}
          className="tap-safe mt-1 text-[14px] font-extrabold text-[color:var(--maple)]"
        >
          {showAll ? "收起 60 頻" : "看全部 60 頻"}
        </button>
        {showAll && <ChannelGrid states={all} />}
      </section>

      {/* 提醒 */}
      <section className={CARD} aria-label="提醒">
        <button
          type="button"
          role="switch"
          aria-checked={ready && prefs.remind}
          onClick={toggleRemind}
          disabled={!ready}
          className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
        >
          <span className="text-[15px] font-bold">快出時提醒我（響一聲＋通知）</span>
          <span
            aria-hidden="true"
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${ready && prefs.remind ? "bg-[color:var(--maple)]" : "bg-[color:var(--paper-edge)]"}`}
          >
            <span
              className={`absolute top-1 size-5 rounded-full bg-[color:var(--paper)] shadow transition-[left] ${ready && prefs.remind ? "left-6" : "left-1"}`}
            />
          </span>
        </button>
        <p className="mt-1 text-[13px] leading-relaxed ink-soft">
          有紀錄的王快到重生時間前 3 分鐘提醒你，這個分頁要開著。
        </p>
        {notifyMsg && <p className="mt-1 text-[13px] font-bold text-[color:var(--maple)]">{notifyMsg}</p>}
      </section>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        {toast && (
          <div className="pointer-events-auto flex min-h-11 items-center rounded-full bg-[color:var(--ink)] px-4 text-[14px] font-bold text-[color:var(--paper)] shadow-lg">
            <span>{toast.text}</span>
            {toast.undo && (
              <>
                <span aria-hidden="true">・</span>
                <button type="button" onClick={undo} className="tap-safe px-1 text-[color:var(--maple-soft)] underline underline-offset-2">
                  復原
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
