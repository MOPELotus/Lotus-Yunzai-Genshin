import { createTranslator as createTextTranslator } from "../../../../packages/i18n/index.ts";
import messageCatalog from "../../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import type { ArtifactScoringRule } from "../artifact-score.ts";

// Rules from the six artis_llm.js files at 22cb14e. See SOURCES and LICENSE.
export const lolomiArtifactRules: Readonly<Partial<Record<string, ArtifactScoringRule>>> = {
  七七({ attr, artis, rule, def }) {
    if (attr.cpct * 2 + attr.cdmg >= 180) {
      return rule($t("panel.lolomi.artifact-rules.text_bd0a1e8b24"), { atk: 100, cpct: 100, cdmg: 100, dmg: 100, recharge: 30 });
    }
    if (artis.is("phy", "4")) return rule($t("panel.lolomi.artifact-rules.text_5429148143"), { atk: 100, cpct: 100, cdmg: 100, recharge: 30 });
    return def({ atk: 100, cpct: 50, cdmg: 50, dmg: 25, recharge: 75, heal: 100 });
  },
  哥伦比娅({ attr, rule, def, cons }) {
    if (attr.recharge >= 200 && cons < 2) {
      return rule($t("panel.lolomi.artifact-rules.text_e88e5806d0"), { hp: 100, cpct: 75, cdmg: 75, mastery: 35, recharge: 100 });
    }
    return def({ hp: 100, cpct: 100, cdmg: 100, mastery: 75, recharge: 75 });
  },
  琴({ attr, rule, def }) {
    if (attr.cpct * 2 + attr.cdmg >= 180) {
      return rule($t("panel.lolomi.artifact-rules.text_850a2acd64"), { atk: 75, cpct: 100, cdmg: 100, dmg: 100, recharge: 25, heal: 25 });
    }
    return def({ atk: 100, cpct: 50, cdmg: 50, dmg: 25, recharge: 75, heal: 100 });
  },
  申鹤({ attr, rule, def }) {
    if (attr.cpct * 2 + attr.cdmg >= 180) {
      return rule($t("panel.lolomi.artifact-rules.text_e916dba640"), { atk: 100, cpct: 100, cdmg: 100, dmg: 100, recharge: 75 });
    }
    return def({ atk: 100, cpct: 50, cdmg: 50, recharge: 100 });
  },
  芭芭拉({ attr, rule, def }) {
    if (attr.cpct * 2 + attr.cdmg >= 180) {
      return rule($t("panel.lolomi.artifact-rules.text_1e84313dbc"), { atk: 75, cpct: 100, cdmg: 100, dmg: 100, recharge: 25, heal: 50 });
    }
    return def({ hp: 100, atk: 25, cpct: 50, cdmg: 50, dmg: 50, recharge: 75, heal: 100 });
  },
  莫娜({ attr, rule, def, cons }) {
    if (attr.cpct >= 180 && cons >= 6) {
      return rule($t("panel.lolomi.artifact-rules.text_e7362db67a"), { atk: 100, cpct: 100, cdmg: 100, dmg: 100, recharge: 75 });
    }
    if (attr.recharge >= 200 && cons < 2) {
      return rule($t("panel.lolomi.artifact-rules.text_ade7af4d1a"), { atk: 50, cpct: 50, cdmg: 75, dmg: 50, recharge: 100 });
    }
    return def({ atk: 50, cpct: 75, cdmg: 75, dmg: 75, recharge: 100 });
  },
};
