import { eleBaseDmg } from './DmgCalcMeta.ts'
import lodash from './compat.ts'
import DmgMastery from './DmgMastery.ts'
import { Format, Meta } from './compat.ts'
import AttrItem, { type AttributeParts } from './AttrItem.ts'
import type { Params, RuleBuff, RuleContext } from './rule-types.ts'

type NumericFields = Record<string, number>;
type RawRecord = Readonly<Record<string, unknown>>;
type Game = "gs" | "sr";
export interface AttributeState extends Record<string, unknown> {
  atk: AttrItem;
  dmg: AttrItem;
  phy: AttrItem;
  coloringDmg: AttrItem;
  cdmg: AttrItem;
  cpct: AttrItem;
  enemydmg: AttrItem;
  heal: AttrItem;
  shield: AttrItem;
  mastery: AttrItem;
  stance: AttrItem;
  joy: AttrItem;
  staticAttr: Record<string, { plus: number; pct: number }> & { dmg: { plus: number } };
  enemy: { def: number; ignore: number; phy: number };
  superBreak: { ignore: number };
  element: string;
  weaponTypeName: string;
  refine: number;
  multi: number;
  fyplus: number;
  fypct: number;
  elevated: number;
  merrymakes: number;
  punchline: number;
  kx: number;
  fykx: number;
}
interface AttrInputs {
  originalAttr?: AttributeState;
  attr?: RawRecord;
  weapon?: RawRecord;
  char?: RawRecord;
  game?: Game;
}
interface Metadata {
  characterName?: string;
  level?: number;
  cons: number;
  trees: RawRecord;
  mastery?: string;
}
interface AttrCalculation {
  originalAttr: AttributeState;
  buffs: readonly RuleBuff[];
  meta: Metadata;
  artis: Readonly<Record<string, number>>;
  params?: Params;
  incAttr?: string;
  reduceAttr?: string;
  talent?: string;
  game?: Game;
}
export type CalculateAttribute = (value?: AttributeParts | number) => number;

