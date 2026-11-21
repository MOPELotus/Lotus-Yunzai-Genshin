import { expect, test } from "bun:test";
import { readPanelPreset, matchPanelPreset } from "./lolomi/presets.ts";
import { createGenshinPanelQuery } from "./panel.ts";
import type { PanelTheme } from "./theme.ts";

const theme: PanelTheme = { characters: {}, artifacts: new Map(), artifactSets: new Map(), async picture() { return; } };

test("旧四种缩写定位各自公开预设和原角色别名", async () => {
  for (const [code, size] of [["jx", 121], ["hb", 43], ["fz", 34], ["by", 121]] as const) {
    const snapshot = await readPanelPreset(code, theme);
    expect(Object.keys(snapshot.avatars)).toHaveLength(size);
  }
  expect(matchPanelPreset("#雷神by面板")?.command.name).toBe("雷电将军");
  expect(matchPanelPreset("#jx绫华武器")?.command.mode).toBe("damage");
  expect(matchPanelPreset("#胡桃hb伤害2")?.command.damageRow).toBe(2);
  expect(matchPanelPreset("#fz申鹤圣遗物")?.command.mode).toBe("artifacts");
  expect(matchPanelPreset("#绫华换hb甘雨花 档案3")?.command.profileId).toBe(3);
  expect(matchPanelPreset("#绫华换999999998甘雨花 档案3")).toBeUndefined();
  expect(matchPanelPreset("#jx临时计划面板")).toBeUndefined();
  expect(matchPanelPreset("#jx绫华面板 档案3")).toBeUndefined();
});

test("公开预设面板、编号伤害、跨预设换装只读取固定数据", async () => {
  const controller = new AbortController();
  const calls: { uid: string; source: string; name: string; equipped?: string }[] = [];
  const fail = async (): Promise<never> => { throw new Error("unexpected access to a user archive or remote service"); };
  const png = Uint8Array.of(137, 80, 78, 71);
  const query = createGenshinPanelQuery({
    requestContext: fail, savedRole: fail,
  }, { fetchGenshinPanel: fail }, fail, controller.signal, {
    theme: async () => theme,
    render: {
      list: fail,
      async detail(snapshot, avatar, _assets, options) {
        calls.push({ uid: snapshot.uid, source: avatar._source, name: avatar.name, equipped: options?.change?.equipped });
        return { png };
      },
      async damage(snapshot, avatar, _assets, model) {
        expect(model.selected).toBe(1);
        expect(model.rows[1]?.average).toBeGreaterThan(0);
        calls.push({ uid: snapshot.uid, source: avatar._source, name: avatar.name });
        return { png };
      },
    },
  });
  expect(await query("#jx绫华", {})).toEqual({ type: "image", file: png });
  expect(await query("#by水神圣遗物", {})).toEqual({ type: "image", file: png });
  expect(await query("#hb绫华伤害2", {})).toEqual({ type: "image", file: png });
  expect(await query("#fz绫华", {})).toContain("暂无");
  expect(await query("#jx绫华换hb甘雨花", {})).toEqual({ type: "image", file: png });
  expect(await query("#jx绫华换123456789甘雨花", {})).toContain("必须属于本次所选档案");
  expect(calls).toMatchObject([
    { uid: "999999999", source: "极限面板", name: "神里绫华" },
    { uid: "999999996", source: "毕业面板", name: "芙宁娜" },
    { uid: "999999998", source: "核爆面板", name: "神里绫华" },
    { uid: "999999999", source: "change", name: "神里绫华", equipped: expect.any(String) },
  ]);
  controller.abort();
  expect(await query("#jx绫华", {})).toBeUndefined();
});
