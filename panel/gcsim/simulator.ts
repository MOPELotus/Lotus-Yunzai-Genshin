import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { object, text, type Json, type PanelAvatar } from "../model.ts";
import type { TeamDamageResult } from "../team-damage-model.ts";
import type { PanelTheme } from "../theme.ts";
import { createSimulationConfig, readRotation, type Rotation, type SimCatalog } from "./config.ts";
import { runtimeDirectory, runtimeExecutable, selectedRuntime, verifyRuntime } from "./runtime.ts";
import { simulatorCommit } from "./versions.ts";

const processLimit = 2;
const resultLimit = 32 * 1024 * 1024;
const actionNames: Readonly<Record<string, string>> = {
  attack: "普攻", charge: "重击", skill: "战技", burst: "爆发", dash: "冲刺",
  aim: "瞄准", plunge: "下落", high_plunge: "高空下落", low_plunge: "低空下落",
};
const missing = new TypeError("gcsim 返回的本地模拟结果不完整。");
const damageFormat = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });

async function jsonFile(path: string): Promise<Json> {
  if ((await stat(path)).size > resultLimit) throw missing;
  const value = object(JSON.parse(await readFile(path, "utf8")));
  if (!value) throw missing;
  return value;
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1e13 ? value : undefined;
}

export function simulationResult(aggregate: Json, sample: Json | undefined, rotation: Rotation,
  names: ReadonlyMap<string, string>, detail = true): TeamDamageResult {
  const stats = object(aggregate.statistics);
  const total = numeric(object(stats?.total_damage)?.mean);
  const duration = numeric(object(stats?.duration)?.mean);
  const rate = numeric(object(stats?.dps)?.mean);
  const iterations = numeric(stats?.iterations);
  const contribution = object(stats?.cumu_damage_contrib)?.characters;
  const characters = aggregate.character_details;
  if (aggregate.sim_version !== simulatorCommit || total === undefined || !duration || rate === undefined || !iterations ||
      !Array.isArray(contribution) || !Array.isArray(characters) || characters.length !== names.size ||
      !characters.every((row, index) => object(row)?.name === rotation.characterKeys[index])) throw missing;
  const contributions = characters.map((row, index) => {
    const values = object(contribution[index])?.buckets;
    const value = numeric(object(Array.isArray(values) ? values.at(-1) : undefined)?.mean);
    const name = names.get(text(object(row)?.name));
    if (!name || value === undefined) throw missing;
    return { name, value: Math.round(value * total) };
  }).sort((a, b) => b.value - a.value);
  const actions: string[] = [];
  const timeline: TeamDamageResult["timeline"] = [];
  const buffs: TeamDamageResult["buffs"] = [];
  if (sample) {
    if (!Array.isArray(sample.logs) || !Array.isArray(sample.character_details) ||
        sample.character_details.length !== names.size || !sample.character_details.every((row, index) => object(row)?.name === rotation.characterKeys[index])) throw missing;
    const interval = Math.max(1, Math.ceil(duration / 90));
    const bySecond = new Map<number, { actions: string[]; damage: Map<string, number>; buffs: Set<string> }>();
    for (const raw of sample.logs) {
      const log = object(raw);
      const detail = object(log?.logs);
      const frame = numeric(log?.frame);
      if (!log || !detail || frame === undefined || !["action", "damage", "status"].includes(text(log.event))) continue;
      const second = Math.floor(frame / (60 * interval)) * interval;
      const entry = bySecond.get(second) ?? { actions: [], damage: new Map<string, number>(), buffs: new Set<string>() };
      const who = names.get(rotation.characterKeys[Number(log.char_index)]!);
      if (log.event === "action" && who) {
        const action = actionNames[text(detail.action)];
        if (action) {
          const line = `${who} ${action}`;
          if (!entry.actions.includes(line)) entry.actions.push(line);
          if (actions.length < 18 && actions.at(-1) !== line) actions.push(line);
        }
      }
      if (detail && log.event === "damage" && who) {
        const value = numeric(detail.damage);
        if (value) entry.damage.set(who, (entry.damage.get(who) ?? 0) + value);
      }
      if (detail && log.event === "status" && typeof detail.key === "string" && text(log.msg).includes("added") &&
          !/(?:icd|cooldown|_expiry)/iu.test(detail.key)) entry.buffs.add(detail.key);
      bySecond.set(second, entry);
    }
    for (const [second, log] of detail ? bySecond : []) {
      if (log.actions.length || log.damage.size) timeline.push({
        time: interval === 1 ? String(second) : `${second}–${second + interval}`, action: log.actions.join(" / ") || "持续伤害",
        values: [...log.damage].map(([name, value]) => `${name} ${damageFormat.format(value)}`).join(" / "),
      });
      if (log.buffs.size) buffs.push({ time: interval === 1 ? String(second) : `${second}–${second + interval}`, name: "生效增益", detail: [...log.buffs].join(" / ") });
    }
  }
  const sampleSeed = typeof sample?.seed === "string" && /^\d{1,20}$/u.test(sample.seed) ? sample.seed : undefined;
  return {
    sampleSeed, source: "gcsim", rotation: rotation.name, iterations, total: Math.round(total), seconds: Number(duration.toFixed(2)),
    dps: damageFormat.format(rate), rank: "", contributions, actions, timeline, buffs,
  };
}

