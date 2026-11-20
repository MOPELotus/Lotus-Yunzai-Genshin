import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProfileRequestContext } from "@lotus-yunzai/account";
import { matchGenshinPanel, type PanelAvatar } from "./model.ts";
import { createGenshinPanelQuery } from "./panel.ts";
import type { PanelTheme } from "./theme.ts";

const uid = "100123456";
const avatar: PanelAvatar = { id: 10000046, name: "胡桃", elem: "pyro", level: 90, promote: 6, cons: 0, _source: "enka",
  talent: { a: 1, e: 1, q: 1 }, weapon: { name: "新手长枪", level: 70, promote: 4, affix: 1 },
  artis: { 1: { name: "冒险家之花", set: "冒险家", level: 20, star: 5, mainId: 14001, attrIds: [] } } };
const character = { name: avatar.name, weapon: "polearm",
  attr: { keys: ["hp", "atk", "def", "cdmg"], details: { "80+": [9000, 190, 500, 10], 90: [10_000, 200, 550, 20] } },
  talentData: { a: { 重击伤害: [270] }, e: { 攻击力提高: [5] }, q: { 低血量时技能伤害: [350] } } };
const theme: PanelTheme = { characters: { [avatar.id]: character }, artifacts: new Map(), artifactSets: new Map(),
  async metadata(_game, kind) {
    return kind === "character" ? character : { name: "新手长枪", attr: { atk: { "60+": 230, 70: 250 } } };
  },
  async picture() { return undefined; } };

test("旧武器 1–7 选伤害序号，显式档案号和旧长 UID 仍分开", () => {
  expect(matchGenshinPanel("#胡桃武器2")).toMatchObject({ mode: "damage", knownCharacterOnly: true, damageRow: 2, profileId: 1 });
  expect(matchGenshinPanel("#原神胡桃武器7 档案2")).toMatchObject({ mode: "damage", damageRow: 7, profileId: 2 });
  expect(matchGenshinPanel(`#胡桃武器2 ${uid}`)).toMatchObject({ mode: "damage", damageRow: 2, uid });
  expect(matchGenshinPanel(`#胡桃武器${uid}`)).toMatchObject({ mode: "weapon", uid });
  expect(matchGenshinPanel("#胡桃武器 档案2")).toMatchObject({ mode: "weapon", profileId: 2 });
  expect(matchGenshinPanel("#胡桃武器20")).toMatchObject({ mode: "weapon", profileId: 20 });
  expect(matchGenshinPanel("#星铁胡桃武器2")).toBeUndefined();
  expect(matchGenshinPanel("#胡桃武器2 档案256")).toBeUndefined();
});

test("旧前置 UID 单独占字段，保留原详情、伤害数字及档案选择", () => {
  expect(matchGenshinPanel(`#${uid}胡桃伤害2 档案2`)).toMatchObject({
    uid, name: "胡桃", mode: "damage", damageRow: 2, profileId: 2, knownCharacterOnly: true,
  });
  expect(matchGenshinPanel("#原神1801234567 芙芙详情 档案2")).toMatchObject({
    uid: "1801234567", name: "芙芙", mode: "profile", profileId: 2,
  });
  expect(matchGenshinPanel(`#原神${uid} 胡桃武器2`)).toMatchObject({ uid, name: "胡桃", mode: "damage", damageRow: 2 });
  expect(matchGenshinPanel(`#${uid}胡桃圣遗物`)).toMatchObject({ uid, name: "胡桃", mode: "artifacts" });
  expect(matchGenshinPanel(`#${uid}`)).toBeUndefined();
  expect(matchGenshinPanel(`#${uid}胡桃伤害2 ${uid}`)).toBeUndefined();
  expect(matchGenshinPanel(`#${uid}胡桃详情 ${uid}`)).toBeUndefined();
  expect(matchGenshinPanel(`#${uid}星铁胡桃伤害2`)).toBeUndefined();
});

test("编号武器命令实际复用同档伤害矩阵，裸命令仍发武器资料", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-genshin-weapon-damage-"));
  const archiveDirectory = join(directory, "archive");
  const file = join(directory, uid + ".json");
  const original = JSON.stringify({ uid, avatars: { [avatar.id]: avatar } });
  await writeFile(file, original);
  const role = { uid, region: "cn_gf01", nickname: "", gameBiz: "hk4e_cn", chosen: true };
  const damageCard = Uint8Array.of(1), weaponCard = Uint8Array.of(2);
  const selected: number[] = [], detail: number[] = [], reads: number[] = [];
  try {
    const query = createGenshinPanelQuery({
      async savedRole() { return role; },
      async requestContext(qq, profileId, game) {
        reads.push(profileId);
        return { qq, profileId, game, role, revision: "current" } as ProfileRequestContext;
      },
    }, { async fetchGenshinPanel() { throw Error("unexpected network request"); } },
    async () => ({ close() {} }), new AbortController().signal, {
      archiveDirectory, legacyDirectory: directory, theme: async () => theme,
      render: { async list() { throw Error("unexpected list"); }, async detail(_snapshot, _actor, _theme, options) {
        expect(options?.pane).toBe("weapon");
        detail.push(options!.profileId!);
        return { png: weaponCard };
      }, async damage(_snapshot, _actor, _theme, model, options) {
        if (!("selected" in model)) throw Error("no numerical damage");
        selected.push(model.selected);
        expect(options?.profileId).toBe(2);
        expect(model.comparison?.cells[0]?.[1]?.average).toBeGreaterThan(0);
        return { png: damageCard };
      } },
    });
    const message = { user_id: 42 };
    expect(await query("#虚构角色武器2 档案2", message)).toBeUndefined();
    expect(await query(`#${uid}虚构角色伤害2 档案2`, message)).toBeUndefined();
    expect(reads).toEqual([]);
    expect(await query("#胡桃武器2 100999999", message)).toContain("当前档案绑定");
    expect(await query("#100999999胡桃伤害2 档案2", message)).toContain("当前档案绑定");
    expect(await query("#胡桃武器2 档案2", message)).toEqual({ type: "image", file: damageCard });
    expect(await query("#胡桃伤害2 档案2", message)).toEqual({ type: "image", file: damageCard });
    expect(await query(`#${uid}胡桃武器2 档案2`, message)).toEqual({ type: "image", file: damageCard });
    expect(await query(`#${uid}胡桃伤害2 档案2`, message)).toEqual({ type: "image", file: damageCard });
    expect(await query("#胡桃武器 档案2", message)).toEqual({ type: "image", file: weaponCard });
    expect(await query(`#${uid}胡桃武器 档案2`, message)).toEqual({ type: "image", file: weaponCard });
    expect(await query("#胡桃武器7 档案2", message)).toContain("只支持3种");
    expect([selected, detail]).toEqual([[1, 1, 1, 1], [2, 2]]);
    await expect(stat(archiveDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(file, "utf8")).toBe(original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
