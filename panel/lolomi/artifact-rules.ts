import type { ArtifactScoringRule } from "../artifact-score.ts";

// Rules from the six artis_llm.js files at 22cb14e. See SOURCES and LICENSE.
export const lolomiArtifactRules: Readonly<Partial<Record<string, ArtifactScoringRule>>> = {
  七七({ attr, artis, rule, def }) {
    if (attr.cpct * 2 + attr.cdmg >= 180) {
      return rule("七七-输出", { atk: 100, cpct: 100, cdmg: 100, dmg: 100, recharge: 30 });
    }
    if (artis.is("phy", "4")) return rule("七七-物理", { atk: 100, cpct: 100, cdmg: 100, recharge: 30 });
    return def({ atk: 100, cpct: 50, cdmg: 50, dmg: 25, recharge: 75, heal: 100 });
  },
  哥伦比娅({ attr, rule, def, cons }) {
    if (attr.recharge >= 200 && cons < 2) {
      return rule("哥伦比娅-辅助", { hp: 100, cpct: 75, cdmg: 75, mastery: 35, recharge: 100 });
    }
    return def({ hp: 100, cpct: 100, cdmg: 100, mastery: 75, recharge: 75 });
  },
  琴({ attr, rule, def }) {
    if (attr.cpct * 2 + attr.cdmg >= 180) {
      return rule("琴-输出", { atk: 75, cpct: 100, cdmg: 100, dmg: 100, recharge: 25, heal: 25 });
    }
    return def({ atk: 100, cpct: 50, cdmg: 50, dmg: 25, recharge: 75, heal: 100 });
  },
  申鹤({ attr, rule, def }) {
    if (attr.cpct * 2 + attr.cdmg >= 180) {
      return rule("申鹤-输出", { atk: 100, cpct: 100, cdmg: 100, dmg: 100, recharge: 75 });
    }
    return def({ atk: 100, cpct: 50, cdmg: 50, recharge: 100 });
  },
  芭芭拉({ attr, rule, def }) {
    if (attr.cpct * 2 + attr.cdmg >= 180) {
      return rule("芭芭拉-输出", { atk: 75, cpct: 100, cdmg: 100, dmg: 100, recharge: 25, heal: 50 });
    }
    return def({ hp: 100, atk: 25, cpct: 50, cdmg: 50, dmg: 50, recharge: 75, heal: 100 });
  },
  莫娜({ attr, rule, def, cons }) {
    if (attr.cpct >= 180 && cons >= 6) {
      return rule("莫娜-输出", { atk: 100, cpct: 100, cdmg: 100, dmg: 100, recharge: 75 });
    }
    if (attr.recharge >= 200 && cons < 2) {
      return rule("莫娜-辅助", { atk: 50, cpct: 50, cdmg: 75, dmg: 50, recharge: 100 });
    }
    return def({ atk: 50, cpct: 75, cdmg: 75, dmg: 75, recharge: 100 });
  },
};