export function createGcsim(directory = Bun.env.LOTUS_GENSHIN_GCSIM_DIR?.trim() || runtimeDirectory) {
  let active = 0;
  let memo: { path: string; data: ReturnType<typeof readRuntime> } | undefined;
  async function readRuntime(path: string) {
    await verifyRuntime(path);
    const catalog = await jsonFile(join(path, "catalog.json")) as unknown as SimCatalog;
    const scripts = join(path, "rotations");
    const files = await readdir(scripts);
    if (files.length > 256) throw missing;
    const rotations = await Promise.all(files.filter(file => file.endsWith(".txt")).sort(
      (a, b) => Number(a.includes("-")) - Number(b.includes("-")) || a.localeCompare(b, "zh-CN"),
    ).map(async file => {
      const script = join(scripts, file);
      return readRotation(file.slice(0, -4), await readFile(script, "utf8"), catalog);
    }));
    return { path, catalog, rotations: rotations.filter((row): row is Rotation => !!row) };
  }

  return async (avatars: readonly PanelAvatar[], theme: PanelTheme, detail: boolean, signal: AbortSignal) => {
    signal.throwIfAborted();
    const path = await selectedRuntime(directory);
    if (!path) return;
    if (memo?.path !== path) memo = { path, data: readRuntime(path) };
    const cached = memo;
    let runtime;
    try { runtime = await cached.data; }
    catch (error) {
      if (memo === cached) memo = undefined;
      throw error;
    }
    const { catalog, rotations } = runtime;
    const names = new Map(avatars.map(avatar => [catalog.characters[avatar.id] ?? "", avatar.name]));
    const rotation = rotations.find(({ characterKeys }) =>
      characterKeys.length === avatars.length && characterKeys.every(key => names.has(key)));
    if (!rotation) return;
    const config = createSimulationConfig(rotation, avatars, catalog, theme);
    if (!config) return;
    if (active >= processLimit) throw new TypeError("原神本地队伍模拟繁忙，请稍后重试。");
    active++;
    let work: string | undefined;
    let child: { kill(signal: "SIGKILL"): void; exited: Promise<number> } | undefined;
    const deadline = AbortSignal.any([AbortSignal.timeout(30_000), signal]);
    function abort() { child?.kill("SIGKILL"); }
    try {
      work = await mkdtemp(join(tmpdir(), "lotus-gcsim-"));
      const input = join(work, "build.gcs");
      const summary = join(work, "summary.json");
      const sample = join(work, "sample.json");
      await writeFile(input, config, { mode: 0o600 });
      deadline.throwIfAborted();
      const binary = join(runtime.path, runtimeExecutable);
      child = Bun.spawn([binary, "-c", input, "-out", summary, "-sample", sample], {
        stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: work, env: { GOMAXPROCS: "2", GOMEMLIMIT: "256MiB" },
      });
      deadline.addEventListener("abort", abort, { once: true });
      const success = await child.exited === 0;
      signal.throwIfAborted();
      if (deadline.aborted) throw new TypeError("gcsim 模拟超时，请检查队伍配装或稍后重试。");
      if (!success) throw new TypeError("gcsim 无法用当前档案的配装完成此队伍模拟。");
      return simulationResult(await jsonFile(summary), await jsonFile(sample), rotation, names, detail);
    } finally {
      deadline.removeEventListener("abort", abort);
      if (work) await rm(work, { recursive: true, force: true });
      active--;
    }
  };
}
