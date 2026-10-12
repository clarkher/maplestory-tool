"use client";

import { Fragment, memo, useId, useMemo, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { ChoiceGroup } from "@/components/ChoiceGroup";
import { ChevronDown } from "@/components/Icons";
import { Sprite, SourceLinks } from "@/components/route/bits";
import { itemImage, monsterImage, skillImage } from "@/lib/data";
import { ammoChoices, boosterFor, defaultAmmo, expRateText, HEAL_ASSUMPTION, levelNeededText, monsterStats, secondsText, LEVEL_CAP, regroup, sameGroups, skillLevelsAt, weaponChoices, type CalcData, type CalcState, type GroupConfig, type GroupResult, type MonsterChoice, type SharedConfig } from "@/lib/damage-view";
import { AMP_SKILLS, attackSkillIds, BASIC_ATTACK, BUFFS, CHARGES, CRIT_SKILL, HEAL, HEAL_TARGETS_MAX, masterySkillFor, notCalculatedFor } from "@/lib/damage-skills";
import { healTargetMultiplier } from "@/lib/damage";
import type { Range } from "@/lib/damage";
import { boosterSteps, SPEED_UNKNOWN } from "@/lib/damage-speed";
import { gearPlan, tabsFor, STAT_ORDER, STAT_WORD, shortText } from "@/lib/gear-view";
import { isMagicJob, type StatKey } from "@/lib/gear";
import { jobAvatar, minLevelFor, skillJobGroups } from "@/lib/jobs";
import { jobLineage } from "@/lib/planner";
import type { Monster } from "@/lib/types";
import { useVisitState } from "@/lib/visit-state";

const fmt = (range: Range) => `${range.min.toLocaleString()}～${range.max.toLocaleString()}`;
const TONES = ["maple", "sky"] as const;
/** 職業選單的分組：職業表是寫死的，算一次就好（每次重畫都重排一遍很浪費） */
const JOB_GROUPS = skillJobGroups();

type Trust = "client" | "legacy" | "unverified";

/** 可信度小標：照規格三級字樣 */
export function Tag({ level }: { level: Trust }) {
  const text = level === "client" ? "玩家依客戶端整理" : level === "legacy" ? "舊版公式" : "舊版國際服公式，經典版沒驗證";
  const tone = level === "unverified" ? "bg-[color:var(--gold-wash)] text-[color:var(--gold)]" : "bg-[color:var(--sky-wash)] text-[color:var(--sky)]";
  return <span className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{text}</span>;
}

/** 表格每一列數字旁邊的字樣：客戶端、舊版公式照 Tag 全文，沒驗證的在窄欄縮成「未驗證」（全文在 Tag 跟「怎麼算的」那張卡） */
function TrustMark({ level }: { level: Trust }) {
  const text = level === "client" ? "玩家依客戶端整理" : level === "legacy" ? "舊版公式" : "未驗證";
  const tone = level === "unverified" ? "text-[color:var(--gold)]" : "text-[color:var(--sky)]";
  return <span className={`block text-[11px] font-bold ${tone}`}>{text}</span>;
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[color:var(--paper-edge)] py-2 last:border-0">
      <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-bold ink-soft">{label}</span>
      <span className="flex min-w-0 items-center justify-end gap-1.5">{children}</span>
    </div>
  );
}

const SELECT = "min-w-0 max-w-[60vw] truncate rounded-lg border border-[color:var(--paper-edge)] bg-[color:var(--glass-strong)] px-2 py-1.5 text-[14px] font-bold sm:max-w-none";
const SUMMARY = "cursor-pointer py-1.5 text-[13px] font-bold text-[color:var(--sky)]";

/**
 * 展開的標題列：不用瀏覽器原生的三角形（站上禁用那一類字元），改放站上的 ChevronDown，展開時轉 180 度
 * （跟練功排行「看全部怪與小地圖」同一個做法）。open 由外面的 details 狀態傳進來。
 */
function Summary({ open, className, children }: { open: boolean; className: string; children: React.ReactNode }) {
  return (
    <summary className={`${className} flex list-none items-center gap-1 [&::-webkit-details-marker]:hidden [&::marker]:content-none`}>
      {children}
      <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </summary>
  );
}

/**
 * 數字欄：打字時先放在草稿裡（打到一半的 3 不會馬上被拉成 4，才打得出 35），
 * 離開欄位或按 Enter 才取整、夾進範圍；外面把值換掉（換點法、換等級）草稿就作廢、跟著新的值。
 */
function DraftNumber({ value, min, max, onCommit, onStep, ...rest }: {
  value: number; min: number; max: number; onCommit: (value: number) => void;
  /** 給了就讓鍵盤上下鍵加減 1（等級那格用） */
  onStep?: (delta: number) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur" | "onKeyDown" | "onFocus" | "min" | "max">) {
  const [edit, setEdit] = useState<{ text: string; base: number } | null>(null);
  const shown = edit && edit.base === value ? edit.text : String(value);
  const commit = () => {
    setEdit(null);
    if (!edit || edit.base !== value) return;
    const next = Math.min(max, Math.max(min, Math.round(edit.text === "" ? min : Number(edit.text))));
    if (next !== value) onCommit(next);
  };
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={shown}
      onFocus={event => event.currentTarget.select()}
      onChange={event => setEdit({ text: event.target.value.replace(/\D/g, "").slice(0, String(max).length), base: value })}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === "Enter") commit();
        if (onStep && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
          event.preventDefault();
          setEdit(null);
          onStep(event.key === "ArrowUp" ? 1 : -1);
        }
      }}
    />
  );
}

