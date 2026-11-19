import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProfileRequestContext } from "@lotus-yunzai/account";
import { buildEquipmentChange } from "./equipment-change.ts";
import { matchGenshinPanel, type PanelAvatar, type PanelArtifact } from "./model.ts";
import { createGenshinPanelQuery } from "./panel.ts";
import type { PanelTheme } from "./theme.ts";

const uid = "100123456";
const piece = (name: string): PanelArtifact => ({ name, level: 20, star: 5, attrIds: ["501224"], set: "黄金剧团" });
const furina: PanelAvatar = { id: 10000089, name: "芙宁娜", elem: "hydro", level: 90, _source: "enka", talent: { e: 9 },
  weapon: { name: "静水流涌之辉", affix: 1 }, artis: { 1: piece("金曲"), 4: piece("水杯"), 5: piece("王冠") } };
const ayaka: PanelAvatar = { id: 10000002, name: "神里绫华", elem: "cryo", level: 90, _source: "enka", talent: { e: 10 },
  weapon: { name: "雾切之回光", level: 90, promote: 6, affix: 3 }, artis: { 4: piece("冰杯"), 5: piece("冰冠") } };
const theme: PanelTheme = {
  characters: { [furina.id]: { weapon: "sword" }, [ayaka.id]: { weapon: "sword", abbr: "绫华" } },
  artifacts: new Map(), artifactSets: new Map(),
  async metadata(_meta, kind, type, name) { return kind === "weapon" && type === "sword" ? { name } : {}; },
  async picture() { return undefined; },
};

test("旧同源加号换装保留序号、档案、武器和五个圣遗物部位别名", () => {
  expect(matchGenshinPanel("#芙芙伤害2换绫华武器+杯子+礼冠 档案2")).toMatchObject({
    type: "change", mode: "damage", damageRow: 2, profileId: 2,
    equipmentChange: { donor: "绫华", slot: "weapon", extraSlots: ["4", "5"] },
  });
  expect(matchGenshinPanel(`#芙芙换绫华${uid}花+死之羽+表+空之杯+帽+武器`)?.equipmentChange)
    .toMatchObject({ donorUid: uid, slot: "1", extraSlots: ["2", "3", "4", "5", "weapon"] });
  for (const message of ["#芙芙换绫华杯+空之杯", "#芙芙换绫华武器+", "#芙芙换绫华杯+刻晴头", "#芙芙换绫华杯换刻晴头"]) {
    expect(matchGenshinPanel(message)).toBeUndefined();
  }
});

test("组合只克隆完整同档证实的装备，缺一件、种类错、外 UID 或共享来源时整组不返回", async () => {
  const snapshot = { uid, avatars: { [furina.id]: furina, [ayaka.id]: ayaka } };
  const before = JSON.stringify(snapshot);
  const packet = matchGenshinPanel("#芙芙换绫华武器+杯子+头")!.equipmentChange!;
  const result = await buildEquipmentChange(snapshot, furina, packet, theme);
  expect(result).toMatchObject({ equipped: "雾切之回光、冰杯、冰冠", avatar: { _source: "change", weapon: ayaka.weapon,
    artis: { 1: furina.artis[1], 4: ayaka.artis[4], 5: ayaka.artis[5] } } });
  if (!("avatar" in result)) throw Error("组合未换装");
  expect(result.avatar.weapon).not.toBe(ayaka.weapon);
  expect(result.avatar.artis[4]).not.toBe(ayaka.artis[4]);
  const noFlower = matchGenshinPanel("#芙芙换绫华武器+花")!.equipmentChange!;
  expect(await buildEquipmentChange(snapshot, furina, noFlower, theme)).toMatchObject({ message: expect.stringContaining("指定位置") });
  const foreign = matchGenshinPanel("#芙芙换绫华100654321杯+头")!.equipmentChange!;
  expect(await buildEquipmentChange(snapshot, furina, foreign, theme)).toMatchObject({ message: expect.stringContaining("所选档案") });
  const incompatible = { ...theme, characters: { ...theme.characters, [ayaka.id]: { weapon: "polearm", abbr: "绫华" } } };
  expect(await buildEquipmentChange(snapshot, furina, packet, incompatible)).toMatchObject({ message: expect.stringContaining("武器种类") });
  const shared = { ...snapshot, avatars: { ...snapshot.avatars, [ayaka.id]: { ...ayaka, _source: "share" } } };
  expect(await buildEquipmentChange(shared, furina, packet, theme)).toMatchObject({ message: expect.stringContaining("没有") });
  expect(JSON.stringify(snapshot)).toBe(before);
});

test("组合渲染期间换绑时不发旧角色卡也不生成群榜、面板或请求", async () => {
  const legacyDirectory = await mkdtemp(join(tmpdir(), "lotus-genshin-bundle-"));
  const archiveDirectory = join(legacyDirectory, "archive");
  const file = join(legacyDirectory, uid + ".json");
  const original = JSON.stringify({ uid, avatars: { [furina.id]: furina, [ayaka.id]: ayaka } });
  await writeFile(file, original);
  let revision = "original", renders = 0, observations = 0, requests = 0;
  const role = { uid, region: "cn_gf01", chosen: true, gameBiz: "hk4e_cn", nickname: "" };
  try {
    const query = createGenshinPanelQuery({
      async savedRole() { return role; },
      async requestContext(qq, profileId, game) { return { qq, profileId, game, role, revision } as ProfileRequestContext; },
    }, { async fetchGenshinPanel() { requests++; throw Error("unexpected request"); } },
    async () => ({ close() {} }), new AbortController().signal, {
      archiveDirectory, legacyDirectory, theme: async () => theme,
      groupRank: { allows() { return true; }, async observe() { observations++; } },
      render: { async list() { throw Error("unexpected list"); }, async detail(_snapshot, preview) {
        renders++;
        expect(preview.weapon?.name).toBe("雾切之回光");
        expect(preview.artis[4]?.name).toBe("冰杯");
        revision = "changed";
        return { png: new Uint8Array([1]) };
      } },
    });
    expect(await query("#芙芙换绫华武器+杯子+头 档案2", { user_id: 42, group_id: 77 })).toContain("档案已变化");
    expect([renders, observations, requests]).toEqual([1, 0, 0]);
    await expect(stat(archiveDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(file, "utf8")).toBe(original);
  } finally {
    await rm(legacyDirectory, { recursive: true, force: true });
  }
});
