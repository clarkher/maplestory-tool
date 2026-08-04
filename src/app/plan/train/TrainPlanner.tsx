"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertIcon, ChevronDown } from "@/components/Icons";
import { EmptyBlock, GoButton, LoadingBlock, PlanShell } from "@/components/PlanShell";
import { loadMaps, loadMeta, loadMonsters, loadTraining, mapName, minimapImage, monsterImage } from "@/lib/data";
import { useProfile } from "@/lib/profile";
import { planTraining, relativeIndex, requiredAccuracy } from "@/lib/planner";
import type { MapRecord, Meta, Monster, TrainingRow } from "@/lib/types";

export function TrainPlanner() {
  const { profile, setProfile, loaded } = useProfile();
  const [maps, setMaps] = useState<Record<string, MapRecord> | null>(null);
  const [monsters, setMonsters] = useState<Monster[] | null>(null);
  const [training, setTraining] = useState<TrainingRow[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadMaps(), loadMonsters(), loadTraining(), loadMeta()])
      .then(([mapData, monsterData, trainingData, metaData]) => {
        setMaps(mapData);
        setMonsters(monsterData);
        setTraining(trainingData);
        setMeta(metaData);
      })
      .catch(loadError => setError(String(loadError.message ?? loadError)));
  }, []);

  const monsterIndex = useMemo(
    () => new Map((monsters ?? []).map(monster => [monster.id, monster])),
    [monsters],
  );

  const picks = useMemo(() => {
    if (!training || !monsterIndex.size || profile.level <= 0) return [];
    return planTraining(profile, training, monsterIndex, 24);
  }, [training, monsterIndex, profile]);

  const index = useMemo(() => relativeIndex(picks), [picks]);
  const ready = Boolean(maps && monsters && training);

  return (
    <PlanShell
      title="打怪練功"
      lead="照你的等級排出值得去的地圖。看得到刷怪點多不多、回生多快、你的命中夠不夠。"
      profile={profile}
      onProfileChange={setProfile}
      needsProfile={loaded && profile.level <= 0}
    >
      {error ? (
        <EmptyBlock title="資料載入失敗" hint={error} />
      ) : !ready ? (
        <LoadingBlock />
      ) : picks.length === 0 ? (
        <EmptyBlock
          title={`Lv.${profile.level} 找不到合適的地圖`}
          hint="資料庫的怪物圖鑑目前收錄到 Lv.180，如果你的等級很低或很高，可以先看看鄰近等級。"
        />
      ) : (
        <>
          <p className="rounded-xl bg-[color:var(--sky-wash)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[color:var(--ink-soft)]">
            效率指數是這批推薦裡的相對比較（最高的那張 = 100），
            算法是「一輪清完的經驗 ÷ 回生秒數」再乘上等級適配度。
            <strong className="font-bold"> 這裡不提供每小時經驗</strong>
            ——那要知道你的清怪速度，我們不知道，硬算出來會是假數字。
          </p>

          {([
            { key: "safe", title: "這等級穩穩打", hint: "怪不會高過你 5 級", rows: picks.filter(p => p.topGap <= 5) },
            { key: "risky", title: "拚一點，經驗更高", hint: "有比你高的怪，確認打得動再去", rows: picks.filter(p => p.topGap > 5) },
          ] as const).map(group => group.rows.length ? (
            <section key={group.key} className="space-y-2.5">
              <h2 className="flex flex-wrap items-baseline gap-x-2 px-1">
                <span className="text-[15px] font-black">{group.title}</span>
                <span className="text-xs ink-faint">{group.hint} · {group.rows.length} 張</span>
              </h2>
              <ul className="space-y-3">
                {group.rows.map(pick => (
                  <TrainCard
                    key={pick.row.m}
                    row={pick.row}
                    score={index.get(pick.row.m) ?? 0}
                    needAcc={pick.needAcc}
                    warn={pick.warn}
                    topGap={pick.topGap}
                    maps={maps!}
                    monsterIndex={monsterIndex}
                    playerLevel={profile.level}
                  />
                ))}
              </ul>
            </section>
          ) : null)}

          {meta ? (
            <p className="px-1 text-xs leading-relaxed ink-faint">
              回生秒數取自客戶端刷怪點設定；沒有指定的一般怪以 {meta.assumptions.defaultRespawnSeconds} 秒計，
              那是經典版社群通用的估值，用於地圖之間比較。
            </p>
          ) : null}
        </>
      )}
    </PlanShell>
  );
}