/**
 * 怪物選單的選項：一百多個 option（monsters.json 約 125 隻），包成 memo——按 −／＋ 時整張卡重畫，選項不用跟著一個一個比對
 * （props 沒變就整串跳過）。
 */
const MonsterOptions = memo(function MonsterOptions({ choices, beforeOpen }: { choices: MonsterChoice[]; beforeOpen: boolean }) {
  return (
    <>
      {choices.map(({ monster, v002 }) => (
        <option key={monster.id} value={monster.id}>{`${monster.n} Lv.${monster.lv}${v002 && beforeOpen ? "（10/15 開放）" : ""}`}</option>
      ))}
    </>
  );
});

/** 上方分頁固定的兩組名字（2026-10-12 使用者選 A：分頁不寫點法，免得跟分頁裡的「點法」選項重複） */
export const GROUP_NAMES = ["左組", "右組"] as const;

/** 結果卡、名單說明用的組名：「左組・一般點法」；兩組沒差在點法或武器時只寫「左組」 */
export function groupName(index: number, labels: [string, string]): string {
  const base = GROUP_NAMES[index];
  return labels[index] === base ? base : `${base}・${labels[index]}`;
}

/* ------------------------------------------------------------------ 共用設定 */

export function SharedCard({ data, state, job, onJob, onShared, onLevel, levelNotice, choices, beforeOpen }: {
  data: CalcData | null; state: CalcState | null; job: number; onJob: (job: number) => void; onShared: (patch: Partial<SharedConfig>) => void;
  /** 換等級（兩組一起換，DamageCalculator 用 relevel） */
  onLevel: (level: number) => void;
  /** 換職業時等級被拉高的說明（「三轉最低 70 等，已調成 70」）；沒有就 null */
  levelNotice: string | null;
  /** 怪物選單（DamageCalculator 算一次傳下來，不要每次重畫都重排） */
  choices: MonsterChoice[]; beforeOpen: boolean;
}) {
  const avatar = job > 0 ? jobAvatar(job) : undefined;
  const skillIds = useMemo(() => (data && job > 0 ? attackSkillIds(data.skills, job) : []), [data, job]);
  const missing = useMemo(() => (data && job > 0 ? notCalculatedFor(data.skills, job) : []), [data, job]);
  const skill = data && state && state.shared.skillId !== BASIC_ATTACK ? data.skills.get(state.shared.skillId) : undefined;
  // 選的怪（顯示 HP、經驗用）
  const target = data && state && state.shared.monsterId !== null ? data.monsters.find(monster => monster.id === state.shared.monsterId) : undefined;
  return (
    <section aria-label="共用設定" className="rounded-[var(--radius-card)] glass wood-frame px-3.5 py-1.5">
      <Row label="職業">
        {avatar ? <Sprite src={avatar} size={22} /> : null}
        <select aria-label="職業" className={SELECT} value={job > 0 ? job : ""} onChange={event => onJob(Number(event.target.value))}>
          {job <= 0 ? <option value="">選職業</option> : null}
          {JOB_GROUPS.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </optgroup>
          ))}
        </select>
      </Row>
      {/* 等級兩組共用、跟著職業（v0.83 使用者：要能打字、也能上下切）：打的不合理（三轉打 50、打 200）由 onLevel 夾回並寫明 */}
      {state && job > 0 ? (
        <Row label="等級">
          <LevelStepper job={job} value={state.groups[0].level} onLevel={onLevel} />
        </Row>
      ) : null}
      {/* 讀屏的說明區塊一直掛著、只換字（沒字時藏起來），換職業拉等級時才念得出來 */}
      <p role="status" className={levelNotice ? "pb-1 text-right text-[12px] font-bold text-[color:var(--gold)]" : "sr-only"}>{levelNotice ?? ""}</p>
      {state && job > 0 ? <p className="pb-1 text-right text-[11px] ink-faint">換等級會把兩組的能力值、武器重設成那一級的預設（其他攻擊、增益留著）</p> : null}
      {data && state ? (
        <>
          <Row label="技能">
            {skill ? <Sprite src={skillImage(skill.id)} size={22} /> : null}
            <select
              aria-label="技能"
              className={SELECT}
              value={state.shared.skillId}
              onChange={event => {
                const id = Number(event.target.value);
                const learned = state.groups[0].levels[id] ?? 0;
                const max = data.skills.get(id)?.levels?.length ?? 1;
                onShared({ skillId: id, skillLevel: id === BASIC_ATTACK ? 1 : learned || max });
              }}
            >
              {skillIds.map(id => <option key={id} value={id}>{id === BASIC_ATTACK ? "普通攻擊" : data.skills.get(id)?.n}</option>)}
            </select>
            {skill?.levels?.length ? (
              <select aria-label="技能等級" className={SELECT} value={state.shared.skillLevel} onChange={event => onShared({ skillLevel: Number(event.target.value) })}>
                {skill.levels.map((_, index) => <option key={index} value={index + 1}>Lv.{index + 1}</option>)}
              </select>
            ) : null}
          </Row>
          {/* 群體治癒範圍內幾隻（v0.88 使用者選 3A）：怪越多每隻分到越少 */}
          {state.shared.skillId === HEAL ? (
            <>
              <Row label="範圍內幾隻">
                <select aria-label="範圍內幾隻" className={SELECT} value={state.shared.targets ?? 1} onChange={event => onShared({ targets: Number(event.target.value) })}>
                  {Array.from({ length: HEAL_TARGETS_MAX }, (_, index) => <option key={index} value={index + 1}>{index + 1} 隻</option>)}
                </select>
              </Row>
              <p className="pb-1 text-right text-[11px] ink-faint">
                怪越多每隻分到越少：{[1, 3, 5].map(count => `${count} 隻 ×${Number(healTargetMultiplier(count).toFixed(2))}`).join("、")}
              </p>
            </>
          ) : null}
          {missing.length ? <p className="pb-1 text-[12px] ink-faint">沒算的：{missing.map(entry => entry.name).filter((name, index, all) => all.indexOf(name) === index).join("、")}（原因在最下面）</p> : null}
          <Row label="打哪隻怪">
            {state.shared.monsterId !== null ? <Sprite src={monsterImage(state.shared.monsterId)} size={24} /> : null}
            <select
              aria-label="打哪隻怪"
              className={SELECT}
              value={state.shared.monsterId ?? ""}
              onChange={event => onShared({ monsterId: event.target.value === "" ? null : Number(event.target.value) })}
            >
              <option value="">不選怪（打木樁）</option>
              <MonsterOptions choices={choices} beforeOpen={beforeOpen} />
            </select>
          </Row>
          {target ? <p className="pb-1 text-right text-[12px] font-bold ink-soft">{monsterStats(target)}</p> : null}
        </>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ 結果 */

/** 「要不 miss，命中要 132」；法師「要不 miss，魔法命中要 26（魔法命中＝智力÷10＋幸運÷10）」（結果卡、怪物小卡同一句） */
export function accuracyText(accuracy: number, kind: "physical" | "magic"): string {
  return kind === "magic"
    ? `要不 miss，魔法命中要 ${accuracy.toLocaleString()}（魔法命中＝智力÷10＋幸運÷10）`
    : `要不 miss，命中要 ${accuracy.toLocaleString()}（看能力視窗的命中率）`;
}

/** 屬性加成那一行（「火屬性打弱點 ×1.5」）：資訊不是警告，用天藍淡底 */
function ElementNote({ text }: { text: string }) {
  return <p className="rounded-lg bg-[color:var(--sky-wash)] px-2.5 py-1.5 text-[12px] font-bold text-[color:var(--sky)]">{text}</p>;
}

export function ResultCard({ data, state, labels, results, target, diff }: {
  data: CalcData; state: CalcState; labels: [string, string]; results: readonly [GroupResult, GroupResult]; target: Monster | null; diff: string | null;
}) {
  const [detailsOpen, setDetailsOpen] = useVisitState("damage:details", false);
  const first = results.find(result => result.ok);
  // 兩組都算不出來也要寫選的是哪個技能（不能說「技能一次（1 下）」），幾下是算得出來才有的
  const skillName = state.shared.skillId === BASIC_ATTACK ? "普通攻擊" : data.skills.get(state.shared.skillId)?.n ?? "技能";
  // 群體治癒的數字是每一隻吃到的（範圍內每隻 1 下）
  const title = first?.ok ? (first.heal ? `${first.name}一次（範圍內 ${first.targets} 隻，每隻 1 下）` : `${first.name}一次（${first.hits} 下）`) : `${skillName}一次`;
  const shown = (result: GroupResult) => (result.ok ? (result.vs ?? result.raw).use : null);
  // 屬性加成（v0.84 使用者選 A）：兩組一樣（同一招、同一隻怪）只寫一次，不一樣（只有一組開充能）就各寫在那組下面
  const notes = results.map(result => (result.ok ? result.elementNote : null));
  const sharedNote = notes[0] !== null && notes[0] === notes[1] ? notes[0] : null;
  // 要不 miss（v0.85 使用者選 A）：只看等級跟怪（兩組共用等級），寫一次；法師看魔法命中
  const hitResult = results.find(result => result.ok && result.vs);
  const hitVs = hitResult?.ok ? hitResult.vs : null;
  const scale = Math.max(1, ...results.map(result => shown(result)?.max ?? 0));
  return (
    <section aria-label="結果" className="space-y-3 rounded-[var(--radius-card)] glass wood-frame p-3.5">
      <header className="flex flex-wrap items-center justify-between gap-1.5">
        <h2 className="text-[15px] font-black">{title}</h2>
        {target ? <Tag level="unverified" /> : <Tag level="legacy" />}
      </header>
      {first?.ok && first.heal ? <p className="rounded-lg bg-[color:var(--gold-wash)] px-2.5 py-1.5 text-[12px] font-bold">{HEAL_ASSUMPTION}</p> : null}
      {sharedNote ? <ElementNote text={sharedNote} /> : null}
      {hitVs ? <p className="rounded-lg bg-[color:var(--paper-deep)] px-2.5 py-1.5 text-[12px] font-bold">{accuracyText(hitVs.accuracy, hitVs.accuracyKind)}</p> : null}
      {results.map((result, index) => {
        const bits = result.ok
          ? [
              result.vs && target ? <span>打{target.n}約 {result.vs.kills.avg} 次</span> : null,
              result.panel ? (
                <span>能力視窗 {fmt(result.panel)}<span className="ink-faint">（玩家依客戶端整理）</span></span>
              ) : result.magicPower !== null ? (
                <span>魔攻 {result.magicPower}<span className="ink-faint">（舊版公式）</span></span>
              ) : null,
            ].filter(Boolean)
          : [];
        return (
          <div key={index} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-black" style={{ color: `var(--${TONES[index]})` }}>{groupName(index, labels)}</span>
              <span className="text-[20px] font-black tabular-nums">{result.ok ? fmt(shown(result)!) : "—"}</span>
            </div>
            {result.ok ? (
              <>
                <div className="relative h-3 rounded-full bg-[color:var(--paper-deep)]" aria-hidden>
                  <div
                    className="absolute inset-y-0 rounded-full"
                    style={{ left: `${(shown(result)!.min / scale) * 100}%`, width: `${Math.max(1, ((shown(result)!.max - shown(result)!.min) / scale) * 100)}%`, background: `var(--${TONES[index]})` }}
                  />
                </div>
                {bits.length ? (
                  <p className="text-[12px] ink-soft">
                    {bits.map((bit, at) => <Fragment key={at}>{at ? "・" : null}{bit}</Fragment>)}
                  </p>
                ) : null}
                {/* 每秒經驗（v0.87）：選了怪才有；出手時間查不到的招式照實寫 */}
                {result.vs ? (
                  result.vs.expPerSec !== null && result.speed ? (
                    <p className="text-[13px] font-bold">
                      每秒約 {expRateText(result.vs.expPerSec)} 經驗<span className="text-[12px] font-normal ink-soft">（{result.speed.stun ? `一輪 ${secondsText(result.speed.ms)} 秒，含放完自暈` : `出一招 ${secondsText(result.speed.ms)} 秒`}）</span>
                    </p>
                  ) : (
                    <p className="text-[12px] ink-soft">每秒經驗：{SPEED_UNKNOWN}</p>
                  )
                ) : null}
                {!sharedNote && result.elementNote ? <ElementNote text={result.elementNote} /> : null}
                {result.warnings.map(warning => (
                  <p key={warning} className="rounded-lg bg-[color:var(--gold-wash)] px-2.5 py-1.5 text-[12px] font-bold">{warning}</p>
                ))}
              </>
            ) : (
              <p className="text-[12px] ink-soft">{result.reason}</p>
            )}
          </div>
        );
      })}
      {results.some(result => result.ok && result.vs?.expPerSec != null) ? (
        <p className="text-[11px] ink-faint">
          每秒經驗是理論最快：不含走路、MISS、怪物回生，實際大概再低 1～3 成；{first?.ok && first.heal ? "群體治癒算範圍內每一隻" : "範圍技能也只算打一隻"}。出手時間是國際服經典版玩家整理，台服沒驗證。
        </p>
      ) : null}
      {sameGroups(state.groups) ? <p className="rounded-lg bg-[color:var(--paper-deep)] px-2.5 py-1.5 text-[13px]">兩組一樣，改下面右組的設定來比</p> : diff ? <p className="rounded-lg bg-[color:var(--leaf-wash)] px-2.5 py-1.5 text-[13px] font-bold">{diff}</p> : null}
      <details open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}>
        <Summary open={detailsOpen} className={SUMMARY}>看細節</Summary>
        <Details labels={labels} results={results} target={target} />
      </details>
    </section>
  );
}

function Details({ labels, results, target }: { labels: [string, string]; results: readonly [GroupResult, GroupResult]; target: Monster | null }) {
  const cell = (result: GroupResult, pick: (ok: Extract<GroupResult, { ok: true }>) => string | null) => (result.ok ? pick(result) ?? "—" : "—");
  // 每一列都標這個數字是哪一級可信度（能力視窗、總攻擊是客戶端算式；魔攻、木樁一下是舊版公式；爆擊、打怪、命中沒驗證）
  const rows: Array<[string, (ok: Extract<GroupResult, { ok: true }>) => string | null, Trust, string?]> = [
    ["能力視窗攻擊力", ok => (ok.panel ? fmt(ok.panel) : null), "client"],
    ["魔攻", ok => (ok.magicPower !== null ? String(ok.magicPower) : null), "legacy"],
    ["總攻擊", ok => (ok.magic ? null : String(ok.attack)), "client"],
    ["每一下（木樁）", ok => fmt(ok.raw.hit), "legacy"],
    ["爆擊那一下", ok => (ok.raw.crit && ok.critRate !== null ? `${fmt(ok.raw.crit.hit)}（${Math.round(ok.critRate * 100)}%）` : null), "unverified"],
    ["出一招幾秒", ok => (ok.speed ? `${secondsText(ok.speed.ms)} 秒（${ok.speed.fixed ? "固定" : ok.speed.stun ? "放完自暈" : `${ok.speed.tier} 階`}）` : "查不到"), "unverified", "括號是攻速階，開加速快 2 階；法師固定 6 階、極速詠唱快 1～2 階；龍咆哮放完會自暈；群體治癒固定 0.6 秒"],
  ];
  if (target) {
    rows.push(
      [`打${target.n}每一下`, ok => (ok.vs ? fmt(ok.vs.hit) : null), "unverified"],
      [`打${target.n}爆擊`, ok => (ok.vs?.crit ? fmt(ok.vs.crit.hit) : null), "unverified"],
      ["幾次打死", ok => (ok.vs ? `約 ${ok.vs.kills.avg}（最快 ${ok.vs.kills.fastest}、最慢 ${ok.vs.kills.slowest}）` : null), "unverified"],
      ["要不 miss，命中要", ok => (ok.vs ? `${ok.vs.accuracyKind === "magic" ? "魔法 " : ""}${ok.vs.accuracy.toLocaleString()}` : null), "unverified", "物理看能力視窗的命中率；法師看魔法命中（智力÷10＋幸運÷10）"],
      ["每秒經驗", ok => (ok.vs ? (ok.vs.expPerSec !== null ? expRateText(ok.vs.expPerSec) : "查不到") : null), "unverified", "只算打一隻（群體治癒算範圍內每一隻）、不含走路"],
    );
  }
  const visible = rows.filter(([, pick]) => results.some(result => result.ok && pick(result) !== null));
  return (
    <div className="mt-2 space-y-2">
      <table className="w-full table-fixed text-[13px]">
        <thead>
          <tr>
            <th className="w-[38%]" />
            {labels.map((_label, index) => <th key={index} className="pb-1 text-right text-[12px] font-black" style={{ color: `var(--${TONES[index]})` }}>{groupName(index, labels)}</th>)}
          </tr>
        </thead>
        <tbody>
          {visible.map(([label, pick, level, hint]) => (
            <tr key={label} className="border-t border-[color:var(--paper-edge)]">
              <th scope="row" className="py-1.5 pr-1 text-left text-[12px] font-bold ink-soft">
                {label}
                <TrustMark level={level} />
                {hint ? <span className="block text-[11px] font-normal ink-faint">{hint}</span> : null}
              </th>
              {results.map((result, index) => <td key={index} className="py-1.5 text-right font-bold tabular-nums">{cell(result, pick)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {results.map((result, index) =>
        result.ok && (result.short.length || result.notes.length) ? (
          <p key={index} className="text-[12px] ink-soft">
            <span className="font-bold" style={{ color: `var(--${TONES[index]})` }}>{groupName(index, labels)}：</span>
            {[result.short.length ? `穿不上：${shortText(result.short)}（照樣算）` : null, ...result.notes].filter(Boolean).join("；")}
          </p>
        ) : null,
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 分頁設定 */

const clampStat = (value: number) => Math.max(4, Math.min(9999, value));

function Stepper({ stat, value, onChange }: { stat: StatKey; value: number; onChange: (value: number) => void }) {
  const step = (delta: number) => {
    const next = clampStat(value + delta);
    if (next !== value) onChange(next);
  };
  return (
    <div className="rounded-lg bg-[color:var(--paper-deep)] px-1 py-1 text-center">
      <label className="block text-[11px] font-bold ink-soft" htmlFor={`stat-${stat}`}>{STAT_WORD[stat]}</label>
      <div className="flex items-center justify-center gap-1">
        <button type="button" aria-label={`${STAT_WORD[stat]}減 1`} className="grid size-9 place-items-center rounded-md bg-[color:var(--glass-strong)] text-[16px] font-black" onClick={() => step(-1)}>−</button>
        <DraftNumber id={`stat-${stat}`} className="w-14 bg-transparent text-center text-[17px] font-black tabular-nums" value={value} min={4} max={9999} onCommit={onChange} />
        <button type="button" aria-label={`${STAT_WORD[stat]}加 1`} className="grid size-9 place-items-center rounded-md bg-[color:var(--glass-strong)] text-[16px] font-black" onClick={() => step(1)}>＋</button>
      </div>
    </div>
  );
}

/**
 * 角色等級：−／＋ 跟能力值同一種按鈕、中間可以直接打字（Enter 或離開才算）、鍵盤上下鍵加減 1。
 * 打的數字不夾（交給 onLevel 夾回並寫說明）；按鈕到這個職業的最低等級、上限就停。
 */
function LevelStepper({ job, value, onLevel }: { job: number; value: number; onLevel: (level: number) => void }) {
  const lowest = minLevelFor(job);
  const step = (delta: number) => {
    const next = Math.min(LEVEL_CAP, Math.max(lowest, value + delta));
    if (next !== value) onLevel(next);
  };
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label="等級減 1" disabled={value <= lowest} className="grid size-9 place-items-center rounded-md bg-[color:var(--paper-deep)] text-[16px] font-black disabled:opacity-40" onClick={() => step(-1)}>−</button>
      <DraftNumber aria-label="等級" className="w-14 rounded-md border border-[color:var(--paper-edge)] bg-[color:var(--glass-strong)] py-1.5 text-center text-[16px] font-black tabular-nums" value={value} min={1} max={999} onCommit={onLevel} onStep={step} />
      <button type="button" aria-label="等級加 1" disabled={value >= LEVEL_CAP} className="grid size-9 place-items-center rounded-md bg-[color:var(--paper-deep)] text-[16px] font-black disabled:opacity-40" onClick={() => step(1)}>＋</button>
    </div>
  );
}

function LevelSelect({ label, id, data, group, onChange }: { label: string; id: number; data: CalcData; group: GroupConfig; onChange: (levels: Record<number, number>) => void }) {
  const max = data.skills.get(id)?.levels?.length ?? 0;
  if (!max) return null;
  return (
    <Row label={label}>
      <select aria-label={label} className={SELECT} value={group.levels[id] ?? 0} onChange={event => onChange({ ...group.levels, [id]: Number(event.target.value) })}>
        {Array.from({ length: max + 1 }, (_, level) => <option key={level} value={level}>{level === 0 ? "沒學" : `Lv.${level}`}</option>)}
      </select>
    </Row>
  );
}

export function GroupEditor({ data, state, result, active, onActive, onGroup }: {
  data: CalcData; state: CalcState;
  /** 現在改的這一組的計算結果（穿不上的武器要寫在武器那一列下面） */
  result: GroupResult; active: 0 | 1; onActive: (index: 0 | 1) => void; onGroup: (index: 0 | 1, group: GroupConfig) => void;
}) {
  const uid = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [levelsOpen, setLevelsOpen] = useVisitState("damage:levels", false);
  const job = state.shared.job;
  const group = state.groups[active];
  const set = (patch: Partial<GroupConfig>) => onGroup(active, { ...group, ...patch });
  const tabs = useMemo(() => tabsFor(data.gear.rules, job), [data.gear, job]);
  const weapons = useMemo(() => weaponChoices(data.gear, job), [data.gear, job]);
  const weapon = data.gear.weapons.find(entry => entry.id === group.weaponId);
  const ammo = useMemo(() => (weapon ? ammoChoices(data.gear.ammo ?? [], weapon.s) : []), [data.gear, weapon]);
  const magic = isMagicJob(job);
  const lineage = useMemo(() => new Set(jobLineage(job)), [job]);
  const inLine = (id: number) => lineage.has(data.skills.get(id)?.job ?? -1);
  const buffs = BUFFS.filter(buff => inLine(buff.id));
  const charges = weapon ? CHARGES.filter(charge => inLine(charge.id) && charge.weapons.includes(weapon.s)) : [];
  const masteryId = weapon ? masterySkillFor(weapon.s, job) : null;
  const critId = weapon?.s === "拳套" ? CRIT_SKILL.throw : weapon && (weapon.s === "弓" || weapon.s === "弩") ? CRIT_SKILL.bow : null;
  const ampId = AMP_SKILLS.find(inLine);
  // 加速（v0.87 使用者選 2A）：手上武器對得上的加速技能有學才出現勾選；沒學的可在「技能等級」改
  const booster = weapon ? boosterFor(data, job, weapon.s) : undefined;
  const boosterLevel = booster ? group.levels[booster.id] ?? 0 : 0;
  const boosterName = booster ? data.skills.get(booster.id)?.n ?? "加速" : null;
  // 全幸這種要湊裝備的點法：寫出預設的副屬性是「空身＋裝備」各多少（使用者改過那格就不寫）
  const plan = useMemo(() => gearPlan(data.gear, job, group.level, data.beforeOpen, group.tab), [data.gear, job, group.level, data.beforeOpen, group.tab]);
  const kitHint = plan.kit && group.stats[plan.kit.stat] === plan.kit.wear ? `${STAT_WORD[plan.kit.stat]}：空身 ${plan.kit.base}＋裝備 ${plan.kit.total}` : null;
  // 武器原本的攻擊／魔攻（「武器攻擊」那格沒改過時顯示這個）
  const baseWeaponPower = weapon ? (magic ? weapon.mag : weapon.atk) ?? 0 : 0;
  const amount = (id: number, stat: "pad" | "mad") => {
    const levels = data.skills.get(id)?.levels ?? [];
    return levels[(group.levels[id] || levels.length) - 1]?.[stat] ?? 0;
  };
  const panelId = `${uid}-panel`;
  const tabId = (index: number) => `${uid}-tab-${index}`;
  // 跟站上的 ChoiceGroup 一樣的鍵盤：Tab 只停在選中的那顆，左右鍵換到另一組並把焦點帶過去，Home／End 到頭尾（到頭會繞回去）
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = GROUP_NAMES.length - 1;
    const target = event.key === "ArrowRight" ? (index + 1) % GROUP_NAMES.length : event.key === "ArrowLeft" ? (index + last) % GROUP_NAMES.length : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (target === null) return;
    event.preventDefault();
    onActive(target as 0 | 1);
    tabRefs.current[target]?.focus();
  };
  return (
    <section aria-label="兩組設定" className="rounded-[var(--radius-card)] glass wood-frame p-3.5">
      <div role="tablist" aria-label="改哪一組" className="mb-2 grid grid-cols-2 gap-1 rounded-full bg-[color:var(--paper-deep)] p-1">
        {GROUP_NAMES.map((label, index) => (
          <button
            key={index}
            ref={node => {
              tabRefs.current[index] = node;
            }}
            id={tabId(index)}
            type="button"
            role="tab"
            aria-selected={active === index}
            aria-controls={panelId}
            tabIndex={active === index ? 0 : -1}
            onClick={() => onActive(index as 0 | 1)}
            onKeyDown={event => onTabKey(event, index)}
            className={`rounded-full py-1.5 text-[13px] ${active === index ? "font-black text-[color:var(--on-accent)]" : "font-bold ink-soft"}`}
            style={active === index ? { background: `var(--${TONES[index]})` } : undefined}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId(active)}>
        {tabs.length > 1 ? (
          <div className="py-2">
            <ChoiceGroup label="點法" options={tabs.map(entry => entry.tab)} value={group.tab ?? tabs[0].tab} onChange={tab => onGroup(active, regroup(data, job, group, { tab }))} />
          </div>
        ) : null}
        {tabs.length > 1 ? <p className="pb-1 text-right text-[11px] ink-faint">換點法會把能力值、武器重設成那套的預設</p> : null}
        <Row label="武器">
          {weapon ? <Sprite src={itemImage(weapon.id)} size={22} /> : null}
          <select aria-label="武器" className={SELECT} value={group.weaponId ?? ""} onChange={event => {
            const next = data.gear.weapons.find(entry => entry.id === Number(event.target.value));
            const nextAmmo = next ? ammoChoices(data.gear.ammo ?? [], next.s) : [];
            // 同一種彈藥還能用就留著；換了種類（弓換弩）就用預設：商店買得到、攻擊最高那種
            const keep = nextAmmo.some(entry => entry.id === group.ammoId);
            set({ weaponId: next?.id ?? null, weaponAtk: null, ammoId: keep ? group.ammoId : next ? defaultAmmo(data.gear.ammo ?? [], next.s, group.level, data.beforeOpen)?.id ?? null : null });
          }}>
            {group.weaponId === null ? <option value="" disabled>選武器</option> : null}
            {weapons.map(entry => <option key={entry.id} value={entry.id}>{`Lv.${entry.lv} ${entry.n}（${magic ? `魔攻 ${entry.mag ?? 0}` : `攻擊 ${entry.atk ?? 0}`}）${entry.o && data.beforeOpen ? "（10/15 開放）" : ""}`}</option>)}
          </select>
        </Row>
        {result.ok && result.levelNeeded !== null ? (
          <p className="my-1 rounded-lg bg-[color:var(--gold-wash)] px-2.5 py-1.5 text-[12px] font-bold">{levelNeededText(result.levelNeeded)}</p>
        ) : null}
        {result.ok && result.short.length ? (
          <p className="my-1 rounded-lg bg-[color:var(--gold-wash)] px-2.5 py-1.5 text-[12px] font-bold">穿不上：{shortText(result.short)}（照樣算）</p>
        ) : null}
        {weapon ? (
          <>
            <Row label={magic ? "武器魔攻" : "武器攻擊"}>
              <DraftNumber
                aria-label={magic ? "武器魔攻" : "武器攻擊"}
                className={`${SELECT} w-20 text-right`}
                value={group.weaponAtk ?? baseWeaponPower}
                min={0}
                max={999}
                onCommit={value => set({ weaponAtk: value === baseWeaponPower ? null : value })}
              />
            </Row>
            <p className="pb-1 text-right text-[11px] ink-faint">
              {group.weaponAtk === null ? `${weapon.n}原本的${magic ? "魔攻" : "攻擊"}，衝卷後自己改` : `原本 ${baseWeaponPower}，換武器會重設`}
            </p>
          </>
        ) : null}
        {ammo.length ? (
          <Row label={<span className="flex flex-col items-start gap-0.5">{ammo[0].kind}{ammo[0].kind === "飛鏢" ? null : <span className="rounded-full bg-[color:var(--gold-wash)] px-1.5 py-0.5 text-[11px] font-bold leading-tight text-[color:var(--gold)]">台服沒驗證</span>}</span>}>
            {group.ammoId ? <Sprite src={itemImage(group.ammoId)} size={22} /> : null}
            <select aria-label={ammo[0].kind} className={SELECT} value={group.ammoId ?? ""} onChange={event => set({ ammoId: Number(event.target.value) })}>
              {ammo.map(entry => <option key={entry.id} value={entry.id}>{`${entry.n}（攻擊 +${entry.atk}）${entry.o && data.beforeOpen ? "（10/15 開放）" : ""}`}</option>)}
            </select>
          </Row>
        ) : null}
        <Row label={magic ? "其他魔攻" : "其他攻擊"}>
          <DraftNumber aria-label={magic ? "其他魔攻" : "其他攻擊"} className={`${SELECT} w-20 text-right`} value={group.extra} min={0} max={999} onCommit={extra => set({ extra })} />
        </Row>
        <p className="pb-1 text-right text-[11px] ink-faint">手套衝卷、其他裝備加的{magic ? "魔攻" : "攻擊"}</p>
        <div className="grid grid-cols-2 gap-1.5 py-2">
          {STAT_ORDER.map(stat => <Stepper key={stat} stat={stat} value={group.stats[stat]} onChange={value => set({ stats: { ...group.stats, [stat]: value } })} />)}
        </div>
        {kitHint ? <p className="text-[12px] font-bold">{kitHint}</p> : null}
        <p className="text-[11px] ink-faint">預設是首頁「能力值與裝備」那套點法（含要湊的裝備），身上其他裝備加的自己加</p>
        {buffs.length || charges.length || (booster && boosterLevel > 0) ? (
          <div className="space-y-1.5 py-2">
            <p className="text-[13px] font-bold ink-soft">增益</p>
            {booster && boosterLevel > 0 ? (
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" checked={group.booster} onChange={event => set({ booster: event.target.checked })} />
                <Sprite src={skillImage(booster.id)} size={20} />
                {boosterName}（{magic ? "施法" : "攻擊速度"}快 {boosterSteps(booster, boosterLevel)} 階）
              </label>
            ) : null}
            {buffs.map(buff => (
              <label key={buff.id} className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" checked={group.buffs.includes(buff.id)} onChange={event => set({ buffs: event.target.checked ? [...group.buffs, buff.id] : group.buffs.filter(id => id !== buff.id) })} />
                <Sprite src={skillImage(buff.id)} size={20} />
                {data.skills.get(buff.id)?.n}（{buff.stat === "pad" ? "攻擊" : "魔攻"} +{amount(buff.id, buff.stat)}）
              </label>
            ))}
            {charges.length ? (
              <Row label="充能">
                <select aria-label="充能" className={SELECT} value={group.charge ?? ""} onChange={event => set({ charge: event.target.value === "" ? null : Number(event.target.value) })}>
                  <option value="">不用</option>
                  {charges.map(charge => <option key={charge.id} value={charge.id}>{data.skills.get(charge.id)?.n}</option>)}
                </select>
              </Row>
            ) : null}
          </div>
        ) : null}
        <details className="pt-1" open={levelsOpen} onToggle={event => setLevelsOpen(event.currentTarget.open)}>
          <Summary open={levelsOpen} className={SUMMARY}>技能等級（預設照主流技能點法）</Summary>
          {masteryId !== null ? <LevelSelect label={data.skills.get(masteryId)?.n ?? "精準"} id={masteryId} data={data} group={group} onChange={levels => set({ levels })} /> : null}
          {critId !== null && inLine(critId) ? <LevelSelect label={data.skills.get(critId)?.n ?? "爆擊"} id={critId} data={data} group={group} onChange={levels => set({ levels })} /> : null}
          {ampId !== undefined ? <LevelSelect label={data.skills.get(ampId)?.n ?? "魔力激發"} id={ampId} data={data} group={group} onChange={levels => set({ levels })} /> : null}
          {booster && boosterName ? <LevelSelect label={boosterName} id={booster.id} data={data} group={group} onChange={levels => set({ levels })} /> : null}
          {charges.map(charge => (group.charge === charge.id ? <LevelSelect key={charge.id} label={data.skills.get(charge.id)?.n ?? "充能"} id={charge.id} data={data} group={group} onChange={levels => set({ levels })} /> : null))}
        </details>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 怎麼算的 */

export function HowCard({ data, job, level }: { data: CalcData; job: number; level: number }) {
  const [open, setOpen] = useVisitState("damage:how", false);
  const missing = useMemo(() => notCalculatedFor(data.skills, job), [data.skills, job]);
  const hasHeal = useMemo(() => attackSkillIds(data.skills, job).includes(HEAL), [data.skills, job]);
  const guided = useMemo(() => skillLevelsAt(job, level, data.guides, data.skills).guided, [job, level, data.guides, data.skills]);
  return (
    <details className="rounded-[var(--radius-card)] glass wood-frame p-3.5" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <Summary open={open} className="cursor-pointer py-1.5 text-[15px] font-black">怎麼算的</Summary>
      <div className="mt-2 space-y-2 text-[13px] leading-relaxed">
        <p><Tag level="client" /> 能力視窗攻擊力：依客戶端計算式整理的公式，還沒跟台服遊戲畫面逐筆對過。</p>
        <p><Tag level="legacy" /> 技能倍率（雙飛斬、魔法、龍咆哮、強弓…）：舊版公式，楓錄、楓憶跟舊版公式彙整寫法一致。</p>
        <p><Tag level="unverified" /> 打怪（防禦、等級差、屬性）、爆擊、命中：舊版國際服的公式，台服經典版沒人實測過，數字可能不準。</p>
        <p><Tag level="unverified" /> 出一招幾秒、每秒經驗：國際服經典版玩家整理的出手時間（每個技能、每個攻速一張表），台服沒驗證；每秒經驗不含走路、MISS、怪物回生，範圍技能也只算打一隻。海盜、龍之獻祭查不到。</p>
        {hasHeal ? (
          <p><Tag level="unverified" /> 群體治癒打不死系：(智力×1.2＋幸運)×魔攻÷1000×目標倍率×恢復力%，下限把 1.2 換成 0.3；目標倍率＝1.5＋5÷(範圍內隻數＋自己)。舊版玩家整理，台服沒驗證；算不算神聖屬性各說各話，這裡不乘。</p>
        ) : null}
        {guided ? null : <p className="font-bold">這個職業還沒有技能點法攻略，技能等級先用最高等級</p>}
        <SourceLinks urls={["https://bobogameguides.com/maplestory-classic/tools/attack-power/", "https://ayumilovemaple.wordpress.com/2009/09/06/maplestory-formula-compilation/", "https://oddjobs.codeberg.page/dmg-calc/", "https://meowdb.com/msclassic/guides/attack-speed-and-animation-times"]} />
        {missing.length ? (
          <div>
            <p className="font-bold">沒算的</p>
            <ul className="list-disc pl-5">
              {missing.map(entry => <li key={entry.id}>{entry.name}：{entry.reason}</li>)}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}
