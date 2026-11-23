import type { CommandReply } from "../../lib/commands.ts";
import commissionData from "./commissions/thisee-xhh/NPCwt.json";

const explicitCommand = /^#(?:原神\s*)?(?:每日委托|查委托|委托查询|委托)\s*/u;
const knownPunctuation = /[#＃？?。,.，·!！—《》…「」『』、]/gu;
const videoSource = /^https:\/\/b23\.tv\/(BV[1-9A-Za-z]{10}|av[1-9]\d{0,17})$/u;

function commissionKey(value: string): string {
  return value.replace(knownPunctuation, "").trim();
}

const commissions = new Map(commissionData.flatMap(record =>
  "banben" in record ? [[commissionKey(record.name), record] as const] : [],
));

export function matchGenshinCommission(message: string): CommandReply | undefined {
  if (message.length > 128) return;
  const input = message.trim().replace(/^＃/u, "#");
  if (/^#(?:星铁|绝区零)/u.test(input)) return;
  const explicit = explicitCommand.exec(input);
  const query = explicit ? input.slice(explicit[0].length) : input.replace(/^#原神\s*/u, "");
  const key = commissionKey(query);
  const record = commissions.get(key);
  if (!record) {
    if (!explicit) return;
    return key ? "未查到该委托，请核对游戏内的完整名称。" : "请发送 #委托 委托名称，例如 #委托 奇药庐中来。";
  }

  if (!record.miaosu) return `委托名：${record.name}\n地区：${record.diqu}\n成就：${record.cj}`;
  const video = videoSource.exec(record.yueyue)?.[1];
  const nodes = [
    `委托名：${record.name}\n地区：${record.diqu}\n成就：${record.cj}`,
    `重点描述\n${record.miaosu}`,
  ];
  if (video) nodes.push(`影月月视频指引\nhttps://www.bilibili.com/video/${video}`);
  return { type: "forward", nodes, senderName: "原神每日委托" };
}
