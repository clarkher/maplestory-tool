"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chip } from "@/components/route/bits";
import { DbBrowser, DetailCard, Section, StatGrid, type DbEntry } from "@/components/DbBrowser";
import { GoButton } from "@/components/PlanShell";
import {
  itemImage, loadItems, loadMaps, loadMonsters, mapName, monsterImage, peekItems, peekMaps, peekMonsters,
} from "@/lib/data";
import { elementalNotes, formatNumber } from "@/lib/format";
import { monsterSuitsJob, trainingRuleNote } from "@/lib/job-rules";
import { FIRST_MAPS, monsterDrops, monsterMaps } from "@/lib/monster-view";
import { inTrainingBand } from "@/lib/planner";
import { useStoredProfile } from "@/lib/profile";
import { useBeforeV002 } from "@/lib/release";
import { useRemembered } from "@/lib/remember";
import type { Item, MapRecord, Monster } from "@/lib/types";
import { isV002Map, isV002Monster } from "@/lib/v002";

export function MonsterDb() {
  // 這次瀏覽載過就直接用，再進來第一個畫面就是完整清單
  const [monsters, setMonsters] = useState<Monster[] | null>(peekMonsters);
  const [maps, setMaps] = useState<Record<string, MapRecord> | null>(peekMaps);
  const [items, setItems] = useState<Item[] | null>(peekItems);
  const [error, setError] = useState<string | null>(null);
  const [showUnnamed, setShowUnnamed] = useRemembered("db:怪物:showUnnamed", false);
  const [onlyBand, setOnlyBand] = useRemembered("db:怪物:onlyBand", false);
  const notOpenYet = useBeforeV002();
  // 角色列填了等級才出現「只看適合我練的」：練功帶＝同級到高 5 級，再套職業規則（跟練功推薦同一套）
  const { profile, loaded } = useStoredProfile();
  const level = loaded && profile.level > 0 ? profile.level : null;
  const bandLevel = onlyBand ? level : null;
  const rule = level === null ? null : trainingRuleNote(profile.job, level);

  useEffect(() => {
    Promise.all([loadMonsters(), loadMaps(), loadItems()])
      .then(([monsterData, mapData, itemData]) => {
        setMonsters(monsterData);
        setMaps(mapData);
        setItems(itemData);
      })
      .catch(loadError => setError(String(loadError.message ?? loadError)));
  }, []);

  const monsterIndex = useMemo(
    () => new Map((monsters ?? []).map(monster => [String(monster.id), monster])),
    [monsters],
  );
  const itemIndex = useMemo(() => new Map((items ?? []).map(item => [item.id, item])), [items]);

  const entries = useMemo<DbEntry[]>(() => {
    if (!monsters || !maps) return [];
    return monsters
      .filter(monster => showUnnamed || !monster.un)
      .filter(monster => bandLevel === null || (
        monster.lv !== null && inTrainingBand(bandLevel, monster.lv) && monsterSuitsJob(profile.job, bandLevel, monster)
      ))
      .sort((a, b) => (a.lv ?? 0) - (b.lv ?? 0) || a.id - b.id)
      .map(monster => ({
        id: String(monster.id),
        name: monster.n,
        note: monster.lv ? `Lv.${monster.lv}` : undefined,
        image: monsterImage(monster.id),
        badge: isV002Monster(monster, maps) && notOpenYet ? <Chip tone="gold">10/15 開放</Chip> : undefined,
      }));
  }, [monsters, maps, showUnnamed, bandLevel, profile.job, notOpenYet]);

  return (
    <DbBrowser
      title="怪物"
      lead="每隻怪的數值、屬性抗性、出沒地圖與掉落物。點地圖可以直接算路線過去。"
      entries={entries}
      loading={!monsters || !maps || !items}
      error={error}
      filters={
        <div className="space-y-2">
          {level !== null ? (
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-[13px] ink-soft">
                <input
                  type="checkbox"
                  checked={onlyBand}
                  onChange={event => setOnlyBand(event.target.checked)}
                  className="size-4 accent-[color:var(--maple)]"
                />
                只看適合我練的（Lv.{level}–{level + 5}）
              </label>
              {onlyBand && rule ? <p className="pl-6 text-xs ink-faint">{rule}</p> : null}
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-[13px] ink-soft">
            <input
              type="checkbox"
              checked={showUnnamed}
              onChange={event => setShowUnnamed(event.target.checked)}
              className="size-4 accent-[color:var(--maple)]"
            />
            連沒有名字的怪一起列（通常是活動或未啟用的內容）
          </label>
        </div>
      }
      renderDetail={id => {
        const monster = monsterIndex.get(id);
        if (!monster || !maps) return null;
        // key：換一隻怪，「看全部」重新收起來
        return <MonsterDetail key={monster.id} monster={monster} maps={maps} itemIndex={itemIndex} />;
      }}
    />
  );
}

function MonsterDetail({
  monster,
  maps,
  itemIndex,
}: {
  monster: Monster;
  maps: Record<string, MapRecord>;
  itemIndex: Map<number, Item>;
}) {
  const notOpenYet = useBeforeV002();
  const elements = elementalNotes(monster.el);
  // 出沒地圖只列開放的圖：現在就能去、刷怪點多的在前，10/15 才開的排後面；先列幾張，按「看全部」才全部列
  const { rows: mapRows, hidden: hiddenMaps } = monsterMaps(monster, maps, map => notOpenYet && isV002Map(map));
  // 展開記到關掉分頁為止：點地圖、掉落物離開再按返回，卡片還是一樣長，瀏覽器才捲得回原位
  const [allMapsShown, setAllMapsShown] = useRemembered(`db:怪物:allMaps:${monster.id}`, false);
  const visibleMaps = allMapsShown ? mapRows : mapRows.slice(0, FIRST_MAPS);
  // 按「看全部」後按鈕不見了：焦點放到新列出來的第一列，用鍵盤、讀螢幕的人才不會被丟回頁首
  const firstNewMap = useRef<HTMLLIElement>(null);
  const justExpanded = useRef(false);
  useEffect(() => {
    if (!allMapsShown || !justExpanded.current) return;
    justExpanded.current = false;
    firstNewMap.current?.querySelector("a")?.focus({ preventScroll: true });
  }, [allMapsShown]);
  // 掉落物不列沒有名字的道具（道具清單本來就不列）
  const { shown: drops, hidden: hiddenDrops } = monsterDrops(monster.drops, itemIndex);

  return (
    <DetailCard>
      <header className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={monsterImage(monster.id)} alt="" width={56} height={56} className="size-14 object-contain" />
        <div className="min-w-0">
          <h2 className="text-2xl font-black leading-tight">
            {monster.n}
            {isV002Monster(monster, maps) && notOpenYet ? <span className="ml-1.5 align-middle"><Chip tone="gold">10/15 開放</Chip></span> : null}
          </h2>
          <p className="mt-0.5 text-sm ink-soft">
            Lv.{monster.lv} · HP {formatNumber(monster.hp)} · 經驗 {formatNumber(monster.exp)}
            <span className="ml-2 text-xs ink-faint">#{monster.id}</span>
          </p>
        </div>
      </header>

      <StatGrid
        rows={[
          ["物理攻擊", monster.pad],
          ["物理防禦", monster.pdd],
          ["魔法攻擊", monster.mad],
          ["魔法防禦", monster.mdd],
          ["命中", monster.acc],
          ["迴避", monster.eva],
          ["移動速度", monster.spd],
          ["不死", monster.und ? "是" : "否"],
        ]}
      />

      {elements.length ? (
        <Section title="屬性抗性">
          <ul className="flex flex-wrap gap-1.5">
            {elements.map(element => (
              <li
                key={element.element}
                className="rounded-full px-2.5 py-1 text-[13px] font-bold"
                style={{
                  backgroundColor: element.tone === "good" ? "var(--leaf-wash)" : "var(--maple-wash)",
                  color: element.tone === "good" ? "var(--leaf)" : "var(--maple)",
                }}
              >
                {element.element} {element.text}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {mapRows.length || hiddenMaps ? (
        <Section title="出沒地圖" extra={mapRows.length ? `${mapRows.length} 張` : undefined}>
          {mapRows.length ? (
            <ul className="space-y-1.5">
              {visibleMaps.map((row, index) => (
                <li
                  key={row.id}
                  ref={index === FIRST_MAPS ? firstNewMap : undefined}
                  className="flex items-center justify-between gap-2 rounded-xl bg-[color:var(--paper-deep)] px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate font-bold">{mapName(maps, row.id)}</span>
                      {row.later ? <Chip tone="gold">10/15 開放</Chip> : null}
                    </span>
                    <span className="block text-[11px] ink-faint">
                      {maps[String(row.id)]?.st}
                      {row.spawns !== null ? ` · ${row.spawns} 個刷怪點` : " · 沒有刷怪點資料"}
                    </span>
                  </span>
                  <GoButton to={row.id} label="路線" />
                </li>
              ))}
            </ul>
          ) : null}
          {visibleMaps.length < mapRows.length ? (
            <button
              type="button"
              onClick={() => {
                justExpanded.current = true;
                setAllMapsShown(true);
              }}
              className="tap-safe w-full rounded-xl border border-[color:var(--paper-edge)] py-2.5 text-sm font-bold ink-soft hover:text-[color:var(--maple)]"
            >
              看全部 {mapRows.length} 張
            </button>
          ) : null}
          {hiddenMaps ? (
            <p className="text-xs ink-faint">
              {mapRows.length ? `另有 ${hiddenMaps} 張還沒開放的地圖沒列出來` : `出沒的 ${hiddenMaps} 張地圖都還沒開放，沒列出來`}
            </p>
          ) : null}
        </Section>
      ) : null}

      {drops.length || hiddenDrops ? (
        <Section title="掉落物" extra={drops.length ? `${drops.length} 樣 · 官方未公開機率` : undefined}>
          {drops.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {drops.map(itemId => {
                const item = itemIndex.get(itemId);
                return (
                  <li key={itemId}>
                    <Link
                      href={`/db/items?id=${itemId}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--paper-deep)] py-1 pl-1 pr-2.5 transition-colors hover:bg-[color:var(--maple-wash)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={itemImage(itemId)} alt="" width={22} height={22} loading="lazy" className="size-[22px] object-contain" />
                      <span className="text-[13px] font-bold">{item?.n}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {hiddenDrops ? (
            <p className="text-xs ink-faint">
              {drops.length ? `另有 ${hiddenDrops} 樣還沒有名字的道具沒列出來` : `掉的 ${hiddenDrops} 樣道具都還沒有名字，沒列出來`}
            </p>
          ) : null}
        </Section>
      ) : null}
    </DetailCard>
  );
}
