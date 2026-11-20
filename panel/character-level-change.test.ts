import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProfileRequestContext } from "@lotus-yunzai/account";
import { buildCharacterLevelChange } from "./equipment-change.ts";
import { matchCharacterLevelChange, matchCharacterLevelConstellation, matchGenshinPanel, type PanelAvatar } from "./model.ts";
import { createGenshinPanelQuery } from "./panel.ts";
import { panelTalentLevels } from "./talent-levels.ts";
import type { PanelTheme } from "./theme.ts";

const uid = "100123456";
const avatar: PanelAvatar = { id: 10000046, name: "胡桃", elem: "pyro", level: 80, promote: 6, cons: 1,
  talent: { a: 10, e: 9, q: 9 }, _source: "enka", weapon: { name: "护摩之杖", level: 90, promote: 6, affix: 1 }, artis: {} };
const meta = { name: avatar.name, weapon: "polearm", talentCons: { e: 3, q: 5 } };
const theme: PanelTheme = { characters: { [avatar.id]: meta }, artifacts: new Map(), artifactSets: new Map(),
  async picture() { return undefined; } };

test("角色等级沿原区间与命令语序，原命名武器指令照常解析", () => {
  expect(matchCharacterLevelChange(`#UID:${uid}芙芙伤害2换等级 95 档案2`)).toMatchObject({
    name: "芙芙", uid, damageRow: 2, profileId: 2, characterLevelChange: 95,
  });
  for (const [level, command] of [[1, "#胡桃换1级"], [20, "#胡桃换等级:20"], [90, "#胡桃换90级"], [100, "#胡桃换100级"]] as const) {
    expect(matchCharacterLevelChange(command)?.characterLevelChange).toBe(level);
  }
  for (const tail of ["0级", "91级", "96级", "101级", "80级护摩", "90级精1灭辰", "80级换0命"]) {
    expect(matchCharacterLevelChange("#胡桃换" + tail)).toBeUndefined();
  }
  expect(matchCharacterLevelChange("#星铁胡桃换80级")).toBeUndefined();
  expect(matchGenshinPanel("#胡桃换80级护摩")).toMatchObject({ equipmentChange: { level: 80, weaponName: "护摩" } });
});

test("等级和命座两段保留零命、两种顺序和原装，按指定命座重算天赋", () => {
  const start = `#UID:${uid}芙芙伤害2换`;
  const command = matchCharacterLevelConstellation(start + "0命换等级 95 档案2");
  expect(command).toMatchObject({ uid, profileId: 2, damageRow: 2, characterLevelChange: 95, constellationChange: 0 });
  expect(matchCharacterLevelConstellation(start + "等级 95换0命 档案2")).toEqual(command);
  for (const input of ["80级换95级", "0命换六命", "80级换精2武器", "0命换", "91级换六命", "80级换六命换技能999"]) {
    expect(matchCharacterLevelConstellation(start + input)).toBeUndefined();
  }
  const trial = buildCharacterLevelChange(avatar, 80, theme, 6);
  expect(trial).toMatchObject({ avatar: { level: 80, promote: 6, cons: 6, weapon: avatar.weapon, artis: avatar.artis },
    equipped: "Lv.80 → Lv.80、1 命 → 6 命" });
  if (!("avatar" in trial)) throw Error(trial.message);
  expect(panelTalentLevels(trial.avatar, meta).map(talent => talent?.level)).toEqual([10, 12, 12]);
  expect(buildCharacterLevelChange({ ...avatar, cons: undefined }, 80, theme, 0)).toHaveProperty("message");
  expect(avatar.cons).toBe(1);
});

test("同级沿用档案突破，换级按旧边界推导且装备和命座不动", () => {
  const previous = JSON.stringify(avatar);
  const cases = [[1, 0], [20, 0], [21, 1], [70, 4], [80, 6], [81, 6], [90, 6], [95, 7], [100, 7]] as const;
  for (const [level, promote] of cases) {
    expect(buildCharacterLevelChange(avatar, level, theme)).toMatchObject({
      avatar: { level, promote, cons: avatar.cons, talent: avatar.talent, weapon: avatar.weapon, artis: avatar.artis, _source: "change" },
      equipped: `Lv.80 → Lv.${level}`,
    });
  }
  expect(buildCharacterLevelChange({ ...avatar, level: 90 }, 80, theme)).toMatchObject({ avatar: { level: 80, promote: 5 } });
  expect(buildCharacterLevelChange({ ...avatar, _source: "customize" }, 80, theme)).toHaveProperty("message");
  expect(JSON.stringify(avatar)).toBe(previous);
});

test("等级试算依本人当前绑定，渲染中换绑时停止，保留原档与群榜", async () => {
  const legacyDirectory = await mkdtemp(join(tmpdir(), "lotus-genshin-level-"));
  const archiveDirectory = join(legacyDirectory, "archive");
  const file = join(legacyDirectory, uid + ".json");
  const original = JSON.stringify({ uid, avatars: { [avatar.id]: avatar } });
  await writeFile(file, original);
  let revision = "before", renders = 0, records = 0;
  const role = { uid, region: "cn_gf01", nickname: "", gameBiz: "hk4e_cn", chosen: true };
  try {
    const query = createGenshinPanelQuery({
      async savedRole() { return role; },
      async requestContext(qq, profileId, game) { return { qq, profileId, game, role, revision } as ProfileRequestContext; },
    }, { async fetchGenshinPanel() { throw Error("unexpected network request"); } },
    async () => ({ close() {} }), new AbortController().signal, {
      archiveDirectory, legacyDirectory, theme: async () => theme,
      groupRank: { allows() { return true; }, async observe() { records++; } },
      render: { async list() { throw Error("unexpected list"); }, async detail(_snapshot, trial, _theme, options) {
        renders++;
        expect(trial.level).toBe(95);
        expect(trial.promote).toBe(7);
        expect(trial.cons).toBe(0);
        expect(options?.change?.characterLevel).toBe(true);
        expect(options?.change?.equipped).toBe("Lv.80 → Lv.95、1 命 → 0 命");
        expect(options?.change?.reason).toContain("圣遗物词条");
        revision = "after";
        return { png: new Uint8Array([1]) };
      } },
    });
    expect(await query("#未知角色换95级", { user_id: 42 })).toBeUndefined();
    expect(await query("#100999999胡桃换95级 档案2", { user_id: 42 })).toContain("当前档案绑定");
    expect(await query("#胡桃换95级换0命 档案2", { user_id: 42, group_id: 77 })).toContain("档案已变化");
    expect([renders, records]).toEqual([1, 0]);
    await expect(stat(archiveDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(file, "utf8")).toBe(original);
  } finally {
    await rm(legacyDirectory, { recursive: true, force: true });
  }
});
