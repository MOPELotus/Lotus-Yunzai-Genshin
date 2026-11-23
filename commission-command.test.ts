import { expect, test } from "bun:test";
import { createModule } from "./index.ts";
import { matchGenshinCommission } from "./commission-command.ts";
import commissionData from "./commissions/thisee-xhh/NPCwt.json";

test("原神委托按旧全名匹配标点，保留前置链、成就与官方视频地址", () => {
  const result = matchGenshinCommission("#原神每日委托 奇药庐中来");
  expect(result).toMatchObject({
    type: "forward",
    nodes: [
      "委托名：奇药庐中来\n地区：蒙德\n成就：(成就的前置委托)",
      expect.stringContaining("『安娜冒险记』"),
      "影月月视频指引\nhttps://www.bilibili.com/video/BV1Qu4m1c7GH",
    ],
  });
  expect(matchGenshinCommission("奇药庐中来")).toEqual(result);
  expect(matchGenshinCommission("＃此路不通?")).toBe("委托名：此路不通？\n地区：蒙德\n成就：无成就");
  expect(matchGenshinCommission("#小小的远行，常备药")).toBe("委托名：小小的远行·常备药\n地区：璃月\n成就：无成就");
});

test("完整来源逐条查到，普通消息和其它游戏前缀继续交由原路由", () => {
  const entries = commissionData.filter(record => "banben" in record);
  expect(entries).toHaveLength(180);
  for (const entry of entries) expect(matchGenshinCommission(entry.name)).toBeDefined();
  expect(matchGenshinCommission(commissionData[0]!.name)).toBeUndefined();
  expect(matchGenshinCommission("#奇药庐")).toBeUndefined();
  expect(matchGenshinCommission("#星铁奇药庐中来")).toBeUndefined();
  expect(matchGenshinCommission("#绝区零奇药庐中来")).toBeUndefined();
  expect(matchGenshinCommission("#委托")).toContain("#委托 委托名称");
  expect(matchGenshinCommission("#委托 这个委托不存在")).toContain("未查到该委托");
});

test("原神模块在分派权限中声明委托分类并处理实际入口", async () => {
  const module = createModule({
    signal: new AbortController().signal,
    async lockFile() { throw new Error("读取委托不应写档案"); },
  });
  const normalizedMessage = "#委托 奇药庐中来";
  const context = { normalizedMessage, reply() {} };
  expect(await module.fallbackFeatures(context)).toEqual(["[genshin] 委托查询"]);
  expect(await module.fallback(normalizedMessage, context)).toEqual(matchGenshinCommission(normalizedMessage));
  expect(await module.fallbackFeatures({ ...context, normalizedMessage: "#奇药庐" })).toEqual([]);
});
