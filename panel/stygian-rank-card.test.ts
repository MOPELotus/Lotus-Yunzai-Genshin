import { expect, test } from "bun:test";
import { renderStygianRankCard, stygianRankDisplayUid, type StygianRankCard } from "./stygian-rank-card.ts";
import type { PanelTheme } from "./theme.ts";

test("幽境群榜默认遮罩原始 UID，显式允许时返回完整 UID", () => {
  expect(stygianRankDisplayUid("100000123")).toBe("100***123");
  expect(stygianRankDisplayUid("9000000123")).toBe("900****123");
  expect(stygianRankDisplayUid("100000123", false)).toBe("100000123");
  expect(stygianRankDisplayUid(undefined)).toBe("");
  expect(stygianRankDisplayUid("100<12345", false)).toBe("");
});

const gpu = Bun.env.LOTUS_TEST_GPU === "1";
test.skipIf(!gpu)("幽境群榜按来源列宽输出四倍图，适应消息字节限制回退为二倍", async () => {
  const theme: PanelTheme = { characters: {}, artifacts: new Map(), artifactSets: new Map(), picture: async () => undefined };
  const model: StygianRankCard = { version: "6.6", period: { start: "2026-05-20", end: "2026-07-01" },
    rows: [
      { nickname: "本地样本", uid: "100000123", difficulty: 6, seconds: 146, ark: { rank: 31, total: 5238 } },
      { nickname: "测试样本", uid: "9000000123", difficulty: 5, seconds: 201 },
    ] };
  const doubleSite = { ...model, sites: { ark: "ok", akasha: "unverified" } } as const;
  const high = await renderStygianRankCard(doubleSite, theme, { mode: "gpu" });
  expect(high.engine.renderer).toBe("GPU");
  expect(high.engine.device).toMatch(/NVIDIA RTX A4000/iu);
  expect(high.png.readUInt32BE(16)).toBe(4816);
  const lowLimit = await renderStygianRankCard(doubleSite, theme,
    { mode: "gpu", inlineImageByteLimit: high.png.byteLength - 1 });
  expect(lowLimit.png.readUInt32BE(16)).toBe(2408);
  expect(lowLimit.reducedScaleReason).toContain("四倍图");
  const historical = await renderStygianRankCard({ ...model, sites: { ark: "not-requested", akasha: "ok" } }, theme, { mode: "gpu" });
  expect(historical.png.readUInt32BE(16)).toBe(4032);
  const localOnly = await renderStygianRankCard({ ...model, rows: [], sites: { ark: "disabled", akasha: "disabled" } }, theme, { mode: "gpu" });
  expect(localOnly.png.readUInt32BE(16)).toBe(3248);
}, 30_000);
