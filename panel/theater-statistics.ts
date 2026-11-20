// Month mapping and roster rules follow MIT Miao-Plugin 2860761836069af80bacee5cb85b6dd2e91ea0b0, apps/profile/ProfileStat.js.
import { fileURLToPath } from "node:url";
import { createAtlasRuntimeCatalog } from "@lotus-yunzai/atlas/catalog";
import { object, text, whole, type PanelAvatar, type PanelSnapshot } from "./model.ts";
import type { PanelTheme } from "./theme.ts";

const atlasRoot = fileURLToPath(new URL("../../../data/atlas/", import.meta.url));
const elements = new Map([
  ["风", "anemo"], ["岩", "geo"], ["雷", "electro"], ["草", "dendro"], ["水", "hydro"], ["火", "pyro"], ["冰", "cryo"],
]);
const knownElementsKeys = new Set(elements.values());
const bossActs = new Map([
  ["第三幕", "第三幕"], ["第六幕", "第六幕"], ["第八幕", "第八幕"], ["第十幕", "第十幕"],
  ["圣牌一", "圣牌挑战 I"], ["圣牌二", "圣牌挑战 II"],
]);
const manekins = new Set([10000117, 10000118]);

type AtlasTheater = NonNullable<Awaited<ReturnType<ReturnType<typeof createAtlasRuntimeCatalog>["theaterDetails"]>>>;

function monthWindow(month: string) {
  const match = /^(20\d{2})(0[1-9]|1[0-2])$/u.exec(month);
  if (!match) return;
  const year = Number(match[1]), monthNumber = Number(match[2]);
  // Miao's Nanoka source uses record 3 for the July 2024 launch.
  const id = (year - 2024) * 12 + monthNumber - 7 + 3;
  if (id < 3) return;
  const key = `${match[1]}-${match[2]}`;
  const reset = id === 3 ? "10:00:00" : "04:00:00";
  const next = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 7);
  return { id: String(id), begin: `${key}-01 ${reset}`, end: `${next}-01 03:59:59` };
}

export async function readTheaterStatisticsMonth(month: string, signal: AbortSignal): Promise<AtlasTheater | undefined> {
  signal.throwIfAborted();
  const expected = monthWindow(month);
  if (!expected) return;
  const atlas = createAtlasRuntimeCatalog(atlasRoot, Bun.env.LOTUS_ATLAS_DATA_DIR);
  const catalog = await atlas.read().catch(() => undefined);
  signal.throwIfAborted();
  if (!catalog || catalog.stale) return;
  const page = catalog.pages.find(({ game, challengeMode }) => game === "gi" && challengeMode?.id === "rolecombat");
  const entry = page?.entries.find(({ id }) => id === expected.id);
  if (page?.sampled || !entry) return;
  const theater = await atlas.theaterDetails(entry, catalog);
  signal.throwIfAborted();
  const window = theater?.window;
  if (window?.from === "live" && window.begin === expected.begin && window.end === expected.end) return theater;
}

export function selectTheaterStatistics(snapshot: PanelSnapshot, theme: PanelTheme, theater: AtlasTheater) {
  const knownElements = [...new Set(theater.elements.map(({ name }) => name))].flatMap(name => {
    const key = elements.get(name);
    return key ? [{ key, name }] : [];
  });
  const knownRoles = (group: string) => [...new Set(theater.groups.find(({ name }) => name === group)?.cards.map(card => card.id) ?? [])]
    .flatMap(id => {
      if (id === undefined || !Number.isSafeInteger(id) || id <= 0) return [];
      const meta = object(theme.characters[id]);
      const name = text(meta?.name);
      const elem = text(meta?.elem);
      const star = whole(meta?.star, 5);
      return name && knownElementsKeys.has(elem) && star ? [{ id, name, elem, star }] : [];
    });
  const opening = knownRoles("开幕角色");
  const invited = knownRoles("特邀角色");
  if (!knownElements.length || !opening.length || !invited.length) return;

  const roster = new Map(Object.values(snapshot.avatars)
    .filter(avatar => object(theme.characters[avatar.id]) && !["change", "customize", "share"].includes(avatar._source))
    .map(avatar => [avatar.id, avatar]));
  const trials: PanelAvatar[] = [];
  for (const role of opening) {
    if ((roster.get(role.id)?.level ?? 0) >= 90) continue;
    const trial = { ...role, level: 90, cons: 0, talent: { a: 8, e: 8, q: 8 }, artis: {}, _source: "local" };
    trials.push(trial);
    roster.set(role.id, trial);
  }
  const allowed = new Set(knownElements.map(({ key }) => key));
  const invitedIds = new Set(invited.map(({ id }) => id));
  const avatars = [...roster.values()].filter(({ id, elem, level }) =>
    level >= 70 && !manekins.has(id) && (invitedIds.has(id) || allowed.has(elem)));
  const information = [
    `限制元素：${knownElements.map(({ name }) => name).join("、")}`,
    `开幕角色：${opening.map(({ name }) => name).join("、")}`,
    `特邀角色：${invited.map(({ name }) => name).join("、")}`,
    ...[...bossActs].flatMap(([act, label]) => {
      const enemies = theater.acts.find(({ name }) => name === act)?.enemies;
      return enemies?.length ? [`${label}：${enemies.map(({ name }) => name).join("、")}`] : [];
    }),
  ].join("\n");
  return { avatars, trials, text: information };
}
