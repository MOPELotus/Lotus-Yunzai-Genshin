import { expect, test } from "bun:test";
import { forGameCommandSender, withGameCommandProfiles } from "@lotus-yunzai/account";
import { matchGrowthCommand } from "../grow/model.ts";
import { matchGenshinMonthly } from "../monthly-command.ts";
import { matchGenshinStatistics } from "../monthly-statistics-command.ts";
import { matchGenshinPayLog } from "../pay-log-command.ts";
import { matchGenshinAbyssTeam } from "./abyss-team-command.ts";
import { matchGenshinAvatarCard } from "./avatar-card.ts";
import { matchGenshinPanel, matchGenshinPanelDiscard, matchTalentChange } from "./model.ts";
import { matchPersonalChallenge } from "./personal-challenge.ts";
import { matchPersonalHardChallenge } from "./personal-hard-challenge.ts";
import { matchPersonalRecord } from "./personal-record.ts";
import { matchSevenSaintsDecks } from "./seven-saints-decks.ts";
import { matchGenshinShowcase } from "./showcase-command.ts";
import { matchStygianConsentCommand } from "./stygian-consent.ts";
import { matchGenshinTarotCards } from "./tarot-cards.ts";
import { parseTeamDamage } from "./team-damage-command.ts";
import { matchWeaponList } from "./weapon-list.ts";

test("原神聊天入口使用当前用户的默认档，显式档号优先", () => {
  const pairs = [
    [matchGenshinPanel, "#更新面板", "#更新面板1"],
    [matchGenshinPanel, "#面板练度统计", "#面板练度统计 档案1"],
    [matchGenshinPanel, "#胡桃伤害2", "#胡桃伤害2 档案1"],
    [matchGenshinPanel, "#加载面板", "#加载面板1"],
    [matchTalentChange, "#胡桃换天赋8910", "#胡桃换天赋8910 档案1"],
    [matchGenshinPanelDiscard, "#删除面板", "#删除面板100000001 档案1"],
    [matchGenshinAvatarCard, "#胡桃", "#胡桃卡片 档案1"],
    [matchPersonalRecord, "#探索", "#探索 档案1"],
    [matchPersonalChallenge, "#上期深渊", "#上期深渊12层 档案1"],
    [matchPersonalHardChallenge, "#幽境危战", "#幽境危战 档案1"],
    [matchGenshinMonthly, "#原石", "#原石 档案1"],
    [matchGenshinStatistics, "#原石统计", "#原石统计 档案1"],
    [matchGenshinPayLog, "#充值记录", "#充值记录 档案1"],
    [matchGenshinAbyssTeam, "#深渊配队", "#深渊配队 档案1"],
    [parseTeamDamage, "#队伍伤害 胡桃", "#队伍伤害 胡桃 档案1"],
    [matchGenshinShowcase, "#更新胡桃面板", "#更新胡桃面板 档案1"],
    [matchStygianConsentCommand, "#幽境群榜授权 12345 Ark", "#幽境群榜授权 12345 Ark 档案1"],
    [matchSevenSaintsDecks, "#七圣召唤查询牌组2", "#七圣召唤查询牌组2 档案1"],
    [matchWeaponList, "#4星武器", "#4星武器 档案1"],
    [matchGenshinTarotCards, "#月谕圣牌", "#月谕圣牌 档案1"],
    [matchGrowthCommand, "#养成计算 胡桃", "#养成计算 胡桃 档案1"],
  ] as const;
  withGameCommandProfiles({ user: 42, profiles: { gs: 7, sr: 3, zzz: 6 }, isCurrent: () => true }, () => {
    for (const [match, omitted, explicit] of pairs) {
      expect(match(omitted)).toMatchObject({ profileId: 7 });
      expect(match(explicit)).toMatchObject({ profileId: 1 });
    }
    expect(matchGenshinShowcase("#展板更新面板100000001")).toEqual({ uid: "100000001", profileId: 1, explicitProfile: false });
    expect(matchGenshinShowcase("#展板更新面板100000001 档案7")).toEqual({ uid: "100000001", profileId: 7, explicitProfile: true });
    expect(matchGrowthCommand("#胡桃养成")).toMatchObject({ profileId: 7, explicitProfile: false });
    expect(matchGenshinPanel("#更新面板100000001")).toMatchObject({ uid: "100000001", profileId: 7 });
    expect(forGameCommandSender(42, true, () => matchGenshinPanel("#更新面板"))).toMatchObject({ profileId: 1 });
    expect(forGameCommandSender(43, false, () => matchGenshinPanel("#更新面板"))).toMatchObject({ profileId: 1 });
  });
  expect(matchGenshinPanel("#更新面板")).toMatchObject({ profileId: 1 });
});
