import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readGenshinGachaSources } from "./gacha-detail-source.ts";
import { buildGenshinGachaDetail, genshinGachaTimestamp } from "./gacha-detail.ts";
import { buildGenshinGachaVersion } from "./gacha-version.ts";

const uid = "123456789";
const theme = [
  { version: "1.3", half: "上半", from: "2021-02-03 06:00:00", to: "2021-02-17 15:59:59",
    char5: ["魈"], weapon5: ["磐岩结绿", "和璞鸢"] },
  { version: "1.3", half: "中场", from: "2021-02-17 18:00:00", to: "2021-03-02 15:59:59",
    char5: ["刻晴"], weapon5: ["磐岩结绿", "和璞鸢", "狼的末路", "护摩之杖"] },
  { version: "1.3", half: "下半", from: "2021-03-02 18:00:00", to: "2021-03-16 14:59:59",
    char5: ["胡桃"], weapon5: ["狼的末路", "护摩之杖"] },
] as const;

test("原神 1.3 武器池独立分期，角色换池空档也保留可核验的武器结果", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-genshin-weapon-period-"));
  try {
    const directory = join(root, "meta-gs", "info");
    const file = join(directory, "pool.js");
    await mkdir(directory, { recursive: true });
    const save = (data: readonly unknown[]) => writeFile(file,
      `export const poolDetail = ${JSON.stringify(data)};\nexport const mixPoolDetail = [];\n`);
    await save(theme);
    const row = (id: number, pool: 301 | 302, name: string, time: string, isUp?: boolean) => ({
      uid, id: String(id), gacha_type: String(pool), name, rank_type: "5", item_type: pool === 302 ? "武器" : "角色", time,
      ...(isUp === undefined ? {} : { is_up: isUp }),
    });
    const records = {
      301: [row(10, 301, "刻晴", "2021-02-24 10:12:00")],
      302: [
        row(11, 302, "和璞鸢", "2021-02-17 16:12:00"),
        row(12, 302, "狼的末路", "2021-02-20 12:30:00"),
        row(13, 302, "护摩之杖", "2021-02-24 10:11:00"),
        row(14, 302, "和璞鸢", "2021-02-26 10:11:00"),
        row(15, 302, "护摩之杖", "2021-03-05 10:11:00", false),
      ],
    } as const;
    const run = async () => ({ uid, records, face: { name: "旅者" }, ...await readGenshinGachaSources(root, records) });
    const options = await run();
    const detail = buildGenshinGachaDetail({ ...options, pool: 302 })!;
    expect(detail.gacha.fiveLog.map(value => value.isUp)).toEqual([false, false, true, false, true]);
    const grouped = buildGenshinGachaVersion({ ...options, type: "weapon" })!.gacha;
    expect(grouped.versionData.map(row => [row.half, row.from, row.to, row.stats.totalNum, row.stats.upNum])).toEqual([
      ["下半", "21-02-23", "21-03-16", 3, 1],
      ["上半", "21-02-03", "21-02-23", 2, 1],
    ]);
    const combined = buildGenshinGachaVersion(options)!.gacha;
    expect(combined.totalStat).toMatchObject({ totalNum: 6, c5UpNum: 1, w5UpNum: 2, unassignedDraws: 0 });
    expect(combined.versionData.find(row => row.half === "武器池·上半")?.stats.totalNum).toBe(1);
    expect(buildGenshinGachaVersion({ ...options, type: "all" })!.gacha.totalStat).toMatchObject({ totalNum: 6, upNum: 3 });

    const at = (time: string, name: string, pool: 301 | 302 = 302) => options.resolvePool({
      id: "1", star: 5, time, pool, at: genshinGachaTimestamp(time), name, itemType: pool === 302 ? "weapon" : "char",
    });
    expect(at("2021-02-03 06:00:00", "和璞鸢")).toBeUndefined();
    expect(at("2021-02-23 15:59:59", "和璞鸢")?.isUp).toBe(true);
    expect(at("2021-02-23 15:59:59", "狼的末路")?.isUp).toBe(false);
    expect(at("2021-02-23 16:00:00", "和璞鸢")).toBeUndefined();
    expect(at("2021-02-23 17:59:59", "护摩之杖")).toBeUndefined();
    expect(at("2021-02-23 18:00:00", "护摩之杖")?.isUp).toBe(true);
    expect(at("2021-02-23 18:00:00", "和璞鸢")?.isUp).toBe(false);
    expect(at("2021-03-16 14:59:59", "狼的末路")?.isUp).toBe(true);
    expect(at("2021-03-16 15:00:00", "狼的末路")).toEqual({ isNewPool: true });
    expect(at("2021-02-17 18:00:00", "刻晴", 301)).toBeUndefined();
    const boundaryRecords = { 302: [
      row(21, 302, "和璞鸢", "2021-02-23 15:59:59"),
      row(22, 302, "和璞鸢", "2021-02-23 16:00:00"),
      row(23, 302, "护摩之杖", "2021-02-23 17:59:59"),
      row(24, 302, "护摩之杖", "2021-02-23 18:00:00"),
      row(25, 302, "狼的末路", "2021-03-16 14:59:59"),
    ] } as const;
    const boundaryGroups = buildGenshinGachaVersion({ ...options, records: boundaryRecords, type: "weapon" })!.gacha;
    expect(boundaryGroups.versionData.map(row => [row.version, row.half, row.stats.totalNum, row.stats.upNum])).toEqual([
      ["1.3", "下半", 2, 2], ["1.3", "上半", 1, 1], ["未判定期次", "", 2, 0],
    ]);

    await save(theme.map((period, index) => index === 1 ? { ...period, weapon5: ["护摩之杖"] } : period));
    const custom = await run();
    expect(buildGenshinGachaVersion({ ...custom, type: "weapon" })!.gacha.versionData.some(row => row.half === "中场")).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
