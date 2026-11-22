import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGenshinPanelQuery, matchLegacyGenshinExtremePanel } from "./panel.ts";
import type { PanelTheme } from "./theme.ts";

test("旧极限面板指令识别原神前缀和原版面板别名", () => {
  expect(matchLegacyGenshinExtremePanel("#极限胡桃")).toBe("胡桃");
  expect(matchLegacyGenshinExtremePanel("#原神 群内排行极限 水神面版")).toBe("水神");
  expect(matchLegacyGenshinExtremePanel("#极限绫华详情")).toBe("绫华");
  expect(matchLegacyGenshinExtremePanel("#星铁极限希儿")).toBeUndefined();
  expect(matchLegacyGenshinExtremePanel("*极限希儿")).toBeUndefined();
  expect(matchLegacyGenshinExtremePanel("#极限")).toBeUndefined();
});

test("本人私聊和群聊均只读旧固定示例并按现有面板绘制", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-genshin-extreme-"));
  const file = join(root, "100000000.json");
  const bundled = join(root, "gs.json");
  const png = Uint8Array.of(137, 80, 78, 71);
  const accesses: string[] = [];
  const fail = async (): Promise<never> => {
    accesses.push("unexpected access to a personal profile or write path");
    throw new Error(accesses.at(-1));
  };
  const controller = new AbortController();
  const assets: PanelTheme = {
    characters: {}, artifacts: new Map(), artifactSets: new Map(), customAliases: new Map([["胡小桃", "胡桃"]]),
    async picture() { return; },
  };
  const renders: (string | number)[][] = [];
  const query = createGenshinPanelQuery({ requestContext: fail, savedRole: fail },
    { fetchGenshinPanel: fail }, fail, controller.signal, {
      archiveDirectory: join(root, "personal"), legacyDirectory: root, extremePanelFile: bundled, theme: async () => assets,
      render: { list: fail, async detail(snapshot, avatar) {
        renders.push([snapshot.uid, avatar.name, avatar._source, avatar.level]);
        expect(avatar._time).toBe(1_700_000_000_000);
        return { png };
      } },
    });
  try {
    expect(await query("#极限胡桃", {})).toBe("尚未准备原神极限示例数据。");
    const source = JSON.stringify({ uid: "100000000", avatars: {
      10000046: { id: 10000046, name: "胡桃", level: 90, elem: "pyro", _source: "enka", _time: 1_700_000_000 },
    } });
    await writeFile(file, source);
    expect(await query("#极限胡小桃", { message_type: "private", user_id: 123 })).toEqual({ type: "image", file: png });
    expect(await query("#原神极限胡桃面板", { message_type: "group", group_id: 456 })).toEqual({ type: "image", file: png });
    expect(await query("#极限行秋", {})).toBe("暂无「行秋」的原神极限示例。");
    const publicSource = JSON.stringify({ uid: "100000000", avatars: {
      10000025: { id: 10000025, name: "行秋", level: 90, elem: "hydro", _source: "enka", _time: 1_700_000_000_000 },
      10000046: { id: 10000046, name: "胡桃", level: 80, elem: "pyro", _source: "enka" },
    } });
    await writeFile(bundled, publicSource);
    expect(await query("#极限胡桃", { inlineImageByteLimit: 2 })).toBe("极限示例 · 胡桃 · Lv.90");
    expect(await query("#极限行秋", {})).toEqual({ type: "image", file: png });
    expect(renders).toEqual([
      ...Array(3).fill(["100000000", "胡桃", "极限示例", 90]),
      ["100000000", "行秋", "公开极限示例", 90],
    ]);
    expect(accesses).toEqual([]);
    expect(await readFile(file, "utf8")).toBe(source);
    expect(await readFile(bundled, "utf8")).toBe(publicSource);
    controller.abort();
    expect(await query("#极限胡桃", {})).toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