let DmgAttr = {
  getAttrValue (ds: AttributeParts | number = {}) {
    const value = ds as AttributeParts
    return (value.base || 0) + (value.plus || 0) + ((value.base || 0) * (value.pct || 0) / 100)
  },

  getAttr ({ originalAttr, attr = {}, weapon = {}, char = {}, game = 'gs' }: AttrInputs): AttributeState {
    let ret: Record<string, unknown> = {}
    if (originalAttr) {
      ret = lodash.merge({}, originalAttr)
    }

    lodash.forEach('atk,def,hp,speed'.split(','), (key) => {
      ret[key] = AttrItem.create((originalAttr?.[key] as AttributeParts | undefined) || {
        base: ((attr?.[`${key}Base`] as number | undefined) || 0) * 1,
        plus: ((attr?.[key] as number | undefined) || 0) * 1 - ((attr?.[`${key}Base`] as number | undefined) || 0) * 1,
        pct: 0
      })
    })

    lodash.forEach((game === 'gs' ? 'mastery,recharge,cpct,cdmg,heal,dmg,phy,coloringDmg' : 'recharge,cpct,cdmg,heal,dmg,enemydmg,effPct,effDef,stance,joy').split(','), (key) => {
      ret[key] = AttrItem.create((originalAttr?.[key] as AttributeParts | undefined) || {
        base: ((attr?.[key] as number | undefined) || 0) * 1,
        plus: 0,
        pct: 0,
        inc: 0
      })
    })

    lodash.forEach((game === 'gs' ? 'a,a2,a3,e,q,nightsoul' : 'a,a2,a3,e,e2,xe,xe2,q,q2,q3,t,t2,me,me2,mt,mt2,dot,break,elation').split(','), (key) => {
      ret[key] = ret[key] || {
        pct: 0,
        multi: 0,
        plus: 0,
        dmg: 0,
        enemydmg: 0,
        cpct: 0,
        cdmg: 0,
        elevated: 0,
        merrymakes: 0,
        def: 0,
        ignore: 0
      }
    })

    ret.enemy = ret.enemy || { def: 0, ignore: 0, phy: 0 }
    ret.shield = AttrItem.create(originalAttr?.shield || { base: 100, plus: 0, inc: 100 })

    if (!originalAttr) {
      ret.weapon = weapon
      ret.weaponTypeName = char.weaponTypeName
      ret.element = Format.elemName(char.elem)
      ret.refine = (((weapon.affix as number | undefined) || (ret.refine as number | undefined) || 1) * 1 - 1) || 0
      ret.multi = 0
      ret.kx = 0
      ret.staticAttr = attr?.staticAttr || {}
      if (game === 'gs') {
        ret.elevated = 0 // 擢升
        ret.vaporize = 0 // 蒸发
        ret.melt = 0 // 融化
        ret.burning = 0 // 燃烧
        ret.crystallize = 0 // 结晶
        ret.superConduct = 0 // 超导
        ret.swirl = 0 // 扩散
        ret.electroCharged = 0 // 感电
        ret.shatter = 0 // 碎冰
        ret.overloaded = 0 // 超载
        ret.bloom = 0 // 绽放
        ret.burgeon = 0 // 烈绽放
        ret.hyperBloom = 0 // 超绽放
        ret.aggravate = 0 // 超激化
        ret.spread = 0 // 蔓激化
        ret.lunarCharged = 0 // 月感电
        ret.lunarBloom = 0 // 月绽放
        ret.lunarCrystallize = 0 // 月结晶
        ret.stellarConduct = 0 // 星超导
        ret.stellarSwirl = 0 // 星扩散
        ret.fykx = 0 // 敌人反应抗性降低
        ret.fyplus = 0 // 反应伤害值提升（数值/不受精通加成）
        ret.fypct = 0 // 反应基础伤害值提升（百分比/受精通加成）
      } else if (game === 'sr') {
        ret.sp = ((char.sp as number | undefined) || 0) * 1
        ret.superBreak = {
          ignore: 0
        }
        ret.merrymakes = 0 // 增笑
        ret.punchline = 0 // 笑点
      }
    }

    let { attrMap } = Meta.getMeta(game, 'arti')
    lodash.forEach(attrMap, (cfg, key) => {
      if (!ret[key]) {
        ret[key] = AttrItem.create({ base: 0, plus: 0, pct: 0, inc: 0 })
      }
    })

    return ret as AttributeState
  },

  getDs (attr: AttributeState, meta: Metadata, params: Params) {
    return {
      ...meta, attr, params, refine: attr.refine,
      weaponTypeName: attr.weaponTypeName,
      element: Format.elemName(attr.element) || attr.element,
      calc: DmgAttr.getAttrValue
    }
  },

  calcAttr ({ originalAttr, buffs, meta, artis, params = {}, incAttr = '', reduceAttr = '', talent = '', game = 'gs' }: AttrCalculation) {
    let attr = DmgAttr.getAttr({ originalAttr, game })
    attr.characterName = meta.characterName
    let msg: string[] = []
    let { attrMap } = Meta.getMeta(game, 'arti')

    if (incAttr && attrMap[incAttr]) {
      let aCfg = attrMap[incAttr]
      const entry = (attr[incAttr] as AttrItem | undefined) || AttrItem.create({ base: 0, plus: 0, pct: 0, inc: 0 })
      attr[incAttr] = entry
      entry[aCfg.calc] += aCfg.value
    }
    if (reduceAttr && attrMap[reduceAttr]) {
      let aCfg = attrMap[reduceAttr]
      const entry = (attr[reduceAttr] as AttrItem | undefined) || AttrItem.create({ base: 0, plus: 0, pct: 0, inc: 0 })
      attr[reduceAttr] = entry
      entry[aCfg.calc] -= aCfg.value
    }

    lodash.forEach(buffs, (buff) => {
      meta.mastery = meta.mastery || buff.mastery
    })
    lodash.forEach(buffs, (buff) => {
      let ds = DmgAttr.getDs(attr, meta, params) as unknown as RuleContext & { currentTalent: string; artis: Readonly<Record<string, number>> }
      ds.currentTalent = talent
      ds.artis = artis

      if (buff.isStatic) return
      if (buff.check && !buff.check(ds)) return
      if (buff.cons && ds.cons * 1 < buff.cons * 1) return
      if (buff.maxCons !== undefined && ds.cons * 1 > buff.maxCons * 1) return
      if (buff.tree && !ds.trees[`10${buff.tree}`]) return

      let title = typeof buff.title === 'function' ? buff.title(ds) : buff.title

      if (buff.mastery) {
        let mKey: Record<string, string> = { vaporize: '蒸发', melt: '融化', swirl: '扩散' }
        let mKey2: Record<string, string> = { aggravate: '超激化', spread: '蔓激化' }
        let mastery = Math.max(0, (attr.mastery?.base || 0) + (attr.mastery?.plus || 0))
        buff.data = buff.data || {}
        let key = buff.mastery
        if (mKey[key]) {
          buff.data['_' + key] = DmgMastery.getMultiple(key, mastery) * 100
        } else if (mKey2[key]) {
          let eleNum = DmgMastery.getBasePct(key, attr.element, talent)
          let eleBase = 1 + ((attr[key] as number | undefined) || 0) / 100 + DmgMastery.getMultiple(key, mastery)
          eleBase *= eleBaseDmg[ds.level]!
          buff.data['_' + key] = DmgMastery.getMultiple(key, mastery) * 100
          buff.data['_' + key + 'num'] = eleNum * eleBase
        }
      }

      lodash.forEach(buff.data, (val, key) => {
        if (typeof val === "function") val = val(ds)
        if (typeof val === "number" && !Number.isFinite(val)) throw new TypeError("无有效数值的伤害加成。")
        if (!val && val !== 0) return
        title = title.replace(`[${key}]`, Format.comma(val, 1))

        // 技能提高
        let tRet = /^(a|a2|a3|e|e2|q|q2|q3|t|t2|me|xe|xe2|mt|dot|break|nightsoul)(Def|Ignore|Dmg|Enemydmg|Plus|Pct|Cpct|Cdmg|Multi|Elevated|Merrymakes)$/.exec(key)
        if (tRet) {
          if (attr[tRet[1]!]) {
            (attr[tRet[1]!] as NumericFields)[tRet[2]!.toLowerCase()]! += val * 1 || 0
          }
          return
        }

        let aRet = /^(mastery|cpct|cdmg|heal|recharge|dmg|enemydmg|phy|coloringDmg|shield|speed|stance|joy)(Plus|Pct|Inc)?$/.exec(key)
        if (aRet) {
          if (attr[aRet[1]!]) {
            (attr[aRet[1]!] as NumericFields)[aRet[2] ? aRet[2].toLowerCase() : 'plus']! += val * 1 || 0
          }
          return
        }

        let bRet = /^(hp|def|atk)(Base|Plus|Pct|Inc)?$/.exec(key)
        if (bRet) {
          let bKey = bRet[1]!
          let bType = bRet[2] ? bRet[2].toLowerCase() : 'plus'
          if (attr[bKey]) {
            (attr[bKey] as NumericFields)[bType]! += val * 1 || 0
            if (bRet[2] === 'Base' && attr.staticAttr?.[bKey]) {
              (attr[bKey] as AttrItem).plus += val * attr.staticAttr[bKey].pct / 100 || 0
            }
          }
          return
        }
        if (key === 'enemyDef') {
          attr.enemy.def += val * 1 || 0
          return
        }

        if (key === 'ignore' || key === 'enemyIgnore') {
          attr.enemy.ignore += val * 1 || 0
          return
        }

        if ([
          'vaporize', 'melt', 'crystallize', 'burning',
          'superConduct', 'swirl', 'electroCharged', 'shatter',
          'overloaded', 'bloom', 'burgeon', 'hyperBloom',
          'aggravate', 'spread', 'elevated',
          'lunarCharged', 'lunarBloom', 'lunarCrystallize',
          'stellarConduct', 'stellarSwirl',
          'kx', 'fykx', 'multi', 'fyplus', 'fypct',
          'merrymakes', 'punchline'
        ].includes(key)) {
          attr[key] = (attr[key] as number) + (val * 1 || 0)
          return
        }

        let sRet = /^(superBreak)(Ignore)$/.exec(key)
        if (sRet) {
          if (attr[sRet[1]!]) {
            (attr[sRet[1]!] as NumericFields)[sRet[2]!.toLowerCase()]! += val * 1 || 0
          }
        }
      })
      msg.push(title)
    })

    return { attr, msg }
  }
}

export default DmgAttr
