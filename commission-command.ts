import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
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
    return key ? $t("commission-command.text_39a2c26704") : $t("commission-command.text_af99e48e9c");
  }

  if (!record.miaosu) return $t("commission-command.text_3cb24c1689", { "name": record.name, "diqu": record.diqu, "cj": record.cj });
  const video = videoSource.exec(record.yueyue)?.[1];
  const nodes = [
    $t("commission-command.text_3cb24c1689", { "name": record.name, "diqu": record.diqu, "cj": record.cj }),
    $t("commission-command.text_7985e74c7f", { "miaosu": record.miaosu }),
  ];
  if (video) nodes.push($t("commission-command.text_d8b0f450d5", { "video": video }));
  return { type: "forward", nodes, senderName: $t("commission-command.text_7968583cad") };
}
