import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { damageSettings } from "./config.ts";
import { createDamageSettingsCommand, matchDamageSettingsCommand } from "./settings-command.ts";

const owner = { user_id: 42, message_type: "group", isBotMaster: (id: number) => id === 42 };
const check = (message: string) => matchDamageSettingsCommand(message)!;
const source = `# 原神配置注释\nengineMode: auto\nextra:\n  keep: true\nlolomicalc: true # 旧字段\ntemplateteam: ${damageSettings.templateteam}\nconscompare: ${damageSettings.conscompare}\n`;

test("原神算伤保留标配与命座开关，并使用原神名字区分计算入口", () => {
  expect(check("#原神计算启用")).toEqual({ key: "lolomicalc", enabled: true });
  expect(check("#原神伤害规则关闭")).toEqual({ key: "lolomicalc", enabled: false });
  expect(check("#标配计算停用")).toEqual({ key: "templateteam", enabled: false });
  expect(check("#原神命座对比开启")).toEqual({ key: "conscompare", enabled: true });
  for (const raw of ["#计算关闭", "#星铁命座对比关闭", "#绝区零标配计算开启", "#洛洛米计算启用", "#原神命座对比开启 档案2"]) {
    expect(matchDamageSettingsCommand(raw)).toBeUndefined();
  }
});

test("当前机器人主人并发修改只保存原神三个值，运行规则等待重启", async () => {
  const work = await mkdtemp(join(tmpdir(), "lotus-genshin-damage-settings-"));
  const cfg = join(work, "config");
  const file = join(cfg, "genshin-damage.yaml");
  await mkdir(cfg);
  await writeFile(file, source, { mode: 0o640 });
  try {
    const running = { ...damageSettings };
    const run = createDamageSettingsCommand(new AbortController().signal, pathToFileURL(work + sep), "");
    await expect(run(check("#命座对比关闭"), { ...owner, user_id: 51 })).resolves.toContain("只有当前机器人主人");
    await expect(run(check("#标配计算启用"), { ...owner, isDelegated: true })).resolves.toContain("只有当前机器人主人");
    expect(await readFile(file, "utf8")).toBe(source);
    const team = !running.templateteam, compare = !running.conscompare;
    const teamCommand = check(`#标配计算${team ? "启用" : "关闭"}`);
    const comparisonCommand = check(`#命座对比${compare ? "启用" : "关闭"}`);
    const updated = await Promise.all([run(teamCommand, owner), run(comparisonCommand, owner)]);
    expect(updated).toEqual([expect.stringContaining("重启后生效"), expect.stringContaining("重启后生效")]);
    const text = await readFile(file, "utf8");
    expect(text).toContain("# 原神配置注释");
    expect(text).toContain("# 旧字段");
    expect(Bun.YAML.parse(text)).toEqual({
      engineMode: "auto", extra: { keep: true }, lolomicalc: true, templateteam: team, conscompare: compare,
    });
    expect((await stat(file)).mode & 0o777).toBe(0o640);
    expect(damageSettings).toEqual(running);
    expect(await run(teamCommand, owner)).toContain("重启后生效");
    expect(await readFile(file, "utf8")).toBe(text);
    expect((await readdir(cfg)).some(name => name.startsWith(".lotus-genshin-damage-settings-"))).toBe(false);
  } finally { await rm(work, { force: true, recursive: true }); }
});

test("提交前主人权限变化或 YAML 无效时保留配置原字节", async () => {
  const work = await mkdtemp(join(tmpdir(), "lotus-genshin-damage-revoke-"));
  const file = join(work, "managed-original.yaml");
  await writeFile(file, source);
  try {
    const run = createDamageSettingsCommand(new AbortController().signal, pathToFileURL(work + sep), file);
    let permissionChecks = 0;
    const changing = { ...owner, isBotMaster: () => ++permissionChecks < 3 };
    expect(await run(check("#原神计算关闭"), changing)).toContain("只有当前机器人主人");
    expect(permissionChecks).toBeGreaterThanOrEqual(3);
    expect(await readFile(file, "utf8")).toBe(source);
    expect((await readdir(work)).some(name => name.startsWith(".lotus-genshin-damage-settings-"))).toBe(false);

    const malformed = "engineMode: invalid\nconscompare: true\n";
    await writeFile(file, malformed);
    expect(await run(check("#命座对比关闭"), owner)).toContain("无法保存");
    expect(await readFile(file, "utf8")).toBe(malformed);
  } finally { await rm(work, { force: true, recursive: true }); }
});

test("首次保存可创建自己的配置目录，已取消生命周期时不创建文件", async () => {
  const work = await mkdtemp(join(tmpdir(), "lotus-genshin-damage-first-"));
  const file = join(work, "config", "genshin-damage.yaml");
  const controller = new AbortController();
  const root = pathToFileURL(work + sep);
  try {
    const run = createDamageSettingsCommand(controller.signal, root, "");
    controller.abort();
    expect(await run(check("#标配计算开启"), owner)).toBeUndefined();
    expect(await readdir(work)).toEqual([]);
    const active = createDamageSettingsCommand(new AbortController().signal, root, "");
    expect(await active(check("#标配计算启用"), owner)).toContain("保存");
    expect(Bun.YAML.parse(await readFile(file, "utf8"))).toEqual({ templateteam: true });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  } finally { await rm(work, { force: true, recursive: true }); }
});
