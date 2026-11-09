"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { KpqAnswerTable, MoonBunnySeedDiagram } from "@/app/guide/PqVisuals";
import { npcImage } from "@/lib/data";
import { comboSay, combos, type ComboSpec } from "@/lib/pq-command/combo";
import { OLD_NOTE, PQS, findPq, type PqInfo, type PqKey, type PqStage, type PqVisual } from "@/lib/pq-command/data";
import { MAX_NAMES, assignAt, resetPq, usePqState, type PqState } from "@/lib/pq-command/store";

/**
 * 組隊指揮（2026-11-02 使用者拍板版面 C）：選任務 → 一關一張卡，試組合幫隊長算誰換到哪，喊話一行一顆複製。
 * 進度、名字存在這台電腦（store.ts）。
 */

const CARD = "rounded-[var(--radius-card)] glass-solid p-4 sm:p-[18px]";
const LABEL = "text-[13px] font-bold ink-soft";
const BTN = "tap-safe inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-[14px] font-bold";
const BTN_MAIN = `${BTN} bg-[color:var(--maple)] text-[color:var(--on-accent)]`;
const BTN_SUB = `${BTN} border border-[color:var(--paper-edge)] bg-[color:var(--paper)]`;

type Update = (fn: (s: PqState) => PqState) => void;

export function PqCommand() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, update, ready] = usePqState(findPq(params.get("pq"))?.key);

  const pq = findPq(state.pq)!;
  const prog = state.prog[pq.key];
  const stageIndex = Math.min(prog.stage, pq.stages.length - 1);
  const stage = pq.stages[stageIndex];

  const choosePq = (key: PqKey) => {
    update((s) => ({ ...s, pq: key }));
    router.replace(`/plan/pq?pq=${key}`, { scroll: false });
  };
  const goStage = (i: number) => update((s) => ({ ...s, prog: { ...s.prog, [pq.key]: { ...s.prog[pq.key], stage: i } } }));

  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="選組隊任務">
        {PQS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={p.key === pq.key}
            onClick={() => choosePq(p.key)}
            className={`tap-safe inline-flex min-h-[38px] items-center rounded-md px-4 text-[15px] font-bold ${
              p.key === pq.key ? "bg-[color:var(--maple)] text-[color:var(--on-accent)]" : "border border-[color:var(--paper-edge)] bg-[color:var(--paper)]"
            }`}
          >
            {p.short}
          </button>
        ))}
      </div>

      <EntryCard pq={pq} onReset={() => update((s) => resetPq(s, pq.key))} />
      <Stepper pq={pq} current={stageIndex} onPick={goStage} ready={ready} />
      <NamesCard names={state.names} update={update} />

      <StageCard key={`${pq.key}-${stage.key}`} pq={pq} stage={stageIndex} state={state} update={update} onNext={() => goStage(Math.min(stageIndex + 1, pq.stages.length - 1))} />

      <div className="flex items-center gap-2.5">
        {stageIndex > 0 ? (
          <button type="button" className={BTN_SUB} onClick={() => goStage(stageIndex - 1)}>
            上一關：{pq.stages[stageIndex - 1].title}
          </button>
        ) : null}
        <span className="flex-1" />
        {stageIndex < pq.stages.length - 1 ? (
          <button type="button" className={BTN_MAIN} onClick={() => goStage(stageIndex + 1)}>
            下一關：{pq.stages[stageIndex + 1].title}
          </button>
        ) : null}
      </div>
    </>
  );
}

function EntryCard({ pq, onReset }: { pq: PqInfo; onReset: () => void }) {
  const guide = pq.key === "goddess" ? null : `/guide#pq-${pq.key}`;
  return (
    <section className={`${CARD} flex items-center gap-3`}>
      <Image src={npcImage(pq.npcId)} alt="" width={48} height={48} className="size-12 shrink-0 object-contain" unoptimized />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-black">{pq.name}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed ink-soft">{pq.entry}</p>
        {pq.tip ? <p className="mt-1 text-[13px] leading-relaxed">{pq.tip}</p> : null}
        {pq.old ? <p className="mt-1 text-[12px] font-bold text-[color:var(--maple)]">{OLD_NOTE}</p> : null}
        {guide ? (
          <Link href={guide} className="mt-1 inline-block text-[13px] font-bold text-[color:var(--sky)] underline decoration-[color:var(--ink-faint)] underline-offset-4">
            看完整攻略
          </Link>
        ) : null}
      </div>
      <button type="button" onClick={onReset} className="tap-safe shrink-0 rounded-lg border border-[color:var(--paper-edge)] px-3 py-1.5 text-[13px] font-bold ink-soft">
        重來
      </button>
    </section>
  );
}