function TrainCard({
  row,
  score,
  needAcc,
  warn,
  topGap,
  maps,
  monsterIndex,
  playerLevel,
}: {
  row: TrainingRow;
  score: number;
  needAcc: number;
  warn?: "too-strong" | "too-weak";
  topGap: number;
  maps: Record<string, MapRecord>;
  monsterIndex: Map<number, Monster>;
  playerLevel: number;
}) {
  const [open, setOpen] = useState(false);
  const record = maps[String(row.m)];
  const name = mapName(maps, row.m);
  const englishOnly = Boolean(record && !record.zh && record.en);

  return (
    <li className="overflow-hidden rounded-[var(--radius-card)] glass wood-frame">
      <div className="flex gap-3 p-3.5 sm:p-4">
        <ScoreBadge score={score} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="text-[17px] font-black leading-tight">{name}</h3>
            {record?.st ? <span className="text-xs ink-faint">{record.st}</span> : null}
          </div>
          {englishOnly ? (
            <p className="mt-0.5 text-[11px] ink-faint">此圖客戶端資料沒有中文名，顯示的是英文原名</p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {row.mobs.filter(([id]) => !monsterIndex.get(id)?.un).slice(0, 4).map(([mobId, count]) => {
              const monster = monsterIndex.get(mobId);
              if (!monster) return null;
              return (
                <span
                  key={mobId}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--paper-deep)] py-1 pl-1 pr-2.5"
                >
                  <Image
                    src={monsterImage(mobId)}
                    alt=""
                    width={22}
                    height={22}
                    className="size-[22px] object-contain"
                    unoptimized
                  />
                  <span className="text-[13px] font-bold">{monster.n}</span>
                  <span className="text-[11px] tabular-nums ink-faint">Lv{monster.lv} ×{count}</span>
                </span>
              );
            })}
            {row.mobs.length > 4 ? (
              <span className="text-[12px] ink-faint">還有 {row.mobs.length - 4} 種</span>
            ) : null}
          </div>

          <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            <Stat label="怪物等級" value={row.lvMin === row.lvMax ? `Lv${row.lvMax}` : `Lv${row.lvMin}–${row.lvMax}`} tone={topGap > 8 ? "warn" : undefined} />
            <Stat label="刷怪點" value={`${row.sp} 個`} />
            <Stat label="回生" value={`${row.resp} 秒`} />
            <Stat label="清一輪" value={`${row.exp1.toLocaleString()} 經驗`} />
            <Stat
              label="命中需求"
              value={needAcc <= 1 ? "幾乎不會 miss" : `${needAcc}`}
              tone={needAcc > 1 ? "warn" : undefined}
            />
          </dl>

          {warn ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--maple-wash)] px-2 py-1 text-[12px] font-bold text-[color:var(--maple)]">
              <AlertIcon size={13} />
              {warn === "too-strong"
                ? `這張圖有 Lv${row.lvMax} 的怪，比你高 ${topGap} 級，先確認打得動再來`
                : `怪比你低 ${playerLevel - row.lv} 級，經驗會很差`}
            </p>
          ) : null}
          {row.unk ? (
            <p className="mt-1.5 text-[12px] ink-faint">
              另有 {row.unk} 個刷怪點的怪不在圖鑑資料裡，沒有計入上面的數字
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[color:var(--paper-edge)] px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          className="tap-safe inline-flex items-center gap-1 text-sm font-bold ink-soft hover:text-[color:var(--maple)]"
          aria-expanded={open}
        >
          {open ? "收起細節" : "看全部怪與小地圖"}
          <ChevronDown size={15} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>
        <GoButton to={row.m} />
      </div>

      {open ? (
        <div className="space-y-3 border-t border-[color:var(--paper-edge)] bg-[color:var(--paper-deep)]/50 p-3.5">
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {row.mobs.map(([mobId, count, mobTime]) => {
              const monster = monsterIndex.get(mobId);
              if (!monster) return null;
              return (
                <li key={mobId} className="flex items-center gap-2 rounded-lg bg-[color:var(--paper)] px-2 py-1.5">
                  <Image
                    src={monsterImage(mobId)}
                    alt=""
                    width={26}
                    height={26}
                    className="size-[26px] object-contain"
                    unoptimized
                  />
                  <Link
                    href={`/db/monsters?id=${mobId}`}
                    className="min-w-0 flex-1 truncate text-[13px] font-bold hover:text-[color:var(--maple)]"
                  >
                    {monster.n}
                  </Link>
                  <span className="shrink-0 text-[11px] tabular-nums ink-faint">
                    Lv{monster.lv} · {count} 點 · 命中 {requiredAccuracy(playerLevel, monster)}
                    {mobTime ? ` · 回生 ${mobTime}s` : ""}
                  </span>
                </li>
              );
            })}
          </ul>

          {record?.mm ? (
            <figure className="overflow-hidden rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] p-2">
              <Image
                src={minimapImage(row.m)}
                alt={`${name} 小地圖`}
                width={640}
                height={200}
                className="mx-auto h-auto w-full max-w-md object-contain"
                unoptimized
              />
              <figcaption className="mt-1 text-center text-[11px] ink-faint">遊戲內小地圖</figcaption>
            </figure>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-start">
      <div
        className="grid size-12 place-items-center rounded-2xl font-black tabular-nums"
        style={{
          backgroundColor: "var(--maple-wash)",
          color: "var(--maple)",
          fontSize: score >= 100 ? 17 : 19,
        }}
      >
        {score}
      </div>
      <span className="mt-1 text-[10px] ink-faint">效率指數</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="text-[11px] ink-faint">{label}</dt>
      <dd
        className="font-bold tabular-nums"
        style={tone === "warn" ? { color: "var(--maple)" } : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
