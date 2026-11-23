import { expect, test } from "bun:test";
import { readGenshinRankingPanel } from "./custom-rank.ts";

const character = { id: 10000046, name: "胡桃" };
const uid = "12****678";
const raw = { uid: "12@@@@678", name: "hidden", avatars: {
  10000046: { id: 10000046, name: "不能覆盖当前选择", elem: "pyro", level: 90, _source: "enka",
    weapon: { name: "护摩之杖", level: 90, affix: 1 }, talent: { a: 8, e: 9, q: 10 }, artis: {} },
  10000002: { id: 10000002, name: "神里绫华", elem: "cryo", level: 90, _source: "enka" },
} };
const theme = { characters: {}, artifacts: new Map(), artifactSets: new Map() };

test("原神引用榜单只读同遮罩 UID 及确切角色，使用现行 PanelData 结构", () => {
  const panel = readGenshinRankingPanel(raw, uid, character, theme);
  expect(panel?.uid).toBe(uid);
  expect(Object.keys(panel?.avatars ?? {})).toEqual(["10000046"]);
  expect(panel?.avatars[character.id]).toMatchObject({ name: "胡桃", weapon: { name: "护摩之杖", affix: 1 } });
  expect(panel).not.toHaveProperty("name");
  expect(readGenshinRankingPanel({ ...raw, uid: "123456678" }, uid, character, theme)).toBeUndefined();
  expect(readGenshinRankingPanel(raw, "12****679", character, theme)).toBeUndefined();
  expect(readGenshinRankingPanel(raw, uid, { id: 10000089, name: "芙宁娜" }, theme)).toBeUndefined();
  expect(readGenshinRankingPanel({ ...raw, avatars: { [character.id]: raw.avatars[10000002] } }, uid, character, theme))
    .toBeUndefined();
});