/** ready：讀完存檔（驗收腳本等 data-ready 再開始點，太早點會被吃掉） */
function Stepper({ pq, current, onPick, ready }: { pq: PqInfo; current: number; onPick: (i: number) => void; ready: boolean }) {
  const many = pq.stages.length > 5;
  return (
    <nav aria-label="關卡" data-ready={ready ? "" : undefined} className="flex gap-1.5">
      {pq.stages.map((st, i) => (
        <button
          key={st.key}
          type="button"
          onClick={() => onPick(i)}
          aria-current={i === current ? "step" : undefined}
          aria-label={`第 ${i + 1} 關 ${st.title}`}
          className="tap-safe min-h-11 min-w-0 flex-1 pt-2 text-center"
        >
          <span
            className={`block h-1.5 rounded-full ${
              i < current ? "bg-[color:var(--leaf)]" : i === current ? "bg-[color:var(--maple)]" : "bg-[color:var(--paper-edge)]"
            }`}
          />
          <span className={`mt-1 block truncate text-[11px] ${i === current ? "font-black text-[color:var(--maple)]" : "font-bold ink-soft"}`}>
            {i + 1}
            <span className={many ? "hidden sm:inline" : undefined}> {st.title.replace(/（.*）/, "")}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}

function NamesCard({ names, update }: { names: string[]; update: Update }) {
  const setName = (i: number, value: string) =>
    update((s) => {
      const next = Array.from({ length: Math.max(s.names.length, i + 1) }, (_, n) => s.names[n] ?? "");
      next[i] = value.slice(0, 12);
      return { ...s, names: next };
    });
  return (
    <section className={CARD}>
      <p className={LABEL}>隊員（填了喊話會帶名字，可以不填；試組合時前幾位上場）</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: MAX_NAMES }, (_, i) => (
          <input
            key={i}
            value={names[i] ?? ""}
            onChange={(e) => setName(i, e.target.value)}
            placeholder={`隊員 ${i + 1}`}
            aria-label={`隊員 ${i + 1} 的名字`}
            maxLength={12}
            className="min-h-10 min-w-0 rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 text-[15px]"
          />
        ))}
      </div>
    </section>
  );
}

function StageCard({ pq, stage: index, state, update, onNext }: { pq: PqInfo; stage: number; state: PqState; update: Update; onNext: () => void }) {
  const stage = pq.stages[index];
  const checked = new Set(state.prog[pq.key].checked);
  const toggle = (id: string) =>
    update((s) => {
      const list = s.prog[pq.key].checked;
      const next = list.includes(id) ? list.filter((c) => c !== id) : [...list, id];
      return { ...s, prog: { ...s.prog, [pq.key]: { ...s.prog[pq.key], checked: next } } };
    });

  return (
    <section className={CARD}>
      <div className="flex items-center gap-3">
        {stage.npcId ? <Image src={npcImage(stage.npcId)} alt="" width={44} height={44} className="size-11 shrink-0 object-contain" unoptimized /> : null}
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold ink-soft">
            第 {index + 1} 關・共 {pq.stages.length} 關
          </p>
          <h2 className="text-[20px] font-black leading-tight">{stage.title}</h2>
          <p className="mt-0.5 text-[13px] leading-relaxed ink-soft">
            {stage.goal}
            {stage.exp ? <span className="font-bold text-[color:var(--gold)]">，過關 +{stage.exp.toLocaleString()} 經驗</span> : null}
          </p>
        </div>
      </div>

      {stage.combo ? <ComboBox pq={pq} stage={stage} spec={stage.combo} state={state} update={update} onPass={onNext} /> : null}
      {stage.visual ? <div className="mt-3">{visual(stage.visual)}</div> : null}

      <p className={`${LABEL} mt-4`}>隊長要做</p>
      <ul className="mt-1 space-y-1">
        {stage.todo.map((text, n) => {
          const id = `${stage.key}:${n}`;
          return (
            <li key={id}>
              <label className="flex cursor-pointer items-start gap-2 py-1 text-[14px] leading-relaxed">
                <input type="checkbox" checked={checked.has(id)} onChange={() => toggle(id)} className="mt-1 size-4 shrink-0 accent-[color:var(--leaf)]" />
                <span className={checked.has(id) ? "ink-faint line-through" : undefined}>{text}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <p className={`${LABEL} mt-4`}>要喊的話</p>
      <div className="mt-1">
        {stage.lines.map((line) => (
          <CopyLine key={line} text={line} />
        ))}
      </div>
    </section>
  );
}

function visual(kind: PqVisual) {
  if (kind === "moonSeeds") return <MoonBunnySeedDiagram />;
  return <KpqAnswerTable />;
}

/** 試組合：現在試哪組、誰換到哪（喊話寫好），按「不對，下一組」往下 */
function ComboBox({ pq, stage, spec, state, update, onPass }: { pq: PqInfo; stage: PqStage; spec: ComboSpec; state: PqState; update: Update; onPass: () => void }) {
  const list = useMemo(() => combos(spec.n, spec.k), [spec.n, spec.k]);
  const prog = state.prog[pq.key].combo[stage.key] ?? { i: 0, hit: false };
  const setProg = (i: number, hit: boolean) =>
    update((s) => ({ ...s, prog: { ...s.prog, [pq.key]: { ...s.prog[pq.key], combo: { ...s.prog[pq.key].combo, [stage.key]: { i, hit } } } } }));

  const box = "mt-3.5 rounded-2xl bg-[color:var(--maple-wash)] p-3";
  if (prog.i >= list.length) {
    return (
      <div className={box}>
        <p className="text-[15px] font-black">全部 {list.length} 組都試過了</p>
        <p className="mt-1 text-[13px] leading-relaxed ink-soft">可能有人站錯或漏按。找 NPC 再問一次，或從第一組重新試。</p>
        <button type="button" className={`${BTN_MAIN} mt-2.5`} onClick={() => setProg(0, false)}>
          從第一組再試
        </button>
      </div>
    );
  }

  const current = list[prog.i];
  const stand = spec.kind === "stand";
  const assign = stand ? assignAt(list, prog.i) : current;
  const prev = prog.i === 0 ? null : stand ? assignAt(list, prog.i - 1) : list[prog.i - 1];
  const say = comboSay(spec, prev, assign, state.names);
  const who = (pos: number) => {
    if (!stand) return "";
    const person = assign.indexOf(pos);
    return person >= 0 ? state.names[person]?.trim() || "" : "";
  };

  return (
    <div className={box}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-[15px] font-black">
          {prog.hit ? "答案" : "現在試"}：{current.join("・")}
        </p>
        <p className="text-[12px] ink-soft tabular-nums">
          第 {prog.i + 1} 組／共 {list.length} 組
        </p>
      </div>
      <Positions spec={spec} on={current} who={who} />
      {prog.hit ? (
        <p className="mt-2 text-[13px] font-bold text-[color:var(--leaf)]">這組過了</p>
      ) : (
        <>
          <CopyLine key={say} text={say} />
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button type="button" className={BTN_MAIN} onClick={() => setProg(prog.i + 1, false)}>
              不對，下一組
            </button>
            <button
              type="button"
              className={BTN_SUB}
              onClick={() => {
                setProg(prog.i, true);
                onPass();
              }}
            >
              過了
            </button>
            {prog.i > 0 ? (
              <button type="button" className="tap-safe px-2 text-[13px] font-bold ink-soft" onClick={() => setProg(prog.i - 1, false)}>
                按錯了，回上一組
              </button>
            ) : null}
          </div>
        </>
      )}
      {prog.i > 0 ? (
        <p className="mt-2 text-[12px] leading-relaxed ink-soft">
          試過不對：{list.slice(0, prog.i).map((c) => c.join("")).join("、")}
        </p>
      ) : null}
      {prog.hit ? (
        <button type="button" className="tap-safe mt-1 text-[13px] font-bold ink-soft" onClick={() => setProg(prog.i, false)}>
          其實還沒過，繼續試
        </button>
      ) : null}
    </div>
  );
}

/** 位置圖：跳木桶排成金字塔（1 上、2 3 中、4 5 6 下），其他排一列 */
function Positions({ spec, on, who }: { spec: ComboSpec; on: number[]; who: (pos: number) => string }) {
  const cell = (pos: number) => {
    const lit = on.includes(pos);
    const name = who(pos);
    return (
      <span key={pos} className="flex w-12 flex-col items-center gap-0.5">
        <span
          className={`grid h-10 w-11 place-items-center rounded-lg text-[17px] font-black tabular-nums ${
            lit ? "bg-[color:var(--maple)] text-[color:var(--on-accent)]" : "bg-[color:var(--paper-deep)] ink-soft"
          }`}
        >
          {pos}
        </span>
        <span className="h-4 max-w-full truncate text-[11px] font-bold">{lit ? name : ""}</span>
      </span>
    );
  };
  const rows = spec.n === 6 && spec.unit === "號桶" ? [[1], [2, 3], [4, 5, 6]] : [Array.from({ length: spec.n }, (_, i) => i + 1)];
  return (
    <div className="mt-2 grid justify-items-center gap-1" aria-hidden>
      {rows.map((row) => (
        <div key={row.join()} className={`flex ${rows.length > 1 ? "gap-8" : "flex-wrap justify-center gap-1"}`}>
          {row.map(cell)}
        </div>
      ))}
    </div>
  );
}

/** 一行喊話＋複製鈕；剪貼簿不給用就把字反白讓玩家自己複製 */
function CopyLine({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1500);
    return () => clearTimeout(t);
  }, [done]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
    } catch {
      const el = ref.current;
      if (!el) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  };
  return (
    <div className="flex items-center gap-2.5 border-t border-[color:var(--paper-edge)] py-2 first:border-t-0">
      <span ref={ref} className="min-w-0 flex-1 text-[15px] font-bold leading-relaxed">
        {text}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={`複製：${text}`}
        className={`tap-safe min-h-9 shrink-0 rounded-lg border px-3 text-[13px] font-bold ${
          done ? "border-[color:var(--leaf)] text-[color:var(--leaf)]" : "border-[color:var(--maple)] text-[color:var(--maple)]"
        }`}
      >
        {done ? "已複製" : "複製"}
      </button>
    </div>
  );
}
