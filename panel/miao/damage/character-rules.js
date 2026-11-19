// Original character rule bodies from resources/meta-gs/character/**/calc.js.
import lodash, { Format } from './compat.js'

export const characterDamageRules = {
  "七七": () => {
    const details = [
      {
        title: 'E每跳治疗',
        dmg: ({ talent, attr, calc }, { heal }) =>
          heal(talent.e['持续治疗量2'][0] * calc(attr.atk) / 100 + talent.e['持续治疗量2'][1] * 1)
      },
      {
        title: '度厄真符每次治疗',
        dmg: ({ talent, attr, calc }, { heal }) =>
          heal(talent.q['治疗量2'][0] * calc(attr.atk) / 100 + talent.q['治疗量2'][1] * 1)
      },
      {
        title: '【辉映·星超导】Q星超导伤害',
        dmg: ({ attr, calc, talent }, { basic }) => basic(calc(attr.atk) * talent.q['星超导伤害'] / 100, '', 'stellarConduct')
      },
      {
        cons: 4,
        title: '4命追加每跳治疗',
        dmg: ({ talent, attr, calc }, { heal }) => heal(180 * calc(attr.atk) / 100)
      }
    ]

    const mainAttr = 'atk,cpct,cdmg,mastery,heal'

    const buffs = [
      {
        title: '双冰共鸣：攻击冰元素附着或冻结状态下的敌人时，暴击率提高[cpct]%',
        data: {
          cpct: 15
        }
      },
      {
        title: '七七天赋：【辉映·星超导】寒病鬼差持续期间，星超导反应伤害提升[stellarConduct]%',
        data: {
          stellarConduct: 50
        }
      },
      {
        title: '七七2命：【辉映·星烁】七七的攻击力提升[atkPct]%。',
        cons: 2,
        data: {
          atkPct: 50
        }
      }
    ]
    return { details, mainAttr, buffs }
  },
  "丝柯克": () => {
    const details = [{
      title: '七相一闪普攻首段伤害',
      params: { cons_2 : true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.e['一段伤害'], 'a')
    }, {
      title: '七相一闪普攻尾段伤害',
      params: { cons_2 : true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.e['五段伤害'], 'a')
    }, {
      title: '七相一闪重击伤害',
      params: { cons_2 : true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.e['重击伤害'], 'a')
    }, {
      title: 'Q极恶技·灭6段总伤害',
      params: { Havoc_Ruin: true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.q['斩击伤害'] + talent.q['斩击最终段伤害'], 'q')
    }, {
      title: '七相一闪1命晶刃单次伤害',
      params: { cons_2 : true },
      cons: 1,
      dmg: ({}, dmg) => dmg(500, 'a2')
    }, {
      title: '6命1层极恶技·斩协同攻击伤害',
      cons: 6,
      dmg: ({}, dmg) => dmg(600, 'q')
    }, {
      title: '6命七相一闪3次协同攻击总伤害',
      params: { cons_2 : true },
      cons: 6,
      dmg: ({}, dmg) => dmg(150 * 3, 'a')
    }, {
      title: '受到伤害时6命七相一闪3次协同攻击总伤害',
      params: { cons_2 : true },
      cons: 6,
      dmg: ({}, dmg) => dmg(150 * 3, 'a2')
    }]

    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      title: '双冰共鸣：攻击冰元素附着或冻结状态下的敌人时，暴击率提高[cpct]%',
      data: {
        cpct: 15
      }
    }, {
      check: ({ params }) => params.Havoc_Ruin === true,
      title: '丝柯克元素爆发：依据施放时丝柯克拥有的蛇之狡谋超过50点的部分，Q极恶技·灭最多可获得[qPct]%的倍率提升',
      data: {
        qPct: ({ talent, cons }) => {
          let num = cons > 1 ? 22 : 12
          return num * talent.q['蛇之狡谋加成'] * 6
        }
      }
    }, {
      title: '丝柯克元素爆发：汲取3枚虚境裂隙时，普通攻击造成的伤害提高[aDmg]%',
      data: {
        aDmg: ({ talent }) => talent.q['汲取0/1/2/3枚虚境裂隙伤害提升'][3]
      }
    }, {
      title: '丝柯克天赋：3层死河渡断时，普通攻击造成原本170%的伤害，且元素爆发极恶技·灭造成原本160%的伤害',
      data: {
        aMulti: 70,
        qMulti: 60
      }
    }, {
      check: ({ params }) => params.cons_2 === true,
      title: '丝柯克2命：施放七相一闪模式下的特殊元素爆发极恶技·尽后的12.5秒内，攻击力提升[atkPct]%',
      cons: 2,
      data: {
        atkPct: 70
      }
    }, {
      title: '丝柯克4命：3层死河渡断效果使丝柯克的攻击力提升[atkPct]%',
      cons: 4,
        data: {
        atkPct: 40
      }
    }]

    const createdBy = '冰翼'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "丽莎": () => {
    const details = [{
      title: 'E短按伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['点按伤害'], 'e')
    }, {
      title: '3层引雷长按E伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['三层引雷长按伤害'], 'e')
    }, {
      title: 'Q每段伤害',
      params: { q: true },
      dmg: ({ talent }, dmg) => dmg(talent.q['放电伤害'], 'q')
    }]

    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      title: '丽莎被动：敌人受到蔷薇的雷光攻击后，降低15%防御力',
      data: {
        enemyDef: ({ params }) => params.q ? 15 : 0
      }
    }]
    return { details, defDmgIdx, mainAttr, buffs }
  },
  "久岐忍": () => {
    const details = [{
      title: '超绽放伤害',
      dmg: ({ calc, attr }, { reaction }) => {
        return reaction('hyperBloom')
      }
    }, {
      title: 'E释放伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: 'E每跳治疗',
      dmg: ({ talent, calc, attr }, { heal }) => {
        let ec = talent.e['越祓草轮治疗量2']
        return heal(calc(attr.hp) * ec[0] / 100 + ec[1] * 1 + calc(attr.mastery) * 0.75)
      }
    }, {
      title: 'Q每跳伤害',
      dmg: ({ talent, calc, attr }, { basic }) => basic(talent.q['单次伤害'] * calc(attr.hp) / 100, 'q')
    }]

    const defDmgIdx = 0
    const mainAttr = 'hp,atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '久岐忍被动：生命低于50%时提高治疗加成15%',
      data: {
        heal: 15
      }
    }, {
      title: '久岐忍被动：基于元素精通提高治疗量[healNum]，伤害[ePlus]',
      sort: 9,
      data: {
        healNum: ({ attr, calc }) => calc(attr.mastery) * 0.75,
        ePlus: ({ attr, calc }) => calc(attr.mastery) * 0.25
      }
    }]
    return { details, defDmgIdx, mainAttr, buffs }
  },
  "九条裟罗": () => {
    const details = [{
      title: 'E提升攻击力',
      dmg: ({ talent, attr }) => {
        return {
          avg: talent.e['攻击力加成比例'] * attr.atk.base / 100
        }
      }
    }, {
      title: 'E后Q首段伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['天狗咒雷·金刚坏 伤害'], 'q')
    }, {
      title: 'E后Q每段',
      dmg: ({ talent }, dmg) => dmg(talent.q['天狗咒雷·雷砾 伤害'], 'q')
    }]

    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      title: '九条E技能：提升攻击力[atkPlus]',
      data: {
        atkPlus: ({ attr, talent }) => talent.e['攻击力加成比例'] * attr.atk.base / 100
      }
    }, {
      title: '九条6命：提升60%雷元素爆伤',
      cons: 6,
      data: {
        cdmg: 60
      }
    }]
    return { details, defDmgIdx, mainAttr, buffs }
  },
  "云堇": () => {
    const details = [{
      title: 'Q提供普攻基础伤害',
      dmg: ({ talent, attr }) => {
        return {
          avg: (talent.q['伤害值提升'] / 100 + 0.115) * attr.def
        }
      }
    }, {
      title: '二段蓄力E伤害',
      dmg: ({ talent, attr }, { basic }) => {
        let ret = talent.e['二段蓄力伤害'] / 100 * attr.def
        return basic(ret, 'e')
      }
    }]

    const mainAttr = 'atk,def,cpct,cdmg'

    const buffs = [{
      title: '云堇被动：队伍存在4元素类型角色时，Q提供的普攻伤害提高[_q]',
      sort: 9,
      data: {
        _q: ({ attr }) => {
          return attr.def * 0.115
        }
      }
    }]
    return { details, mainAttr, buffs }
  },
  "五郎": () => {
    const details = [{
      title: '三岩E伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: '三岩Q伤害',
      dmg: ({ talent, attr }, { basic }) => {
        let ret = talent.q['技能伤害'] / 100 * attr.def
        return basic(ret, 'q')
      }
    }, {
      title: '三岩Q每跳伤害',
      dmg: ({ talent, attr }, { basic }) => {
        let ret = talent.q['岩晶崩破伤害'] / 100 * attr.def
        return basic(ret, 'q')
      }
    }, {
      title: 'Q每跳治疗',
      cons: 4,
      dmg: ({ attr }, { heal }) => heal(0.5 * attr.def)
    }]

    const mainAttr = 'atk,def,cpct,cdmg'

    const buffs = [{
      title: '五郎天赋：释放E或Q后防御力提高[defPlus]，岩伤提高15%',
      data: {
        defPlus: ({ talent }) => talent.e['防御力提升'] * 1,
        dmg: 15
      }
    }, {
      title: '天赋-报恩之守：基于防御力，提高E伤害[ePlus]，提高Q伤害[qPlus]',
      sort: 9,
      data: {
        ePlus: ({ attr }) => 1.56 * attr.def,
        qPlus: ({ attr }) => 0.156 * attr.def
      }
    }, {
      title: '五郎被动：释放E后防御力提高25%',
      data: {
        defPct: 25
      }
    }, {
      title: '五郎4命：Q每跳回复防御力50%',
      cons: 4
    }, {
      title: '五郎6命：三岩队伍提高40%岩伤',
      cons: 6,
      data: {
        dmg: 40
      }
    }]
    return { details, mainAttr, buffs }
  },
  "伊安珊": () => {
    const details = [{
      title: '雷霆飞缒伤害',
      dmg: ({ talent, attr }, dmg) => dmg(talent.a['雷霆飞缒伤害'], 'a2,nightsoul')
    },{
      title: 'E技能伤害',
      dmg: ({ talent, attr }, dmg) => dmg(talent.e['技能伤害'], 'e,nightsoul')
    },{
      title: 'E后Q技能伤害',
      params: { Precise_Movement: true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.q['技能伤害'], 'q,nightsoul')
    },{
      title: '动能标示攻击力最多提升',
      params: { Precise_Movement: true },
      dmg: ({ talent, calc, attr }) => {
        return {
          avg: Math.min(calc(attr.atk) * 27 / 100, talent.q['最大攻击力加成'])
        }
      }
    },{
      title: '「热身效应」每跳治疗',
      dmg: ({ calc, attr }) => {
        return {
          avg: calc(attr.atk) * 60 / 100
        }
      }
    }]

    const defParams = { Nightsoul: true }
    const defDmgIdx = 2
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      check: ({ params }) => params.Precise_Movement === true,
      title: '伊安珊天赋：「雷霆飞缒」命中敌人后，伊安珊的攻击力提升[atkPct]%',
      data: {
        atkPct: 20
      }
    },{
      title: '伊安珊6命：若夜魂值恢复量溢出，使队伍中自己的当前场上角色造成的伤害提升[dmg]%',
      cons: 6,
      data: {
        dmg: 25
      }
    }]

    const createdBy = '冰翼'
    return { details, defParams, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "伊法": () => {
    const details = [{
      title: 'E秘药弹伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['秘药弹伤害'], 'e,nightsoul')
    }, {
      title: 'E秘药弹治疗量',
      dmg: ({ talent, attr }, { heal }) => {
        return heal(talent.e['秘药弹命中治疗量2'][0] / 100 * attr.mastery + talent.e['秘药弹命中治疗量2'][1])
      }
    }, {
      title: 'Q技能伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q,nightsoul')
    }, {
      title: "Q镇静标记伤害",
      dmg: ({ talent }, dmg) => dmg(talent.q['镇静标记伤害'], 'q,nightsoul')
    }, {
      title: '扩散反应伤害',
      dmg: ({}, { reaction }) => reaction('swirl')
    }, {
      title: '6命额外秘药弹伤害',
      cons: 6,
      dmg: ({}, dmg) => dmg(120, 'a,nightsoul')
    }]

    const defParams = { Nightsoul: true }
    const defDmgIdx = 0
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '伊法4命：施放元素爆发后，伊法的元素精通提升[mastery]点',
      cons: 4,
      data: {
        mastery: 100
      }
    }]

    const createdBy = '冰翼'
    return { details, defParams, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "伊涅芙": () => {
    const details = [{
      title: `E伤害`,
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: `E放电伤害`,
      dmg: ({ talent }, dmg) => dmg(talent.e['薇尔琪塔放电伤害'], 'e')
    }, {
      title: `E护盾吸收量`,
      dmg: ({ talent, calc, attr }, { shield }) => shield(talent.e['护盾吸收量2'][0] * calc(attr.atk) / 100 + talent.e['护盾吸收量2'][1])
    }, {
      title: `Q伤害`,
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    }, {
      title: `单人天赋附加伤害`,
      params: { Lunar: true },
      dmg: ({ calc, attr }, { basic }) => basic(calc(attr.atk) * 65 / 100, '', 'lunarCharged')
    }, {
      title: '单人月感电伤害',
      params: { Lunar: true },
      dmg: ({}, { reaction }) => reaction('lunarCharged')
    }, {
      check: ({ cons }) => cons >= 2,
      title: `单人2命附加伤害`,
      params: { Lunar: true },
      dmg: ({ calc, attr }, { basic }) => basic(calc(attr.atk) * 300 / 100, '', 'lunarCharged')
    }, {
      check: ({ cons }) => cons >= 6,
      title: `单人6命附加伤害`,
      params: { Lunar: true },
      dmg: ({ calc, attr }, { basic }) => basic(calc(attr.atk) * 135 / 100, '', 'lunarCharged')
    }]

    const defDmgIdx = 4
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '伊涅芙天赋：施放元素爆发后元素精通提升[mastery]',
      sort: 9,
      data: {
        mastery: ({ attr, calc }) => calc(attr.atk) * 6 / 100
      }
    }, {
      check: ({ params }) => params.Lunar === true,
      title: '伊涅芙天赋：触发感电反应时转为触发月感电反应,基础伤害提升[fypct]%',
      sort: 9,
      data: {
        fypct: ({ attr, calc }) => Math.min((calc(attr.atk) / 100 * 0.7), 14)
      }
    }, {
      check: ({ params }) => params.Lunar === true,
      title: '伊涅芙1命：展开护盾时月感电反应伤害提升[lunarCharged]%',
      sort: 9,
      cons: 1,
      data: {
        lunarCharged: ({ attr, calc }) => Math.min((calc(attr.atk) / 100 * 2.5), 50)
      }
    }]

    const createdBy = 'liangshi'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "优菈": () => {
    let tmpDmg = false

    const details = [{
      title: '普攻尾段2次伤害',
      params: { e: false },
      dmg: ({ talent }, dmg) => dmg(talent.a['五段伤害'], 'a', 'phy')
    }, {
      title: 'E0层长按伤害',
      params: { gj: false },
      dmg: ({ talent }, dmg) => {
        tmpDmg = dmg(talent.e['长按伤害'], 'e')
        return tmpDmg
      }
    }, {
      title: 'E2层长按伤害',
      params: { gj: true },
      dmg: ({ talent }, dmg) => {
        let e = tmpDmg
        let g = dmg(talent.e['冰涡之剑伤害'], 'e')
        let j = dmg(talent.q['光降之剑基础伤害'], 'e', 'phy')
        return {
          dmg: e.dmg * 1 + g.dmg * 2 + j.dmg * 0.5,
          avg: e.avg * 1 + g.avg * 2 + j.avg * 0.5
        }
      }
    }, ({ cons, weapon }) => {
      let buffCount = 12
      if (weapon.name === '松籁响起之时') {
        buffCount = 13
        if (weapon.affix >= 4) {
          buffCount = 14
        }
      }
      if (cons === 6) {
        buffCount = buffCount + 11
      }
      return {
        title: `光降之剑${buffCount}层伤害`,
        params: { gj: true },
        dmg: ({ talent }, dmg) => dmg(talent.q['光降之剑基础伤害'] + talent.q['每层能量伤害'] * buffCount, 'q', 'phy')
      }
    }]

    const defDmgIdx = 3
    const mainAttr = 'atk,cpct,cdmg'
    const enemyName = '魔偶/女士/雷神'

    const buffs = [{
      title: '优菈天赋：E消耗冰涡之剑后降低抗性[kx]%',
      check: ({ params }) => params.gj !== false,
      data: {
        kx: ({ talent }) => talent.e['冰元素抗性降低']
      }
    }, {
      title: '优菈一命：消耗冷酷之心后物理伤害提高30%',
      cons: 1,
      data: {
        phy: ({ params }) => params.gj ? 30 : 0
      }
    }, {
      title: '优菈四命：对生命值低于50%的敌人，光降之剑造成的伤害提高25%',
      cons: 4,
      data: {
        qDmg: 25
      }
    }, {
      title: '优菈6命：光降之剑额外获得5层Buff，普攻/E有50%概率额外获得1层',
      cons: 6
    }]
    return { details, defDmgIdx, mainAttr, enemyName, buffs }
  },
  "克洛琳德": () => {
    const details = [{
        title: 'E后普通攻击',
        params: { BondOfLifeGet: 3 },
        dmg: ({ talent }, dmg) => dmg(talent.e['驰猎伤害2'][0], 'a')
    }, {
        title: 'E后穿透射击',
        params: { blPct: 0.5, BondOfLifeGet: 1 },
        dmg: ({ talent }, dmg) => dmg(talent.e['驰猎伤害2'][1], 'a')
    }, {
        title: 'E剑击伤害',
        params: { blPct: 0 },
        dmg: ({ talent }, dmg) => dmg(talent.e['贯夜伤害2'][0], 'a')
    }, {
        title: 'E强化剑击伤害',
        params: { blPct: 0.5, BondOfLifeGet: 2, DecreasedBondOfLife: 1, HealNumber: 1 },
        dmg: ({ talent }, dmg) => dmg(talent.e['贯夜伤害2'][1], 'a')
    }, {
        title: 'E贯夜·契令伤害',
        params: { BondOfLifeGet: 3, DecreasedBondOfLife: 1, HealNumber: 1 },
        dmg: ({ talent }, dmg) => dmg(talent.e['贯夜伤害2'][2], 'a')
    }, {
        title: 'Q单段伤害',
        params: { BondOfLifeGet: 4, DecreasedBondOfLife: 1 },
        dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害2'][0], 'q')
    }, {
        title: 'Q完整伤害',
        params: { BondOfLifeGet: 4, DecreasedBondOfLife: 1 },
        dmg: ({ talent }, dmg) => {
        let q1 = dmg(talent.q['技能伤害2'][0], 'q')
        return {
          dmg: q1.dmg * 5,
          avg: q1.avg * 5
        }
      }
    }]

    const defParams = ({ weapon }) => weapon.name === '海渊终曲' ? { BondOfLife: 35 * 3 + 25, blPct: 1 } : { BondOfLife: 35 * 3, blPct: 1 }// 生命之契在此调整,请勿超过200,默认生命之契未计入队友治疗转化
    const defDmgIdx = 4
    const mainAttr = 'atk,cpct,cdmg,mastery,dmg'

    const buffs = [{
        title: '克洛琳德天赋：触发雷元素反应普通攻击与残光将终造成的伤害提升[aPlus]',
        data: {
          aPlus: ({ attr, cons }) => Math.min((attr.atk * (cons >= 2 ? 30 : 20) / 100 * 3), (cons >= 2 ? 2700 : 1800)),
          qPlus: ({ attr, cons }) => Math.min((attr.atk * (cons >= 2 ? 30 : 20) / 100 * 3), (cons >= 2 ? 2700 : 1800))
        }
    }, {
        title: '克洛琳德天赋：生命之契的数值提升或降低时，暴击率提升[cpct]% ',
        data: {
          cpct: 10 * 2
        }
    }, {
      title: '克洛琳德4命：[buffCount]%最大生命值的生命之契使残光将终造成的伤害提升[qDmg]',
        cons: 4,
        data: {
          buffCount: ({ talent, params, weapon }) => Math.min(params.blPct * (talent.q['赋予生命之契'] + params.BondOfLife), 200),
          qDmg: ({ talent, params, weapon }) => Math.min((params.blPct * (talent.q['赋予生命之契'] + params.BondOfLife) * 2), 200)
        }
    }, {
        title: '克洛琳德6命：施放狩夜之巡后暴击率提高[cpct]%,暴击伤害提高[cdmg]%',
        cons: 6,
        data: {
          cpct: 10,
          cdmg: 70
        }
    }]

    const createdBy = 'liangshi'
    return { details, defParams, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "八重神子": () => {
    const details = [{
      check: ({ cons }) => cons < 2,
      dmgKey: 'e',
      title: '叄阶杀生樱伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['杀生樱伤害·叁阶'], 'e')
    }, {
      check: ({ cons }) => cons < 2,
      dmgKey: 'e',
      title: '强化叄阶杀生樱伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['杀生樱伤害·叁阶'] + 80, 'e')
    }, {
      check: ({ cons }) => cons >= 2,
      dmgKey: 'e',
      title: '肆阶杀生樱伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['杀生樱伤害·肆阶'], 'e')
    }, {
      check: ({ cons }) => cons >= 2,
      dmgKey: 'e',
      title: '强化肆阶杀生樱伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['杀生樱伤害·肆阶'] + 80, 'e')
    }, {
      check: ({ cons }) => cons < 2,
      title: '叄阶杀生樱激化伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['杀生樱伤害·叁阶'], 'e', 'aggravate')
    }, {
      check: ({ cons }) => cons >= 2,
      title: '肆阶杀生樱激化伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['杀生樱伤害·肆阶'], 'e', 'aggravate')
    }, {
      title: '【辉映·星超导】强化落雷命中后额外星超导伤害',
      params: { Stellar: true },
      dmg: ({ attr, calc }, { basic }) => basic(calc(attr.atk) * 200 / 100, '', 'stellarConduct')
    }, {
      title: 'E施放后额外雷击伤害',
      dmg: ({ talent }, dmg) => dmg(40, '')
    }, {
      title: '【辉映·星超导】E施放后额外星超导伤害',
      params: { Stellar: true },
      dmg: ({ attr, calc }, { basic }) => basic(calc(attr.atk) * 50 / 100, '', 'stellarConduct')
    }, {
      title: '四段Q总伤害',
      params: { Q: true },
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'] + talent.q['天狐霆雷伤害'] * 3, 'q')
    }, {
      title: '四段Q总激化伤害',
      params: { Q: true },
      dmg: ({ talent }, dmg) => {
        let q1j = dmg(talent.q['技能伤害'], 'q', 'aggravate')
        let q2j = dmg(talent.q['天狐霆雷伤害'], 'q', 'aggravate')
        return {
          dmg: q1j.dmg + q2j.dmg * 3,
          avg: q1j.avg + q2j.avg * 3
        }
      }
    }]

    const mainAttr = 'atk,cpct,cdmg,mastery,dmg'
    const defDmgKey = 'e'

    const buffs = [{
      title: '被动天赋：基于元素精通提高杀生樱伤害[eDmg]%',
      sort: 9,
      data: {
        eDmg: ({ attr, calc }) => calc(attr.mastery) * 0.15
      }
    }, {
      cons: 1,
      title: '1命效果：触发超导/星超导反应或造成星超导反应伤害后，获得[dmg]%雷元素伤害加成和星超导伤害加成',
      data: {
        dmg: 50,
        stellarConduct: 50,
      }
    }, {
      cons: 2,
      title: '2命效果：肆阶杀生樱在场时，元素精通提高[mastery]',
      data: {
        mastery: 200
      }
    }, {
      cons: 4,
      title: '4命效果：杀生樱命中敌人后提高雷伤[dmg]%',
      data: {
        dmg: 20
      }
    }, {
      check: ({ params }) => params.Q === true,
      cons: 4,
      title: '4命效果：元素爆发伤害提升[dmg]%',
      data: {
        dmg: 100
      }
    }, {
      cons: 6,
      title: '6命效果：杀生樱无视敌人[eDef]%防御',
      data: {
        eDef: 60
      }
    }, {
      check: ({ params }) => params.Stellar === true,
      cons: 6,
      title: '6命效果：星超导反应伤害的暴击伤害提升[cdmg]%',
      data: {
        cdmg: 200
      }
    }]
    return { details, mainAttr, defDmgKey, buffs }
  },
  "兹白": () => {
    const details = [
      {
        title: '「月转时隙」普攻首段伤害',
        dmg: ({ attr, calc, talent } , { basic }) => basic(calc(attr.def) * talent.e['月转时隙一段伤害'] / 100, 'a')
      },
      {
        params: { Moonsign_Benediction: true, cons_6: true },
        title: '「月转时隙」普攻尾段额外伤害',
        dmg: ({ attr, calc, cons, talent } , { basic }) => basic(calc(attr.def) * talent.e['月转时隙第四段额外伤害'] / 100 * (cons >= 4 ? 2.5 : 1), '', 'lunarCrystallize')
      },
      {
        title: '「灵驹飞踏」第一段伤害',
        dmg: ({ attr, calc, talent } , { basic }) => basic(calc(attr.def) * talent.e['灵驹飞踏第一段伤害'] / 100, 'e')
      },
      {
        params: { skills_1: true, Moonsign_Benediction: true, cons_2: true, cons_6: true },
        title: '「灵驹飞踏」第二段伤害',
        dmg: ({ attr, calc, talent } , { basic }) => basic(calc(attr.def) * talent.e['灵驹飞踏第二段伤害'] / 100, '', 'lunarCrystallize')
      },
      {
        title: 'Q技能第一段伤害',
        dmg: ({ attr, calc, talent } , { basic }) => basic(calc(attr.def) * talent.q['技能第一段伤害'] / 100, 'q')
      },
      {
        params: { Moonsign_Benediction: true, cons_6: true },
        title: 'Q技能第二段伤害',
        dmg: ({ attr, calc, talent } , { basic }) => basic(calc(attr.def) * talent.q['技能第二段伤害'] / 100, '', 'lunarCrystallize')
      },
      {
        params: { skills_1: true, Moonsign_Benediction: true, cons_1: true, cons_6: true },
        title: '1命「灵驹飞踏」初次第二段伤害',
        cons: 1,
        dmg: ({ attr, calc, talent } , { basic }) => basic(calc(attr.def) * talent.e['灵驹飞踏第二段伤害'] / 100, '', 'lunarCrystallize')
      }
    ]

    const defDmgIdx = 3
    const mainAttr = 'def,cpct,cdmg,mastery'
    const defParams = { Moonsign: 2 }

    const buffs = [
      {
        check: ({ params }) => params.skills_1 === true,
        title: '兹白天赋：施放元素战技或触发月笼谐奏时，灵驹飞踏第二段攻击造成的伤害提升，提升值相当于兹白防御力的60%',
        sort: 9,
        data: {
          fyplus: ({ attr, calc }) => calc(attr.def) * 60 / 100
        }
      },
      {
        title: '兹白天赋：队伍中每存在一名元素类型为水元素的其他角色，都会使兹白的元素精通提升[mastery]点',
        data: {
          mastery: 60
        }
      },
      {
        check: ({ params }) => params.Moonsign_Benediction === true,
        title: '兹白天赋：基于兹白的防御力，对队伍中角色造成的月结晶反应提升[fypct]%的基础伤害',
        sort: 9,
        data: {
          fypct: ({ attr, calc }) => Math.min(calc(attr.def) / 100 * 0.7, 14)
        }
      },
      {
        check: ({ params }) => params.cons_1 === true,
        title: '兹白1命：每次切换至「月转时隙」模式后，初次施放灵驹飞踏时，第二段攻击造成的月结晶反应伤害提升[lunarCrystallize]%',
        cons: 1,
        data: {
          lunarCrystallize: 220
        }
      },
      {
        check: ({ params }) => params.cons_2 === true,
        title: '兹白2命：【月兆·满辉】灵驹飞踏第二段攻击造成的伤害进一步提升，提升值相当于兹白防御力的[_fyplus]%',
        cons: 2,
        sort: 9,
        data: {
          _fyplus: ({ params }) => ((params.Moonsign || 0) >= 2 ? 550 : 0),
          fyplus: ({ attr, calc, params }) => ((params.Moonsign || 0) >= 2 ? calc(attr.def) * 550 / 100 : 0)
        }
      },
      {
        check: ({ params }) => params.cons_6 === true,
        title: '兹白6命：100点「时隙浮光」时，本次灵驹飞踏与接下来3秒内兹白造成的月结晶反应伤害擢升[elevated]%。',
        cons: 6,
        data: {
          elevated: 1.6 * (100 - 70)
        }
      }
    ]

    const createdBy = '冰翼'
    return { details, defDmgIdx, mainAttr, defParams, buffs, createdBy }
  },
  "凝光": () => {
    const details = [{
      title: '重击伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2')
    }, {
      title: '璇玑屏伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: 'Q单颗宝石伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['宝石伤害'], 'q')
    }]

    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      title: '凝光被动：穿过璇玑屏获得12%岩伤加成',
      data: {
        dmg: 12
      }
    }]
    return { details, mainAttr, buffs }
  },
  "凯亚": () => {
    const details = [{
      title: '霜袭E伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: 'Q单段伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    }]

    const mainAttr = 'atk,cpct,cdmg'

    const buffs = []
    return { details, mainAttr, buffs }
  },
  "刻晴": () => {
    const details = [{
      title: 'E后重击伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2')
    }, {
      title: 'Q单段伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['连斩伤害2'][0], 'q')
    }, {
      title: 'Q总伤害',
      params: { q: 1 },
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'] + talent.q['连斩伤害'] + talent.q['最后一击伤害'], 'q')
    }, {
      title: 'Q总伤害·超激化',
      params: { q: 1 },
      dmg: ({ talent }, dmg) => {
        let t1j = dmg(talent.q['技能伤害'], 'q', '超激化')
        let t2j = dmg(talent.q['连斩伤害'] / 8, 'q', '超激化')
        let t2 = dmg(talent.q['连斩伤害'] / 8, 'q')
        let t3j = dmg(talent.q['最后一击伤害'], 'q', '超激化')
        return {
          dmg: t1j.dmg + t2j.dmg * 2 + t2.dmg * 6 + t3j.dmg,
          avg: t1j.avg + t2j.avg * 2 + t2.avg * 6 + t3j.avg
        }
      }
    }]

    const defDmgIdx = 3
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '刻晴被动：释放Q获得15%暴击率',
      data: {
        qCpct: 15
      }
    }, {
      title: '刻晴4命：触发雷元素相关反应提升攻击力25%',
      cons: 4,
      data: {
        atkPct: 25
      }
    }, {
      title: '刻晴6命：4层获得24%雷伤加成',
      cons: 6,
      data: {
        dmg: 24
      }
    }, 'aggravate']
    return { details, defDmgIdx, mainAttr, buffs }
  },
  "北斗": () => {
    const details = [{
      title: 'E伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['基础伤害'], 'e')
    }, {
      title: '2层E伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['基础伤害'] + talent.e['受击时伤害提升'] * 2, 'e')
    }, {
      title: 'Q每跳伤害',
      params: { q: true },
      dmg: ({ talent }, dmg) => dmg(talent.q['闪雷伤害'], 'q')
    }, {
      title: 'E弹反护盾量',
      dmg: ({ talent, attr }, { shield }) => shield(talent.e['护盾吸收量2'][0] / 100 * attr.hp + talent.e['护盾吸收量2'][1])
    }, {
      title: 'Q护盾量',
      check: ({ cons }) => cons >= 1,
      dmg: ({ attr }, { shield }) => shield(0.16 * attr.hp)
    }, {
      title: 'Q伤害减免',
      dmg: ({ talent }) => {
        return {
          avg: Format.percent(talent.q['伤害减免'] / 100),
          type: 'text'
        }
      }
    }]

    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      title: '北斗6命：Q持续期间，周围敌人的雷元素抗性降低15%',
      cons: 6,
      data: {
        kx: ({ params }) => params.q ? 15 : 0
      }
    }]
    return { details, mainAttr, buffs }
  },
  "千织": () => {
    const details = [{
      title: 'E后普攻一段',
      dmg: ({ talent }, dmg) => dmg(talent.a['一段伤害'], 'a')
    },{
      title: 'E突刺伤害',
      dmg: ({ talent, attr }, { basic }) => basic(talent.e['上挑攻击伤害2'][0] * attr.atk / 100 + talent.e['上挑攻击伤害2'][1] * attr.def / 100 , 'e')
    },{
      title: 'E人偶伤害',
      dmg: ({ talent, attr }, { basic }) => basic(talent.e['袖伤害2'][0] * attr.atk / 100 + talent.e['袖伤害2'][1] * attr.def / 100 , 'e')
    },{
      title: '2命人偶切斩伤害',
      check: ({ cons }) => cons >= 2,
      dmg: ({ talent, attr }, { basic }) => basic( ( talent.e['袖伤害2'][0] * attr.atk / 100 + talent.e['袖伤害2'][1] * attr.def / 100 ) * 1.7 , 'e')
    },{
      title: 'Q伤害',
      dmg: ({ talent, attr }, { basic }) => basic(talent.q['技能伤害2'][0] * attr.atk / 100 + talent.q['技能伤害2'][1] * attr.def / 100 , 'q')
    }]

    const defDmgIdx = 2
    const mainAttr = 'atk,def,cpct,cdmg,dmg'

    const buffs = [{
      title: '千织天赋：队伍中角色创造岩造物时，获得[dmg]%岩伤加成',
      data: {
        dmg: 20
      }
    },{
      title: '千织6命：普攻造成的伤害提升[aPlus]',
      sort: 9,
      cons: 6,
      data: {
        aPlus: ({ attr }) => attr.def * 235 / 100
      }
    }]

    const createdBy = 'liangshi'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "卡维": () => {
    const details = [{
      title: '画则巧施伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: 'Q后绽放伤害',
      params: { bloom: true },
      dmg: ({ calc, attr }, { reaction }) => {
        return reaction('bloom')
      }
    }]

    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '繁绘隅穹：草原核迸发伤害提升[bloom]%',
      data: {
        bloom: ({ talent }) => talent.q['草原核迸发伤害加成']
      }
    }, {
      title: '卡维4命：卡维触发绽放反应产生的草原核在迸发时造成的伤害提升60%',
      cons: 4,
      data: {
        bloom: ({ params }) => params.bloom ? 60 : 0
      }
    }]
    return { details, mainAttr, buffs }
  },
  "卡齐娜": () => {
    const details = [{
      title: '冲天转转主动伤害',
      dmg: ({ talent, calc, attr }, { basic }) => basic(calc(attr.def) * talent.e['冲天转转搭乘伤害'] / 100, 'e,nightsoul')
    }, {
      title: '冲天转转自动伤害',
      dmg: ({ talent, calc, attr }, { basic }) => basic(calc(attr.def) * talent.e['冲天转转独立伤害'] / 100, 'e,nightsoul')
    }, {
      title: 'Q释放伤害',
      dmg: ({ talent, calc, attr }, { basic }) => basic(calc(attr.def) * talent.q['技能伤害'] / 100, 'q')
    }, {
      check: ({ cons }) => cons >= 6,
      title: '护盾替换摧毁伤害',
      dmg: ({ calc, attr }, { basic }) => basic(calc(attr.def) * 200 / 100, '')
    }]

    const defParams = { Nightsoul: true }
    const mainAttr = 'def,cpct,cdmg,mastery'

    const buffs = [{
      title: '卡齐娜天赋：附近的角色触发「夜魂迸发」,岩元素伤害提升[dmg]%。',
      data: {
        dmg: 20
      }
    }, {
      title: '卡齐娜天赋：冲天转转造成的伤害提升[ePlus]%。',
      sort: 9,
      data: {
        ePlus: ({ calc, attr }) => calc(attr.def) * 20 / 100 ,
        qPlus: ({ calc, attr }) => calc(attr.def) * 20 / 100
      }
    }, {
      title: '卡齐娜4命：领域中的队伍中当前场上角色的防御力提升[defPct]%',
      cons: 4,
      data: {
        defPct: 20
      }
    }]

    const createdBy = 'liangshi'
    return { details, defParams, mainAttr, buffs, createdBy }
  },
  "可莉": () => {
    const details = [{
      title: '【魔导·秘仪】「嘭嘭轰击」伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2')
    }, {
      title: '【魔导·秘仪】「嘭嘭轰击」蒸发伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2', 'vaporize')
    }, {
      title: '单次轰轰火花伤害',
      params: { cons_6: true },
      dmg: ({ talent }, dmg) => dmg(talent.q['轰轰火花伤害'], 'q')
    }, {
      title: '4命Q后额外爆炸伤害',
      params: { cons_4: true, cons_6: true },
      cons: 4,
      dmg: ({}, dmg) => dmg(555)
    }, {
      title: '【魔导·秘仪】6命Q后「嘭嘭轰击」伤害',
      params: { cons_6: true },
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2')
    }, {
      title: '【魔导·秘仪】6命Q后「嘭嘭轰击」蒸发伤害',
      params: { cons_6: true },
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2', 'vaporize')
    }]

    const defParams = { Hexenzirkel: true } // 魔女会成员
    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '可莉天赋：特殊重击「嘭嘭轰击」对比重击伤害提升50%',
      data: {
        a2Dmg: 50
      }
    }, {
      title: '可莉天赋：获得【魔导·秘仪】效果时，3枚「轰轰勋章」使特殊重击「嘭嘭轰击」造成原本150%的伤害。',
      data: {
        a2Multi: 50
      }
    }, {
      title: '可莉1命：攻击与施放技能时，有几率召唤火花。触发该效果后的12秒内，可莉的攻击力提升60%',
      cons: 1,
      data: {
        atkPct: 60
      }
    }, {
      title: '可莉2命：蹦蹦炸弹的诡雷会使敌人的防御力降低23%',
      cons: 2,
      data: {
        enemyDef: 23
      }
    }, {
      check: ({ params }) => params.cons_4 === true,
      title: '可莉4命：触发额外爆炸时，如果可莉在场上，则造成的伤害提升100%',
      cons: 4,
      data: {
        dmg: 100
      }
    }, {
      check: ({ params }) => params.cons_6 === true,
      title: '可莉6命：施放轰轰火花后获得50%火元素伤害加成',
      cons: 6,
      data: {
        dmg: 50
      }
    }, 'vaporize']

    const createdBy = '喵喵 & 冰翼'
    return { details, defParams, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "叶洛亚": () => {
    const details = [
      {
        title: 'E点按伤害',
        dmg: ({ attr, calc, talent }, { basic }) => basic((calc(attr.mastery) * talent.e['点按伤害2'][0] + calc(attr.def) * talent.e['点按伤害2'][1]) / 100, 'e')
      },
      {
        title: 'E长按伤害',
        dmg: ({ attr, calc, talent }, { basic }) => basic((calc(attr.mastery) * talent.e['长按伤害2'][0] + calc(attr.def) * talent.e['长按伤害2'][1]) / 100, 'e')
      },
      {
        title: 'Q技能伤害',
        dmg: ({ attr, calc, talent }, { basic }) => basic((calc(attr.mastery) * talent.q['技能伤害2'][0] + calc(attr.def) * talent.q['技能伤害2'][1]) / 100, 'q')
      },
      {
        title: '(3名水/岩角色)岩元素伤害增加',
        dmg: ({ attr, calc, talent }) => {
          return {
            avg: calc(attr.mastery) * (talent.q['岩元素伤害增加'] + 24) / 100
           }
        }
      },
      {
        title: '(3名水/岩角色)月结晶反应伤害增加',
        dmg: ({ attr, calc, talent }) => {
          return {
            avg: calc(attr.mastery) * (talent.q['月结晶反应伤害增加'] + 160) / 100
          }
        }
      },
      {
        title: '2命阿咚额外伤害',
        cons: 2,
        dmg: ({ attr, calc }, { basic }) => basic((calc(attr.mastery) * 400 + calc(attr.def) * 200) / 100, 'q')
      }
    ]

    const defDmgIdx = 4
    const mainAttr = 'def,cpct,cdmg,mastery'
    const defParams = { Moonsign: 2 }

    const buffs = []

    const createdBy = '冰翼'
    return { details, defDmgIdx, mainAttr, defParams, buffs, createdBy }
  },
  "哥伦比娅": () => {
    const details = [
      {
        params: { Gravity_Interference: true, cons_2: true },
        title: '满buff 特殊重击「月露涤荡」三段总伤害',
        dmg: ({ attr, calc, talent } , { basic }) => basic(calc(attr.hp) * talent.a['月露涤荡伤害'] / 100, '', 'lunarBloom')
      },
      {
        title: 'E技能伤害',
        dmg: ({ attr, calc, talent } , { basic }) => basic(calc(attr.hp) * talent.e['技能伤害'] / 100, 'e')
      },
      {
        params: { Gravity_Interference: true },
        title: '满buff 引力涟漪·持续伤害',
        dmg: ({ attr, calc, talent } , { basic }) => basic(calc(attr.hp) * talent.e['引力涟漪·持续伤害'] / 100, 'e')
      },
      {
        params: { q: true, Gravity_Interference: true, Moonsign_Benediction: true },
        title: '满buff 引力干涉·月感电伤害',
        dmg: ({ attr, calc, talent } , { basic }) => basic(calc(attr.hp) * talent.e['引力干涉·月感电伤害'] / 100, '', 'lunarCharged')
      },
      {
        params: { q: true, Gravity_Interference: true, Moonsign_Benediction: true },
        title: '满buff 引力干涉·月绽放伤害',
        dmg: ({ attr, calc, talent } , { basic }) => basic(calc(attr.hp) * talent.e['引力干涉·月绽放伤害'] / 100, '', 'lunarBloom')
      },
      {
        params: { q: true, Gravity_Interference: true, Moonsign_Benediction: true },
        title: '满buff 引力干涉·月结晶伤害',
        dmg: ({ attr, calc, talent } , { basic }) => basic(calc(attr.hp) * talent.e['引力干涉·月结晶伤害'] / 100, '', 'lunarCrystallize')
      },
      {
        params: { q: true, Gravity_Interference: true, Moonsign_Benediction: true, cons_4: 'lunarCharged' },
        title: '4命满buff 引力干涉·月感电伤害',
        cons: 4,
        dmg: ({ attr, calc, talent } , { basic }) => basic(calc(attr.hp) * talent.e['引力干涉·月感电伤害'] / 100, '', 'lunarCharged')
      },
      {
        params: { q: true, Gravity_Interference: true, Moonsign_Benediction: true, cons_4: 'lunarBloom'  },
        title: '4命满buff 引力干涉·月绽放伤害',
        cons: 4,
        dmg: ({ attr, calc, talent } , { basic }) => basic(calc(attr.hp) * talent.e['引力干涉·月绽放伤害'] / 100, '', 'lunarBloom')
      },
      {
        params: { q: true, Gravity_Interference: true, Moonsign_Benediction: true, cons_4: 'lunarCharged'  },
        title: '4命满buff 引力干涉·月结晶伤害',
        cons: 4,
        dmg: ({ attr, calc, talent } , { basic }) => basic(calc(attr.hp) * talent.e['引力干涉·月结晶伤害'] / 100, '', 'lunarCrystallize')
      }
    ]

    const defDmgIdx = 4
    const mainAttr = 'hp,cpct,cdmg,mastery'
    const defParams = { Moonsign: 2 }

    const buffs = [
      {
        check: ({ params }) => params.q === true,
        title: '哥伦比娅元素爆发：施放元素爆发后，月曜反应伤害将会提升[lunarBloom]%',
        data: {
          lunarBloom: ({ talent }) => talent.q['月曜反应伤害提升'],
          lunarCharged: ({ talent }) => talent.q['月曜反应伤害提升'],
          lunarCrystallize: ({ talent }) => talent.q['月曜反应伤害提升']
        }
      },
      {
        check: ({ params }) => params.Gravity_Interference === true,
        title: '哥伦比娅天赋：触发引力干涉时，使自身的暴击率最高提升[cpct]%',
        data: {
          cpct: 5 * 3
        }
      },
      {
        check: ({ params }) => params.Moonsign_Benediction === true,
        title: '哥伦比娅天赋：基于哥伦比娅的生命值上限，对队伍中角色造成的月曜反应提升[fypct]%的基础伤害',
        sort: 9,
        data: {
          fypct: ({ attr, calc }) => Math.min(calc(attr.hp) / 1000 * 0.2, 7)
        }
      },
      {
        title: '哥伦比娅1命：月曜反应伤害擢升[elevated]%',
        cons: 1,
        data: {
          elevated: 1.5
        }
      },
      {
        title: '哥伦比娅2命：月曜反应伤害擢升[elevated]%。触发引力干涉时，生命值提升[hpPct]%',
        cons: 2,
        data: {
          elevated: 7,
          hpPct: 40
        }
      },
      {
        check: ({ params }) => params.cons_2 === true,
        title: '哥伦比娅2命：【月兆·满辉】触发引力干涉时，队伍中自己的当前场上角色元素精通基于哥伦比娅的生命值上限提升，当前提升值为[mastery]',
        sort: 9,
        cons: 2,
        data: {
          mastery: ({ attr, calc, params }) => ((params.Moonsign || 0) >= 2 ? calc(attr.hp) * 0.35 / 100 : 0)
        }
      },
      {
        title: '哥伦比娅3命：月曜反应伤害擢升[elevated]%',
        cons: 3,
        data: {
          elevated: 1.5
        }
      },
      {
        title: '哥伦比娅4命：月曜反应伤害擢升[elevated]%',
        cons: 4,
        data: {
          elevated: 1.5
        }
      },
      {
        check: ({ params }) => params.cons_4 != null,
        title: '哥伦比娅4命：触发引力干涉时，造成的月曜反应伤害基于哥伦比娅的生命值上限提升，提升值为[fyplus]%',
        cons: 4,
        data: {
          fyplus: ({ attr, calc, params }) => calc(attr.hp) * (params.cons_4 === 'lunarCharged' ? 12.5 : 2.5) / 100
        }
      },
      {
        title: '哥伦比娅5命：月曜反应伤害擢升[elevated]%',
        cons: 5,
        data: {
          elevated: 1.5
        }
      },
      {
        title: '哥伦比娅6命：月曜反应伤害擢升[elevated]%。触发月曜反应后的8秒内，依据参与反应的元素类型，对应元素类型伤害的暴击伤害提升[cdmg]%。',
        cons: 6,
        data: {
          elevated: 7,
          cdmg: 80
        }
      }
    ]

    const createdBy = '冰翼'
    return { details, defDmgIdx, mainAttr, defParams, buffs, createdBy }
  },
  "嘉明": () => {
    const details = [{
      title: '下落攻击·踏云献瑞伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['下落攻击·踏云献瑞伤害'], 'a3')
    }, {
      title: '下落攻击·踏云献瑞蒸发',
      dmg: ({ talent }, dmg) => dmg(talent.e['下落攻击·踏云献瑞伤害'], 'a3', 'vaporize')
    }, {
      title: '猊兽·文仔砸击伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['猊兽·文仔砸击伤害'], 'q')
    }, {
      title: '猊兽·文仔砸击蒸发',
      dmg: ({ talent }, dmg) => dmg(talent.q['猊兽·文仔砸击伤害'], 'q', 'vaporize')
    }]

    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '嘉明天赋：生命值低于50%时,获得[heal]%受治疗加成。生命值高于或等于50%时,下落攻击·踏云献瑞造成的伤害提升[a3Dmg]%。',
      data: {
        heal: 20,
        a3Dmg: 20
      }
    }, {
      title: '嘉明2命：受到治疗溢出,攻击力提升[atkPct]%',
      cons: 2,
      data: {
        atkPct: 20
      }
    }, {
      title: '嘉明6命：下落攻击·踏云献瑞的暴击率提升[a3Cpct]%，暴击伤害提升[a3Cdmg]%',
      cons: 6,
      data: {
        a3Cpct: 20,
        a3Cdmg: 40
      }
    }, 'vaporize']

    const createdBy = 'liangshi'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "坎蒂丝": () => {
    const details = [{
      title: 'E护盾吸收',
      dmg: ({ attr, calc, talent }, { shield }) =>
        shield(calc(attr.hp) * talent.e['护盾吸收量2'][0] / 100 + talent.e['护盾吸收量2'][1])
    }, {
      title: '蓄力E伤害',
      dmg: ({ calc, attr, talent }, { basic }) => basic(calc(attr.hp) * talent.e['蓄力完成伤害'] / 100)
    }, {
      title: 'Q提升普攻伤害',
      dmg: ({ attr, calc }) => {
        return {
          avg: 20 + calc(attr.hp) / 1000 * 0.5,
          unit: '%'
        }
      }
    }]

    const mainAttr = 'hp,atk,cpct,cdmg'

    const buffs = [{
      title: '坎蒂丝2命：E命中敌人提升20%生命值',
      cons: 2,
      data: {
        hpPct: 20
      }
    }, {
      title: '坎蒂丝被动：Q伤害加成基于生命值上限提升[_a]%',
      sort: 9,
      data: {
        _a: ({ attr, calc }) => Math.floor(calc(attr.hp) / 1000) * 0.5
      }
    }]
    return { details, mainAttr, buffs }
  },
  "埃洛伊": () => {
    const details = [{
      title: '附魔普攻第四段',
      dmg: ({ talent }, dmg) => dmg(talent.a['四段伤害'], 'a')
    }, {
      title: 'E冰尘弹伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['冰尘弹伤害'], 'e')
    }, {
      title: 'E冷冻炸弹伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['冷冻炸弹伤害'], 'e')
    }, {
      title: 'Q技能伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    }]

    const buffs = [{
      title: '埃洛伊天赋：冰驰状态提高普攻伤害',
      data: {
        aDmg: ({ talent }) => talent.e['冰驰普通攻击伤害提升']
      }
    }]
    return { details, buffs }
  },
  "基尼奇": () => {
    const details = [{
      title: '迴猎贯鳞炮伤害',
      params: { Scalespiker: true },
      dmg: ({ talent }, dmg) => dmg(talent.e['迴猎贯鳞炮伤害'], 'e,nightsoul')
    }, {
      check: ({ cons }) => cons >= 2,
      title: '2命首次猎贯鳞炮',
      params: { Scalespiker: true, cons2: true },
      dmg: ({ talent }, dmg) => dmg(talent.e['迴猎贯鳞炮伤害'], 'e,nightsoul')
    }, {
      title: 'Q释放伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q,nightsoul')
    }, {
      title: 'Q龙息伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['龙息伤害'], 'q,nightsoul')
    }, {
      title: 'Q龙息激化',
      dmg: ({ talent }, dmg) => dmg(talent.q['龙息伤害'], 'q,nightsoul', 'spread')
    }]

    const defParams = { Nightsoul: true }
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      check: ({ params }) => params.Scalespiker === true,
      title: '焰灵的契约：2层buff使迴猎贯鳞炮造成的伤害提高[ePlus]',
      data: {
        ePlus: ({ calc , attr }) => calc(attr.atk) * 320 / 100 * 2
      }
    }, {
      check: ({ params }) => params.Scalespiker === true,
      title: '基尼奇1命：迴猎贯鳞炮的暴击伤害提升[eCdmg]%',
      cons: 1,
      data: {
        eCdmg: 100
      }
    }, {
      title: '基尼奇2命：元素战技命中敌人使其草元素抗性降低[kx]%,首次猎贯鳞炮的伤害提升[eDmg]%',
      cons: 2,
      data: {
        kx: 30,
        eDmg: ({ params }) => params.cons2 === true ? 100 : 0
      }
    }, {
      title: '基尼奇4命：向伟大圣龙致意造成的伤害提升[qDmg]%',
      cons: 4,
      data: {
        qDmg: 70
      }
    }]

    const createdBy = 'liangshi'
    return { details, defParams, mainAttr, buffs, createdBy }
  },
  "塔利雅": () => {
    const details = [{
      title: 'E技能伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: 'Q技能伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    }, {
      title: 'Q护盾吸收量',
      dmg: ({ attr, calc, talent }, { shield }) => shield(talent.q['圣眷护盾吸收量2'][0] * calc(attr.hp) / 100 + talent.q['圣眷护盾吸收量2'][1])
    }, {
      title: '场上角色攻击速度提升',
      dmg: ({ cons, attr, calc }) => {
        let num = cons == 6 ? 0.1 : 0
        return {
          avg: Format.percent(Math.min(calc(attr.hp) / 1000 * 0.005, 0.2) + num),
          type: 'text'
        }
      }
    }]

    const defDmgIdx = 2
    const mainAttr = 'atk,hp,cpct,cdmg'

    const buffs = [{
      title: '塔利雅2命：处于「祝颂」效果唤出的圣眷护盾庇佑下时，场上角色的护盾强效提升[shield]%',
      cons: 2,
      data: {
        shield: 25,
      }
    }]

    const createdBy = '冰翼'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "夏沃蕾": () => {
    const details = [{
      title: 'E点按伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['点按伤害'], 'e')
    }, {
      title: 'E长按伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['长按伤害'], 'e')
    }, {
      title: '「超量装药弹头」伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['「超量装药弹头」伤害'], 'e')
    }, {
      title: '2命额外伤害',
      check: ({ cons }) => cons >= 2,
      dmg: ({ calc, attr }, { basic }) => basic(calc(attr.atk) * 120 / 100, 'e')
    }, {
      title: 'E持续治疗',
      dmg: ({ attr, calc, talent }, { heal }) => heal(talent.e['持续治疗量2'][0] * calc(attr.hp) / 100 + talent.e['持续治疗量2'][1] * 1)
    }, {
      title: 'Q释放伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['爆轰榴弹伤害'], 'q')
    }, {
      title: 'Q分裂弹伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['二重毁伤弹伤害'], 'q')
    }, {
      title: '6命额外治疗',
      check: ({ cons }) => cons >= 6,
      dmg: ({ attr, calc }, { heal }) => heal(calc(attr.hp) * 10 / 100)
    }]

    const defDmgIdx = 4
    const mainAttr = 'atk,hp,cpct,cdmg,heal'

    const buffs = [{
      title: '夏沃蕾天赋：火元素与雷元素抗性降低[kx]%',
      data: {
        kx: 40
      }
    }, {
      title: '夏沃蕾天赋：发射「超量装药弹头」后攻击力提升[atkPct]%',
      data: {
        atkPct: ({ calc, attr }) => Math.min(40, calc(attr.hp) / 1000)
      }
    }, {
      title: '夏沃蕾6命：队伍中的角色受到「近迫式急促拦射」的治疗后，获得[dmg]%火元素伤害加成与雷元素伤害加成',
      cons: 6,
      data: {
        dmg: 60
      }
    }]

    const createdBy = 'liangshi'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "夏洛蒂": () => {
    const details = [{
      title: 'E点按拍照伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['点按拍照伤害'], 'e')
    }, {
      title: 'E长按拍照伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['长按拍照伤害'], 'e')
    }, {
      title: 'Q释放伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    }, {
      title: 'Q释放治疗量',
      dmg: ({ talent, attr }, { heal }) => heal(talent.q['施放治疗量2'][0] / 100 * attr.atk + talent.q['施放治疗量2'][1])
    }, {
      title: 'Q持续治疗量',
      dmg: ({ talent, attr }, { heal }) => heal(talent.q['相机持续治疗量2'][0] / 100 * attr.atk + talent.q['相机持续治疗量2'][1])
    }, {
      title: '六命额外治疗量',
      cons: 6,
      dmg: ({ attr }, { heal }) => heal(0.42 * attr.atk)
    }]

    const mainAttr = 'atk,cpct,cdmg,heal'
    const defDmgIdx = 3

    const buffs = [{
      title: '天赋-多样性调查：按队伍存在2位枫丹角色，2位非枫丹角色计算，自身获得[heal]%治疗加成，[dmg]%冰元素伤害加成',
      data: {
        heal: 5,
        dmg: 10
      }
    }, {
      title: '夏洛蒂2命：E攻击命中3名及以上敌人时，自身攻击力提升[atk]%',
      cons: 2,
      data: {
        atk: 30
      }
    }, {
      title: '夏洛蒂4命：Q命中带有E印记的敌人时，Q造成的伤害提升[qDmg]%',
      cons: 4,
      data: {
        qDmg: 10
      }
    }, {
      title: '夏洛蒂6命：场上角色普攻或重击命中E标记敌人时，产生相当于夏洛蒂42%攻击的额外治疗',
      cons: 6
    }]

    const createdBy = 'Aluxes'
    return { details, mainAttr, defDmgIdx, buffs, createdBy }
  },
  "多莉": () => {
    const details = [{
      title: '断除烦恼炮总伤害',
      dmg: ({ talent, cons }, dmg) => dmg(talent.e['断除烦恼炮伤害'] + talent.e['售后服务弹伤害'] * (cons >= 1 ? 3 : 2), 'e')
    }, {
      title: 'Q每跳恢复生命',
      dmg: ({ talent, calc, attr }, {
        heal
      }) => heal(talent.q['持续治疗量2'][0] * calc(attr.hp) / 100 + talent.q['持续治疗量2'][1] * 1)
    }]

    const defDmgIdx = 1
    const mainAttr = 'atk,hp,cpct,cdmg'

    const buffs = [{
      title: '多莉1命：断除烦恼炮命中后增加一枚炮弹',
      cons: 1
    }, {
      title: '多莉4命：角色生命值低于50%时，获得50%治疗加成',
      cons: 4,
      data: {
        healInc: 50
      }
    }]
    return { details, defDmgIdx, mainAttr, buffs }
  },
  "夜兰": () => {
    const details = [{
      title: '破局矢伤害',
      dmg: ({ talent, attr, calc }, { basic }) => basic(calc(attr.hp) * talent.a['破局矢伤害'] / 100, 'a2')

    }, {
      title: 'E络命丝伤害',
      dmg: ({ talent, attr, calc }, { basic }) => basic(calc(attr.hp) * talent.e['技能伤害'] / 100, 'e')

    }, {
      title: 'E络命丝蒸发',
      dmg: ({ talent, attr, calc }, { basic }) => basic(calc(attr.hp) * talent.e['技能伤害'] / 100, 'e', '蒸发')

    }, {
      title: 'Q协同单段伤害',
      params: { q: true },
      dmg: ({ talent, attr, calc, cons }, { basic }) => {
        return basic(calc(attr.hp) * (talent.q['玄掷玲珑伤害'] / 3 / 100), 'q')
      }
    }, {
      title: 'Q协同单段蒸发',
      params: { q: true },
      dmg: ({ talent, attr, calc, cons }, { basic }) => {
        return basic(calc(attr.hp) * (talent.q['玄掷玲珑伤害'] / 3 / 100), 'q', '蒸发')
      }
    }]

    const defDmgIdx = 4
    const mainAttr = 'hp,cpct,cdmg,mastery'

    const buffs = [{
      title: '夜兰被动：有4个不同元素类型角色时，夜兰生命值上限提高30%',
      data: {
        hpPct: 30
      }
    }, {
      title: '夜兰4命：E络命丝爆发提高生命值，满Buff下提高40%',
      cons: 4,
      data: {
        hpPct: 40
      }
    }, {
      title: '夜兰被动：Q持续过程中满层Buff下提高伤害50%',
      data: {
        dmg: ({ params }) => params.q ? 50 : 0
      }
    }, 'vaporize']
    return { details, defDmgIdx, mainAttr, buffs }
  },
  "奇偶·女性": () => {
    const details = [{
        title: 'E伤害',
        dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
      },
      {
        title: 'Q释放伤害',
        dmg: ({ talent }, dmg) => dmg(talent.q['禁限区域生成伤害'], 'q')
      },
      {
        title: 'Q领域进入伤害',
        dmg: ({ talent }, dmg) => dmg(talent.q['禁限区域踏入伤害'], 'q')
      },
      {
        title: '离场引爆领域伤害',
        dmg: ({}, dmg) => dmg(200, 'q')
      }
    ]

    const defDmgIdx = 1
    const mainAttr = 'atk,dmg,cpct,cdmg,mastery'
    return { details, defDmgIdx, mainAttr }
  },
  "奇偶·男性": () => {
    const details = [{
        title: 'E伤害',
        dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
      },
      {
        title: 'Q释放伤害',
        dmg: ({ talent }, dmg) => dmg(talent.q['禁限区域生成伤害'], 'q')
      },
      {
        title: 'Q领域进入伤害',
        dmg: ({ talent }, dmg) => dmg(talent.q['禁限区域踏入伤害'], 'q')
      },
      {
        title: '离场引爆领域伤害',
        dmg: ({}, dmg) => dmg(200, 'q')
      }
    ]

    const defDmgIdx = 1
    const mainAttr = 'atk,dmg,cpct,cdmg,mastery'
    return { details, defDmgIdx, mainAttr }
  },
  "奈芙尔": () => {
    const details = [
      {
        title: '满层满辉E后幻戏自身一段',
        params: { Phantasm_Performance: true },
        dmg: ({ talent, calc, attr, cons, params }, { basic }) => basic(((calc(attr.atk) * talent.e['幻戏自身一段伤害2'][0] + calc(attr.mastery) * talent.e['幻戏自身一段伤害2'][1]) / 100) * (1 + Math.min((params.Veil_of_Falsehood || 99), (cons >= 2 ? 5 : 3)) * 0.08), 'a2')
      },
      {
        title: '满层满辉E后幻戏自身二段',
        params: { Phantasm_Performance: true },
        dmg: ({ talent, calc, attr, cons, params }, { basic }) => {
          let c0 = basic(((calc(attr.atk) * talent.e['幻戏自身二段伤害2'][0] + calc(attr.mastery) * talent.e['幻戏自身二段伤害2'][1]) / 100) * (1 + Math.min((params.Veil_of_Falsehood || 99), (cons >= 2 ? 5 : 3)) * 0.08), 'a2')
          let c6 = basic((calc(attr.mastery) * 85 / 100) * (1 + Math.min((params.Veil_of_Falsehood || 99), (cons >= 2 ? 5 : 3)) / 10), '', 'lunarBloom')
          return {
            dmg: cons >= 6 ? c6.dmg : c0.dmg,
            avg: cons >= 6 ? c6.avg : c0.avg
          }
        }
      },
      {
        title: '满层满辉E后幻戏协同一段',
        params: { Lunar: true, Phantasm_Performance: true },
        dmg: ({ talent, calc, attr, cons, params }, { basic }) => basic((calc(attr.mastery) * talent.e['幻戏虚影一段'] / 100) * (1 + Math.min((params.Veil_of_Falsehood || 99), (cons >= 2 ? 5 : 3)) * 0.08), '', 'lunarBloom')
      },
      {
        title: '满层满辉E后幻戏协同二段',
        params: { Lunar: true, Phantasm_Performance: true },
        dmg: ({ talent, calc, attr, cons, params }, { basic }) => basic((calc(attr.mastery) * talent.e['幻戏虚影二段'] / 100) * (1 + Math.min((params.Veil_of_Falsehood || 99), (cons >= 2 ? 5 : 3)) * 0.08), '', 'lunarBloom')
      },
      {
        title: '满层满辉E后幻戏协同三段',
        params: { Lunar: true, Phantasm_Performance: true },
        dmg: ({ talent, calc, attr, cons, params }, { basic }) => basic((calc(attr.mastery) * talent.e['幻戏虚影三段'] / 100) * (1 + Math.min((params.Veil_of_Falsehood || 99), (cons >= 2 ? 5 : 3)) * 0.08), '', 'lunarBloom')
      },
      {
        title: 'Q一段伤害',
        dmg: ({ talent, calc, attr }, { basic }) => basic((calc(attr.atk) * talent.q['一段伤害2'][0] + calc(attr.mastery) * talent.q['一段伤害2'][1]) / 100, 'q')
      },
      {
        title: 'Q二段伤害',
        dmg: ({ talent, calc, attr }, { basic }) => basic((calc(attr.atk) * talent.q['二段伤害2'][0] + calc(attr.mastery) * talent.q['二段伤害2'][1]) / 100, 'q')
      },
      {
        title: '绽放伤害',
        params: { Moonsign: 1 },
        dmg: ({}, { reaction }) => reaction('bloom')
      }
    ]

    const defDmgIdx = 4
    const mainAttr = 'atk,cpct,cdmg,mastery'
    const defParams = { Moonsign: 3 }
    const buffs = [
      {
        title: '奈芙尔天赋：处于满辉时，[buff]层「伪秘之帷」使元素精通提升[mastery]',
        data: {
          buff: ({ params, cons }) => Math.min((params.Veil_of_Falsehood || 99), (cons >= 2 ? 5 : 3)),
          mastery: ({ params, cons }) => (params.Veil_of_Falsehood || 99) >= (cons >= 2 ? 5 : 3) ? 100 : 0
        }
      },
      {
        check: ({ params }) => params.Lunar === true,
        title: '奈芙尔天赋：[月兆祝赐 · 廊下暮影] 触发绽放反应时转为触发月绽放反应,基础伤害提升[fypct]',
        sort: 9,
        data: {
          fypct: ({ attr, calc }) => Math.min((calc(attr.mastery) * 0.0175), 14)
        }
      },
      {
        title: '奈芙尔技能：「伪秘之帷」使元素爆发伤害提升[qDmg]%',
        data: {
          qDmg: ({ talent, params, cons }) => talent.q['伤害提升'] * Math.min(((params.Veil_of_Falsehood || 99)), (cons >= 2 ? 5 : 3))
        }
      },
      {
        check: ({ params }) => params.Lunar === true && params.Phantasm_Performance === true,
        title: '奈芙尔1命：幻戏造成的月绽放反应基础伤害提升[fyplus]',
        cons: 1,
        data: {
          fyplus: ({ attr, calc, cons, params }) => (calc(attr.mastery) * 60 / 100) * Math.min((1 + (params.Veil_of_Falsehood || 99) / 10), (cons >= 2 ? 1.4 : 1.24))
        }
      },
      {
        title: '奈芙尔2命：元素精通额外提升[mastery]',
        cons: 2,
        data: {
          mastery: ({ params }) => (params.Veil_of_Falsehood || 99) >= 5 ? 100 : 0
        }
      },
      {
        title: '奈芙尔4命：附近敌人的元素抗性降低[kx]%',
        cons: 4,
        data: {
          kx: 20
        }
      },
      {
        check: ({ params }) => params.Lunar === true,
        title: '奈芙尔6命：处于满辉时月绽放反应伤害擢升[elevated]%',
        cons: 6,
        data: {
          elevated: ({ params }) => ((params.Moonsign || 0) >= 2 ? 15 : 0)
        }
      }
    ]

    const createdBy = 'kvcfdd'
    return { details, defDmgIdx, mainAttr, defParams, buffs, createdBy }
  },
  "奥黛塔": () => {
    const details = [
      {
        title: 'EE破晓终奏星超导伤害',
        params: { skills_1: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(calc(attr.atk) * talent.e['破晓终奏星超导/星扩散伤害'][0] / 100, '', 'stellarConduct')
      },
      {
        title: 'Q后EE破晓终奏星超导伤害',
        params: { skills_1: true, q: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(calc(attr.atk) * talent.e['破晓终奏星超导/星扩散伤害'][0] / 100, '', 'stellarConduct')
      },
      {
        title: '后台E拂羽舞步星超导伤害',
        params: { cons_6: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(calc(attr.atk) * talent.e['拂羽舞步星超导/星扩散伤害'][0] / 100, '', 'stellarConduct')
      },
      {
        title: '后台E旋翼舞步星超导伤害',
        params: { cons_6: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(calc(attr.atk) * talent.e['旋翼舞步星超导/星扩散伤害'][0] / 100, '', 'stellarConduct')
      },
      {
        title: 'Q后后台E拂羽舞步星超导伤害',
        params: { cons_6: true, q: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(calc(attr.atk) * talent.e['拂羽舞步星超导/星扩散伤害'][0] / 100, '', 'stellarConduct')
      },
      {
        title: 'Q后后台E旋翼舞步星超导伤害',
        params: { cons_6: true, q: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(calc(attr.atk) * talent.e['旋翼舞步星超导/星扩散伤害'][0] / 100, '', 'stellarConduct')
      },
      {
        cons: 1,
        title: '1命额外星超导伤害',
        params: { skills_1: true },
        dmg: ({ attr, calc }, { basic }) => basic(calc(attr.atk) * 300 / 100, '', 'stellarConduct')
      },
      {
        cons: 4,
        title: '4命后台协同星超导伤害',
        params: { cons_6: true },
        dmg: ({ attr, calc }, { basic }) => basic(calc(attr.atk) * 66 / 100, '', 'stellarConduct')
      }
    ]

    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [
      {
        title: '双冰共鸣：攻击冰元素附着或冻结状态下的敌人时，暴击率提高[cpct]%',
        data: {
          cpct: 15
        }
      },
      {
        check: ({ params }) => params.q === true,
        title: '奥黛塔元素爆发：提升奥黛塔造成的星烁反应伤害[stellarConduct]%',
        data: {
          stellarConduct: ({ talent }) => talent.q['雪鹄之梦星烁反应伤害提升']
        }
      },
      {
        check: ({ params }) => params.skills_1 === true,
        title: '奥黛塔天赋：召唤独舞倒影时，还会获得华彩，总共提供[stellarConduct]%的星烁反应伤害提升',
        data: {
          stellarConduct: ({ cons }) => (cons >= 1 ? 6 : 4) * 15
        }
      },
      {
        title: '奥黛塔天赋：基于奥黛塔的攻击力超过1000点的部分，奥黛塔造成的星烁反应伤害额外造成原本[multi]%的伤害',
        sort: 9,
        data: {
          multi: ({ attr, calc }) => Math.min((Math.max(calc(attr.atk) - 1000, 0)) / 100 * 1.5, 30)
        }
      },
      {
        title: '奥黛塔天赋：基于奥黛塔的攻击力，对队伍中角色造成的星超导反应提升[fypct]%的基础伤害',
        sort: 9,
        data: {
          fypct: ({ attr, calc }) => Math.min(calc(attr.atk) / 100 * 0.7, 14)
        }
      },
      {
        cons: 2,
        check: ({ params }) => params.skills_1 === true,
        title: '奥黛塔2命：召唤独舞倒影时，还会获得华彩，使角色的攻击力提升[atkPct]%',
        data: {
          atkPct: 7 * 6
        }
      },
      {
        cons: 2,
        title: '奥黛塔2命：独舞倒影附近敌人的对应元素抗性还会降低[kx]%',
        data: {
          kx: 20
        }
      },
      {
        cons: 6,
        check: ({ params }) => params.cons_6 === true,
        title: '奥黛塔6命：奥黛塔赋予队伍中附近的所有角色华彩时，自己的华彩不再会减少',
        data: {
          stellarConduct: 6 * 15,
          atkPct: 7 * 6
        }
      },
      {
        cons: 6,
        title: '奥黛塔6命：奥黛塔对敌人造成的星烁反应伤害总共擢升[elevated]%',
        data: {
          elevated: 20
        }
      }
    ]

    const createdBy = '冰翼'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "妮露": () => {
    const details = [{
      title: '水月伤害',
      params: { sy: true },
      dmg: ({ talent, calc, attr }, { basic }) => basic(calc(attr.hp) * talent.e['水月/水轮伤害2'][0] / 100, 'e')
    }, {
      title: '水月蒸发伤害',
      params: { sy: true },
      dmg: ({ talent, calc, attr }, { basic }) => basic(calc(attr.hp) * talent.e['水月/水轮伤害2'][0] / 100, 'e', '蒸发')
    }, {
      title: '剑舞步三段伤害',
      dmg: ({ talent, calc, attr, cons }, { basic }) => {
        let pct = talent.e['剑舞步/旋舞步一段伤害2'][0] * 1 + talent.e['剑舞步/旋舞步二段伤害2'][0] * 1
        let ret1 = basic(calc(attr.hp) * pct / 100, 'e')
        let dynamicDmg = 0
        if (cons >= 1) {
          dynamicDmg = 65
        }
        let ret2 = basic(calc(attr.hp) * talent.e['水月/水轮伤害2'][0] / 100, 'e', false, { dynamicDmg })
        return {
          dmg: ret1.dmg + ret2.dmg,
          avg: ret2.avg + ret2.avg
        }
      }
    }, {
      title: 'Q两段总伤害',
      dmg: ({ talent, calc, attr }, { basic }) => basic(calc(attr.hp) * (talent.q['技能伤害'] + talent.q['永世流沔伤害']) / 100, 'q')
    }, {
      title: 'Q两段总蒸发伤害',
      dmg: ({ talent, calc, attr }, { basic }) => basic(calc(attr.hp) * (talent.q['技能伤害'] + talent.q['永世流沔伤害']) / 100, 'q', '蒸发')
    }, {
      title: '丰穰之核伤害',
      params: { bloom: true },
      dmg: ({ calc, attr }, { reaction }) => {
        return reaction('bloom')
      }
    }]

    const mainAttr = 'hp,atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '天赋-折旋落英之庭：元素精通提升100点',
      data: {
        mastery: ({ params }) => params.bloom ? 100 : 0
      }
    }, {
      title: '天赋-翩舞永世之梦：丰穰之核增伤[bloom]%',
      sort: 9,
      data: {
        bloom: ({ attr }) => Math.min(400, attr.hp <= 30000 ? 0 : (attr.hp - 30000) / 1000 * 9)
      }
    }, {
      title: '妮露1命：水月造成的伤害提升65%',
      cons: 1,
      data: {
        eDmg: ({ params }) => params.sy ? 65 : 0
      }
    }, {
      title: '妮露2命：金杯的丰馈下降低敌人35%水抗与草抗',
      cons: 2,
      data: {
        kx: 35
      }
    }, {
      title: '妮露4命：第三段舞步命中敌人Q伤害提高50%',
      cons: 4,
      data: {
        qDmg: 50
      }
    }, {
      title: '妮露6命：提高暴击[cpct]%，爆伤[cdmg]%',
      cons: 6,
      sort: 9,
      data: {
        cpct: ({ attr }) => Math.min(30, attr.hp / 1000 * 0.6),
        cdmg: ({ attr }) => Math.min(60, attr.hp / 1000 * 1.2)
      }
    }, 'vaporize']
    return { details, mainAttr, buffs }
  },
  "娜维娅": () => {
    const details = [{
      title: 'E后普通攻击一段',
      dmg: ({ talent }, dmg) => dmg(talent.a['一段伤害'], 'a')
    },{
      title: '0消耗典仪式晶火',
      dmg: ({ talent }, dmg) => dmg(talent.e['玫瑰晶弹基础伤害'], 'e')
    },{
      title: '3消耗典仪式晶火',
      params: { jp: 3 },
      dmg: ({ talent }, dmg) => dmg(talent.e['玫瑰晶弹基础伤害'] * 2 , 'e')
    },{
      title: '6消耗典仪式晶火',
      params: { jp: 6 },
      dmg: ({ talent }, dmg) => dmg(talent.e['玫瑰晶弹基础伤害'] * 2 , 'e')
    },{
      title: '如霰澄天的鸣礼伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    },{
      title: '支援炮击伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['支援炮击伤害'], 'q')
    }]

    const defDmgIdx = 3
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      check: ({ params }) => params.jp > 3 ,
      title: '典仪式晶火：消耗[_count]枚弹片将使本次射击造成的伤害额外提升[eDmg]%',
      data: {
        _count: ({ params }) => params.jp ,
        eDmg: ({ params }) => ( params.jp - 3 ) * 15
      }
    },{
      title: '娜维娅天赋：施放典仪式晶火后娜维娅的普攻,重击，下落攻击造成的伤害提升[aDmg]%',
      data: {
        aDmg: 40,
        a2Dmg: 40,
        a3Dmg: 40
      }
    },{
      title: '娜维娅天赋：队伍中存在三位火雷冰水元素角色,攻击力提升[atkPct]%',
      data: {
        atkPct: 40
      }
    },{
      check: ({ params }) => params.jp !== undefined ,
      title: '娜维娅2命：施放典仪式晶火时消耗「裂晶弹片」使本次典仪式晶火的暴击率提升[eCpct]%',
      cons: 2,
      data: {
        eCpct : ({ params }) => Math.min( 36 , params.jp * 12 )
      }
    },{
      title: '娜维娅4命：被如霰澄天的鸣礼命中的敌人抗性降低[kx]%',
      cons: 4,
      data: {
        kx: 20
      }
    },{
      check: ({ params }) => params.jp > 3 ,
      title: '娜维娅6命：消耗[_count]枚弹片,使典仪式晶火的暴击伤害提升[eCdmg]%',
      cons: 6,
      data: {
        _count: ({ params }) => params.jp ,
        eCdmg : ({ params }) => Math.min( 135 , ( params.jp - 3 ) * 45 )
      }
    }]

    const createdBy = 'liangshi'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "安柏": () => {
    const details = [{
      title: '重击伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['满蓄力瞄准射击'], 'a2')
    }, {
      title: '兔兔伯爵爆炸',
      dmg: ({ talent }, dmg) => dmg(talent.e['爆炸伤害'], 'e')
    }, {
      title: '兔兔伯爵蒸发',
      dmgKey: 'e',
      check: ({ cons }) => cons < 2,
      dmg: ({ talent }, dmg) => dmg(talent.e['爆炸伤害'], 'e', 'vaporize')
    }, {
      title: '引爆兔兔伯爵蒸发',
      cons: 2,
      dmgKey: 'e',
      params: { e: true },
      dmg: ({ talent }, dmg) => dmg(talent.e['爆炸伤害'], 'e', 'vaporize')
    }, {
      title: 'Q箭雨总伤害',
      params: { q: true },
      dmg: ({ talent }, dmg) => dmg(talent.q['箭雨总伤害'], 'q')
    }]

    const mainAttr = 'atk,cpct,cdmg,mastery'
    const defDmgKey = 'e'

    const buffs = [{
      title: '安柏天赋：命中弱点后攻击力提升15%',
      data: {
        atkPct: 15
      }
    }, {
      title: '安柏被动：Q暴击率提高10%',
      data: {
        qCpct: 10
      }
    }, {
      title: '安柏2命：瞄准引爆兔兔伯爵伤害提高200%',
      cons: 2,
      data: {
        eDmg: ({ params }) => params.e ? 200 : 0
      }
    }, 'vaporize']
    return { details, mainAttr, defDmgKey, buffs }
  },
  "宵宫": () => {
    const details = [{
      title: '开E后首段普攻',
      params: { num: 1 },
      dmg: ({ talent }, dmg) => dmg(talent.a['一段伤害'], 'a')
    }, {
      title: '开E满Buff普攻尾箭',
      params: { num: 10 },
      dmg: ({ talent }, dmg) => dmg(talent.a['五段伤害'], 'a')
    }, {
      title: '开E满Buff尾箭蒸发',
      params: { num: 10 },
      dmg: ({ talent }, dmg) => dmg(talent.a['五段伤害'], 'a', 'vaporize')
    }]

    const defDmgIdx = 2
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '焰硝庭火舞：开启E后额外提升普通[aMulti]%伤害',
      data: {
        aMulti: ({ talent }) => talent.e['炽焰箭伤害'] - 100
      }
    }, {
      title: '宵宫被动：袖火百景图10层提高20%火伤加成',
      data: {
        dmg: ({ params }) => params.num ? params.num * 2 : 20
      }
    }, {
      title: '宵宫2命：宵宫造成暴击后获得25%火伤加成',
      cons: 2,
      data: {
        dmg: ({ params }) => params.num > 1 ? 25 : 0
      }
    }, 'vaporize']
    return { details, defDmgIdx, mainAttr, buffs }
  },
  "尼可": () => {
    const details = [{
      title: "E释放伤害",
      dmg: ({ talent }, dmg) => dmg(talent.e["技能伤害"], "e")
    }, {
      title: "E护盾吸收量",
      dmg: ({ talent, calc, attr }, { shield }) => shield(talent.e["护盾吸收量2"][0] * calc(attr.atk) / 100 + talent.e["护盾吸收量2"][1] * 1)
    }, {
      title: "E攻击力提升",
      params: { "虚己之赐": false, "圣祝之引": false },
      dmg: ({ talent, calc, attr, cons }) => {
        return {
          avg: Math.min(talent.e["虚己之赐攻击力加成比例"] * calc(attr.atk) / 100, talent.e["虚己之赐攻击力加成上限"]) + 300 + (cons >= 2 ? 300 : 0)
        }
      }
    }, {
      title: "Q释放伤害",
      dmg: ({ talent }, dmg) => dmg(talent.q["技能伤害"], "q")
    }, {
      title: "Q协同伤害（自身）",
      dmg: ({ talent }, dmg) => dmg(talent.q["奥迹造影伤害"] + 150, "")
    }, {
      check: ({ cons }) => cons > 0,
      title: "1命协同伤害（自身）",
      dmg: ({ talent }, dmg) => dmg(600, "")
    }]

    const defParams = { "虚己之赐": true, "圣祝之引": true, Hexenzirkel: true }
    const defDmgIdx = 1
    const mainAttr = "atk,cpct,cdmg,dmg"

    const buffs = [{
      check: ({ params }) => params["圣祝之引"] === true,
      title: "尼可技能：获得虚己之赐效果，提升[atkPlus]点攻击力",
      data: {
        atkPlus: ({ talent, calc, attr }) => Math.min(talent.e["虚己之赐攻击力加成比例"] * calc(attr.atk) / 100, talent.e["虚己之赐攻击力加成上限"])
      }
    }, {
      check: ({ params }) => params["圣祝之引"] === true,
      title: "尼可天赋：施放元素战技后拥有圣祝之引，额外提升[atkPlus]点攻击力",
      data: {
        atkPlus: 300
      }
    }, {
      title: "尼可2命：虚己之赐还会额外提升[atkPlus]攻击力,拥有圣祝之引使附近敌人的对应元素抗性降低[kx]%",
      cons: 2,
      data: {
        atkPlus: ({ params }) => params["虚己之赐"] === true ? 300 : 0,
        kx: ({ params }) => params["圣祝之引"] === true ? 25 : 0
      }
    }, {
      title: "尼可4命：拥有圣祝之引时赋予「先导之佑」, 普通攻击、重击、下落攻击、元素战技与元素爆发造成的伤害提升[aPlus]",
      cons: 4,
      data: {
        aPlus: ({ calc, attr }) => calc(attr.atk) / 100 * 70,
        a2Plus: ({ calc, attr }) => calc(attr.atk) / 100 * 70,
        a3Plus: ({ calc, attr }) => calc(attr.atk) / 100 * 70,
        ePlus: ({ calc, attr }) => calc(attr.atk) / 100 * 70,
        qPlus: ({ calc, attr }) => calc(attr.atk) / 100 * 70
      }
    }, {
      title: "尼可6命：拥有圣祝之引,造成的伤害无视敌人[ignore]%防御力",
      cons: 6,
      data: {
        ignore: 40
      }
    }]

    const createdBy = "liangshi"
    return { details, defParams, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "布伦妮": () => {
    const details = [{
      title: "「狩灾誓锤」提升队友伤害",
      dmg: ({ calc, attr }) => {
        return {
          avg: Math.round(Math.min(Math.max((calc(attr.atk) - 2000) * 0.025, 0), 50) * 100) / 100 + "%",
          type: "text"
        }
      }
    }, {
      title: "E一段伤害",
      dmg: ({ talent }, dmg) => dmg(talent.e["叮铃铃·猎魔之音伤害"], "e")
    }, {
      title: "E二段伤害",
      dmg: ({ talent }, dmg) => dmg(talent.e["咚锵锵·裁魔之惩伤害"], "e")
    }, {
      title: "Q释放伤害",
      dmg: ({ talent }, dmg) => dmg(talent.q["技能伤害"], "q")
    }, {
      title: "Q协同伤害",
      dmg: ({ talent }, dmg) => dmg(talent.q["诱巫饵铃伤害"], "q")
    }]

    const defDmgIdx = 0
    const mainAttr = "atk,cpct,cdmg,mastery,dmg"
    const defParams = { Hexenzirkel: true }

    const buffs = [{
      title: "布伦妮天赋：队伍中魔导角色触发扩散反应，攻击力提升[atkPct]%",
      data: {
        atkPct: 90
      }
    }, {
      title: "布伦妮2命：「诱巫饵铃」和经过元素转化的「狩灾誓锤」命中敌人时，攻击力提升[atkPct]%",
      cons: 2,
      data: {
        atkPct: 40
      }
    }, {
      title: "布伦妮6命：处于「振铃鼓舞」下触发任意元素反应,攻击力提升[atkPlus]",
      cons: 6,
      data: {
        atkPlus: 350
      }
    }]

    const createdBy = "liangshi"
    return { details, defDmgIdx, mainAttr, defParams, buffs, createdBy }
  },
  "希格雯": () => {
    const details = [{
        title: '后台队友E伤害提升值',
      dmg: ({ attr, cons }) => {
        let cons1 = cons >= 1 ? 100 : 80
        let count = cons >= 1 ? 3500 : 2800
        return {
        avg: Math.max(0, Math.min(((attr.hp - 30000) / 1000 * cons1), count))
        }
      }
    }, {
      title: '长按E弹跳伤害',
      params: { BondOfLifeGet: 2 },
      dmg: ({ talent, attr }, { basic }) => basic(attr.hp * talent.e['激愈水球伤害'] / 100, 'e')
    }, {
      title: '长按E弹跳蒸发',
      params: { BondOfLifeGet: 2 },
      dmg: ({ talent, attr }, { basic }) => basic(attr.hp * talent.e['激愈水球伤害'] / 100, 'e', 'vaporize')
    }, {
      title: '长按E弹跳治疗',
      params: { BondOfLifeGet: 2 },
      dmg: ({ talent, attr }, { heal }) => heal((attr.hp * talent.e['激愈水球治疗量2'][0] / 100 + talent.e['激愈水球治疗量2'][1]) * 1.4)
    }, {
      title: 'Q单段伤害',
      params: { BondOfLifeGet: 2, HealNumber: 1 },
      dmg: ({ talent, attr }, { basic }) => basic(attr.hp * talent.q['技能伤害'] / 100, 'q')
    }, {
      title: 'Q完整伤害',
      params: { BondOfLifeGet: 2, HealNumber: 1 },
      dmg: ({ talent, attr , cons }, { basic }) => {
        let q1 = basic(attr.hp * talent.q['技能伤害'] / 100, 'q')
        let cons4 = cons >= 4 ? 13 : 6
        return {
        avg: q1.avg * cons4,
        dmg: q1.dmg * cons4
        }
      }
    }]

    const defDmgIdx = 3
    const mainAttr = 'hp,cpct,cdmg,mastery,dmg'

    const buffs = [{
        title: '希格雯天赋：长按E使弹跳伤害提升[eDmg]%,治疗量提升10%',
        data: {
          eDmg: 5 * 2
        }
    }, {
        title: '希格雯天赋：施放弹跳水疗法获得[dmg]%水元素伤害加成',
        data: {
          dmg: 8
        }
    }, {
        title: '希格雯天赋：基于队伍中所有角色当前生命之契的总和,提升30%治疗量'
    }, {
        title: '希格雯2命：EQ中敌人的敌人水元素抗性降低[kx]%',
        cons: 2,
        data: {
          kx: 35
        }
    }, {
        title: '希格雯6命：Q的暴击率提高[qCpct]%,暴击伤害提高[qCdmg]%',
        sort: 9,
        cons: 6,
        data: {
          qCpct: ({ attr }) => Math.min(20, attr.hp / 1000 * 0.4),
          qCdmg: ({ attr }) => Math.min(110, attr.hp / 1000 * 2.2)
        }
    }, 'vaporize']

    const createdBy = 'liangshi'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "希诺宁": () => {
    const details = [{
      title: '刃轮巡猎首段伤害',
      params: { NightsoulStatus: true },
      dmg: ({ talent, attr }, { basic }) => basic(talent.a['刃轮巡猎一段伤害']*  attr.def / 100 , 'a,nightsoul')
    },{
      title: '刃轮巡猎尾段伤害',
      params: { NightsoulStatus: true },
      dmg: ({ talent, attr }, { basic }) => basic(talent.a['刃轮巡猎四段伤害']*  attr.def / 100 , 'a,nightsoul')
    },{
      title: 'Q技能伤害',
      params: { SourceSamples: true },
      dmg: ({ talent, attr }, { basic }) => basic(talent.q['技能伤害']*  attr.def / 100 , 'q,nightsoul')
    },{
      title: 'Q每跳治疗',
      dmg: ({ talent, calc, attr }, { heal }) => heal(talent.q['持续治疗量2'][0] * calc(attr.def) / 100 + talent.q['持续治疗量2'][1] * 1)
    },{
      title: 'Q追加节拍伤害',
      params: { SourceSamples: true },
      dmg: ({ talent, attr }, { basic }) => basic(talent.q['追加节拍伤害']*  attr.def / 100 , 'q,nightsoul')
    },{
      title: '六命额外治疗量',
      cons: 6,
      dmg: ({ calc, attr }, { heal }) => heal(1.2 * calc(attr.def))
    }]

    const defParams = { Nightsoul: true }
    const defDmgIdx = 3
    const mainAttr = 'def,cpct,cdmg,heal'

    const buffs = [{
      check: ({ params }) => params.NightsoulStatus === true,
      title: '希诺宁元素战技：处于夜魂加持状态下时，岩元素「源音采样」将始终保持激活状态，且激活后敌人的岩元素抗性降低',
      data: {
        kx: ({ talent }) => talent.e['元素抗性降低']
      }
    },{
      title: '希诺宁天赋：拥有少于两枚经过元素转化的「源音采样」，普通攻击与下落攻击造成的伤害提升[aDmg]%',
      data: {
        aDmg: 30,
        a3Dmg: 30
      }
    },{
      title: '希诺宁天赋：队伍中的附近的角色触发「夜魂迸发」时，防御力提升[defPct]%',
      data: {
        defPct: 20
      }
    },{
      check: ({ params }) => params.SourceSamples === true,
      title: '希诺宁2命：希诺宁携带的岩元素「源音采样」将始终保持激活状态，且激活后敌人的岩元素抗性降低',
      cons: 2,
      data: {
        kx: ({ talent }) => talent.e['元素抗性降低']
      }
    },{
      title: '希诺宁2命：造成的岩元素伤害提升[dmg]%',
      cons: 2,
      data: {
        dmg: 50
      }
    },{
      title: '希诺宁4命：施放元素战技后，普通攻击、重击与下落攻击造成的伤害提升[aPlus]',
      cons: 4,
      sort: 9,
      data: {
        aPlus: ({ attr, calc }) => calc(attr.def) * 65 / 100,
        a2Plus: ({ attr, calc }) => calc(attr.def) * 65 / 100,
        a3Plus: ({ attr, calc }) => calc(attr.def) * 65 / 100
      }
    },{
      title: '希诺宁6命：处于夜魂加持状态下时，进行冲刺、腾跃、普通攻击、下落攻击时，无视夜魂加持状态下的限制，并提升普通攻击与下落攻击造成的伤害[aPlus] ',
      cons: 6,
      sort: 9,
      data: {
        aPlus: ({ attr, calc }) => calc(attr.def) * 300 / 100,
        a3Plus: ({ attr, calc }) => calc(attr.def) * 300 / 100
      }
    }]

    const createdBy = '冰翼'
    return { details, defParams, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "恰斯卡": () => {
    const details = [{
      title: 'E追影弹伤害',
      params: { AllShadowhuntShell: true },
      dmg: ({ talent }, dmg) => dmg(talent.e['追影弹伤害'], 'a2,nightsoul')
    },{
      title: 'E焕光追影弹伤害',
      dmgKey: 'z',
      params: { ShadowSpirit: true, AllShadowhuntShell: true },
      dmg: ({ talent }, dmg) => dmg(talent.e['焕光追影弹伤害'], 'a2,nightsoul', 'scene')
    },{
      title: 'E焕光追影弹最低增幅伤害',
      dmgKey: 'z',
      params: { ShadowSpirit: true, AllShadowhuntShell: true },
      dmg: ({ talent }, dmg) => dmg(talent.e['焕光追影弹伤害'], 'a2,nightsoul', 'scene,vaporize')
    },{
      title: 'E焕光追影弹最高增幅伤害',
      dmgKey: 'z',
      params: { ShadowSpirit: true, AllShadowhuntShell: true },
      dmg: ({ talent }, dmg) => {
        let ret = dmg(talent.e['焕光追影弹伤害'], 'a2,nightsoul', 'scene,vaporize')
        return {
          dmg: ret.dmg * 2 / 1.5,
          avg: ret.avg * 2 / 1.5
        }
      }
    },{
      title: 'Q裂风索魂弹伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['裂风索魂弹伤害'], 'q,nightsoul')
    },{
      title: 'Q索魂弹伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['索魂弹伤害'], 'q,nightsoul')
    },{
      title: 'Q溢光索魂弹伤害',
      dmgKey: 'q',
      dmg: ({ talent }, dmg) => dmg(talent.q['溢光索魂弹伤害'], 'q,nightsoul', 'scene')
    },{
      title: '2命基于焕光追影弹的追加伤害',
      cons: 2,
      dmgKey: 'z',
      dmg: ({ attr, calc }, { basic }) => basic(calc(attr.atk) * 400 / 100, 'a2,nightsoul', 'scene')
    },{
      title: '4命基于溢光索魂弹的追加伤害',
      cons: 4,
      dmgKey: 'z',
      dmg: ({ attr, calc }, { basic }) => basic(calc(attr.atk) * 400 / 100, 'a2,nightsoul', 'scene')
    }]

    const defParams = { Nightsoul: true }
    const defDmgIdx = 3
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      check: ({ params }) => params.ShadowSpirit === true,
      title: '恰斯卡天赋：3层「焕影之灵」效果时，焕光追影弹造成的伤害提升[a2Dmg]%',
      data: {
        a2Dmg: 65
      }
    },{
      check: ({ params }) => params.AllShadowhuntShell === true,
      title: '恰斯卡6命：触发固有天赋后，追影弹和焕光追影弹的暴击伤害提升[a2Cdmg]%',
      cons: 6,
      data: {
        a2Cdmg: 120
      }
    }]

    const createdBy = '冰翼'
    return { details, defParams, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "托马": () => {
    const details = [{
      title: 'E基础护盾量',
      dmg: ({ attr, calc, talent }, { shield }) =>
        shield(talent.e['护盾吸收量2'][0] * calc(attr.hp) / 100 + talent.e['护盾吸收量2'][1] * 1)
    }, {
      title: 'E最大护盾量',
      params: { e: true },
      dmg: ({ attr, calc, talent }, { shield }) =>
        shield(talent.e['护盾吸收量上限2'][0] * calc(attr.hp) / 100 + talent.e['护盾吸收量上限2'][1] * 1)
    }, {
      title: 'Q每段伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['炽火崩破伤害'], 'q')
    }]

    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      title: '托马被动：5层Buff提高护盾强效25%',
      data: {
        shieldPlus: ({ params }) => params.e ? 25 : 0
      }
    }, {
      title: '托马被动：Q每段伤害提高[qPlus]',
      sort: 9,
      data: {
        qPlus: ({ calc, attr }) => calc(attr.hp) * 0.022
      }
    }]
    return { details, mainAttr, buffs }
  },
  "提纳里": () => {
    const details = [{
      title: '花筥箭激化伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['花筥箭伤害'], 'a2', 'spread')
    }, {
      title: '满蓄力重击总伤害',
      dmg: ({ talent, cons }, dmg) => {
        let d1 = dmg(talent.a['花筥箭伤害'], 'a2')
        let d2 = dmg(talent.a['藏蕴花矢伤害'], 'a2')
        let talentc6a2 = 150.0
        let d2c6 = dmg(talentc6a2, 'a2')
        let count = cons >= 6 ? 1 : 0
        return {
          dmg: d1.dmg + d2.dmg * 4 + d2c6.dmg * count,
          avg: d1.avg + d2.avg * 4 + d2c6.avg * count
        }
      }
    }, {
      title: '满蓄力重击激化总伤害',
      dmgKey: 'a2_j',
      dmg: ({ talent, cons }, dmg) => {
        let d1j = dmg(talent.a['花筥箭伤害'], 'a2', 'spread')
        let d2 = dmg(talent.a['藏蕴花矢伤害'], 'a2')
        let d2j = dmg(talent.a['藏蕴花矢伤害'], 'a2', 'spread')
        let talentc6a2 = 150.0
        let d2jc6 = dmg(talentc6a2, 'a2', 'spread')
        let count = cons >= 6 ? 1 : 0
        return {
          dmg: d1j.dmg + d2.dmg * 3 + d2j.dmg + d2jc6.dmg * count,
          avg: d1j.avg + d2.avg * 3 + d2j.dmg + d2jc6.dmg * count
        }
      }
    }, {
      title: 'Q总伤害',
      params: { q: true },
      dmg: ({ talent }, dmg) => {
        return dmg(talent.q['缠藤箭伤害'] * 6 + talent.q['次级缠藤箭伤害'] * 6, 'q')
      }
    }, {
      title: 'Q激化总伤害',
      params: { q: true },
      dmg: ({ talent }, dmg) => {
        let q1 = dmg(talent.q['缠藤箭伤害'], 'q')
        let q1j = dmg(talent.q['缠藤箭伤害'], 'q', 'spread')
        let q2 = dmg(talent.q['次级缠藤箭伤害'], 'q')
        let q2j = dmg(talent.q['次级缠藤箭伤害'], 'q', 'spread')
        return {
          dmg: q1.dmg * 4 + q1j.dmg * 2 + q2.dmg * 4 + q2j.dmg * 2,
          avg: q1.avg * 4 + q1j.avg * 2 + q2.avg * 4 + q2j.avg * 2
        }
      }
    }]

    const mainAttr = 'atk,cpct,cdmg,mastery'
    const defDmgKey = 'a2_j'
    const defParams = { mArtisDiffCount: 2 }

    const buffs = [{
      title: '提纳里被动：发射花筥箭后，元素精通提升50点',
      data: {
        mastery: 50
      }
    }, {
      title: '提纳里被动：基于元素精通提升重击及Q伤害[a2Dmg]%',
      sort: 9,
      data: {
        a2Dmg: ({ calc, attr }) => Math.min(60, calc(attr.mastery) * 0.06),
        qDmg: ({ calc, attr }) => Math.min(60, calc(attr.mastery) * 0.06)
      }
    }, {
      title: '提纳里1命：重击暴击率提高15%',
      cons: 1,
      data: {
        a2Cpct: 15
      }
    }, {
      title: '提纳里2命：E范围中存在敌人时，获得20%草伤加成',
      cons: 2,
      data: {
        dmg: 20
      }
    }, {
      title: '提纳里4命：释放Q时提高元素精通60，触发反应进一步提升60',
      cons: 4,
      data: {
        mastery: ({ params }) => params.q ? 120 : 0
      }
    }, {
      title: '提纳里6命：花筥箭在命中后能产生1枚额外的藏蕴花矢',
      cons: 6
    }, 'spread']
    return { details, mainAttr, defDmgKey, defParams, buffs }
  },
  "旅行者/anemo": () => {
    const details = [{
      title: '短按E伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['初始爆风伤害'], 'e')
    }, {
      title: '长按E总伤害',
      dmg: ({ talent }, dmg) => {
        const td = talent.e['初始切割伤害'] * 2 + talent.e['最大切割伤害'] * 4 + talent.e['最大爆风伤害']
        return dmg(td, 'e')
      }
    }, {
      title: 'Q每段伤害',
      params: { q: true },
      dmg: ({ talent }, dmg) => dmg(talent.q['龙卷风伤害'], 'q')
    }, {
      title: 'Q转化元素每段伤害',
      params: { q: true },
      dmg: ({ talent }, dmg) => dmg(talent.q['附加元素伤害'], 'q', 'phy')
    }, {
      title: '扩散反应伤害',
      dmg: ({}, { reaction }) => reaction('swirl')
    }]

    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '风主2命：元素充能效率提高[recharge]%',
      cons: 2,
      data: {
        recharge: 16
      }
    }, {
      title: '风主6命：受到Q伤害的目标，风抗降低[kx]%，转化的对应元素抗性降低[kx]%',
      cons: 6,
      check: ({ params }) => params.q === true,
      data: {
        kx: 20,
        fykx: 20
      }
    }]

    const createdBy = 'Aluxes'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "旅行者/cryo": () => {
    const details = [
      {
        title: '【辉映·星超导】E后普攻首段伤害',
        dmg: ({ attr, calc, talent }, dmg) => dmg(talent.a['一段伤害'] + 80, 'a')
      },
      {
        title: '【辉映·星超导】E后普攻尾段伤害',
        dmg: ({ attr, calc, talent }, dmg) => dmg(talent.a['五段伤害'] + 80, 'a')
      },
      {
        title: '【辉映·星超导】重击·冰凝星超导伤害',
        params: { Stellar: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(calc(attr.atk) * (talent.a['重击伤害2'][0] + talent.a['重击伤害2'][1] + 140) / 100, '', 'stellarConduct')
      },
      {
        title: 'E冰晶单次伤害',
        dmg: ({ attr, calc, talent }, dmg) => dmg(talent.e['冰晶伤害'], 'e')
      },
      {
        title: '满层寒辉·Q星超导单次伤害',
        params: { Stellar: true, q: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(calc(attr.atk) * talent.q['星超导投矛单段伤害'] / 100, '', 'stellarConduct')
      }
    ]

    const defDmgIdx = 2
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [
      {
        check: ({ params }) => params.q === true,
        title: '冰主元素爆发：消耗8层寒辉层数，提升本次元素爆发造成的伤害',
        data: {
          stellarConduct: ({ talent }) => talent.q['星超导寒辉伤害提升'] * 8
        }
      },
      {
        title: '冰主天赋：基于攻击力，提升[mastery]点的元素精通',
        sort: 9,
        data: {
          mastery: ({ attr, calc }) => Math.min(calc(attr.atk) / 100 * 8, 160)
        }
      },
      {
        check: ({ params }) => params.Stellar === true,
        title: '冰主天赋：基于攻击力，对队伍中角色造成的星超导反应提升[fypct]%的基础伤害',
        sort: 9,
        data: {
          fypct: ({ attr, calc }) => Math.min(calc(attr.atk) / 100 * 0.35, 7)
        }
      },
      {
        title: '冰主2命：在前台触发了星烁反应，或造成了星烁反应伤害时，元素精通提升[mastery]点',
        cons: 2,
        data: {
          mastery: 120
        }
      }
    ]

    const createdBy = '冰翼'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "旅行者/dendro": () => {
    const details = [{
      title: 'E伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: 'E激化伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e', 'spread')
    }, {
      title: 'Q每跳伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['草灯莲攻击伤害'], 'q')
    }, {
      title: 'Q每跳激化伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['草灯莲攻击伤害'], 'q', 'spread')
    }, {
      title: 'Q草灯爆炸伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['激烈爆发伤害'], 'q')
    }]

    const defDmgIdx = 3
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '天赋-蔓生的埜草：提升元素精通[mastery]点',
      data: {
        mastery: 60
      }
    }, {
      title: '天赋-繁庑的丛草：基于自身元素精通，提高E造成的伤害[eDmg]%，Q造成的伤害[qDmg]%',
      sort: 9,
      data: {
        eDmg: ({ attr }) => attr.mastery * 0.15,
        qDmg: ({ attr }) => attr.mastery * 0.1
      }
    }, {
      title: '草主6命：获得[dmg]%草元素伤害加成',
      cons: 6,
      data: {
        dmg: 12
      }
    }, 'spread']

    const createdBy = 'Aluxes'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "旅行者/electro": () => {
    const details = [{
      title: 'E伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: 'E提供元素充能加成',
      dmg: ({ attr }) => {
        return {
          avg: Format.percent(0.2 + attr.recharge * 0.1 / 100),
          type: 'text'
        }
      }
    }, {
      title: 'Q释放伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    }, {
      title: 'Q协同伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['威光落雷伤害'], 'q')
    }]

    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      title: '天赋-回响的轰雷：基于自身元素充能效率的10%，提升E的勾玉提供的元素充能效率[_eRecharge]%',
      data: {
        _eRecharge: ({ attr }) => attr.recharge * 0.1
      }
    }, {
      title: '雷主2命：Q的协同攻击会使敌人的雷元素抗性降低[kx]%',
      cons: 2,
      data: {
        kx: 15
      }
    }]

    const createdBy = 'Aluxes'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "旅行者/geo": () => {
    const details = [{
      title: 'E荒星伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: 'Q地震波单次伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['地震波单次伤害'], 'q')
    }]

    const mainAttr = 'atk,cpct,cdmg,dmg'

    const buffs = [{
      title: '岩主1命：处于Q岩造物范围内时，暴击率提高[cpct]%',
      cons: 1,
      data: {
        cpct: 10
      }
    }]

    const createdBy = 'Aluxes'
    return { details, mainAttr, buffs, createdBy }
  },
  "旅行者/hydro": () => {
    const details = [{
      title: 'E点按伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['喷发激流伤害'], 'e')
    }, {
      title: 'E点按伤害·蒸发',
      dmg: ({ talent }, dmg) => dmg(talent.e['喷发激流伤害'], 'e', 'vaporize')
    }, {
      title: 'E长按露滴伤害',
      params: { talentE1: true },
      dmg: ({ talent }, dmg) => dmg(talent.e['露滴伤害'], 'e')
    }, {
      title: 'E长按结束伤害',
      params: { talentE2: true },
      dmg: ({ talent }, dmg) => dmg(talent.e['喷发激流伤害'], 'e')
    }, {
      title: 'E长按结束伤害·蒸发',
      params: { talentE2: true },
      dmg: ({ talent }, dmg) => dmg(talent.e['喷发激流伤害'], 'e', 'vaporize')
    }, {
      title: 'Q每跳伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    }, {
      title: 'Q每跳伤害·蒸发',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q', 'vaporize')
    }]

    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg,mastery,dmg'

    const buffs = [{
      title: '天赋E-水纹剑：长按E释放时，基于自身生命值上限的[_hpPct]%，提高伤害值[ePlus]',
      check: ({ params }) => params.talentE1 === true,
      data: {
        _hpPct: ({ talent }) => talent.e['充盈伤害增加'],
        ePlus: ({ talent, attr }) => talent.e['充盈伤害增加'] * attr.hp / 100
      }
    }, {
      title: '天赋-澄明的净水：长按E时，根据消耗的生命值的45%，提高伤害值[ePlus]',
      check: ({ params }) => params.talentE2 === true,
      data: {
        ePlus: ({ attr }) => Math.min(5000, attr.hp * 0.24 * 0.45)
      }
    }, 'vaporize']

    const createdBy = 'Aluxes'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "旅行者/pyro": () => {
    const details = [{
      title: '6命夜魂加持普通攻击·一段伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['一段伤害'], 'a,nightsoul')
    }, {
      title: '6命夜魂加持普通攻击·五段伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['五段伤害'], 'a,nightsoul')
    }, {
      title: '（荧）6命夜魂加持重击伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2,nightsoul')
    }, {
      title: '6命夜魂加持高空下落伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['低空/高空坠地冲击伤害'][1], 'a3,nightsoul')
    }, {
      title: 'E点按每跳伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['焰烈之槛伤害'], 'e,nightsoul')
    }, {
      title: 'E长按伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['长按伤害'], 'e,nightsoul')
    }, {
      title: 'E长按每跳伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['灼火之槛伤害'], 'e,nightsoul')
    }, {
      title: 'Q技能伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q,nightsoul')
    }]

    const defParams = { Nightsoul: true }
    const defDmgIdx = 6
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      title: '火主1命：焰烈之槛或灼火之槛存在期间，且旅行者处于夜魂加持状态下时，造成的伤害提升[dmg]%',
      cons: 1,
      data: {
        dmg: 6 + 9
      }
    }, {
      title: '火主4命：施放元素爆发后，获得[dmg]%火元素伤害加成',
      cons: 4,
      data: {
        dmg: 20
      }
    }, {
      title: '火主6命：处于夜魂加持状态下时，普通攻击、重击与下落攻击伤害转为火附魔，且暴击伤害提升[aCdmg]%',
      cons: 6,
      data: {
        aCdmg: 40,
        a2Cdmg: 40,
        a3Cdmg: 40
      }
    }]

    const createdBy = '冰翼'
    return { details, defParams, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "早柚": () => {
    const details = [{
      title: 'Q每跳治疗量',
      dmg: ({ attr, calc, talent, cons }, { heal }) => {
        let num = talent.q['不倒貉貉治疗量2'][0] * calc(attr.atk) / 100 + talent.q['不倒貉貉治疗量2'][1] * 1
        if (cons * 1 === 6) {
          num += Math.min(calc(attr.mastery) * 3, 6000)
        }
        return heal(num)
      }
    }, {
      title: '扩散反应伤害',
      dmg: ({}, { reaction }) => reaction('swirl')
    }]

    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '早柚6命：基于精通提升Q [qPct]伤害，[_heal]治疗量',
      cons: 6,
      sort: 9,
      data: {
        qPct: ({ attr, calc }) => Math.min(calc(attr.mastery) * 0.002, 400),
        _heal: ({ attr, calc }) => Math.min(calc(attr.mastery) * 3, 6000)
      }
    }]
    return { details, mainAttr, buffs }
  },
  "杜林": () => {
    const details = [{
      title: 'Q白化法·如光流变总伤害',
      params: { LightShifts : true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.q['白化法·如光流变伤害'], 'q')
    }, {
      title: 'Q黑度法·如星阴燃总伤害',
      params: { StarsSmolder: true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.q['黑度法·如星阴燃伤害'], 'q')
    }, {
      title: 'Q「白焰之龙」伤害',
      params: { LightShifts : true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.q['白焰之龙伤害'], 'q')
    }, {
      title: 'Q「黑蚀之龙」伤害',
      params: { StarsSmolder: true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.q['黑蚀之龙伤害'], 'q')
    }, {
      title: 'Q「黑蚀之龙」蒸发伤害',
      params: { StarsSmolder: true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.q['黑蚀之龙伤害'], 'q', 'vaporize')
    }, {
      title: 'Q「黑蚀之龙」融化伤害',
      params: { StarsSmolder: true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.q['黑蚀之龙伤害'], 'q', 'melt')
    }]

    const defParams = { Hexenzirkel: true } // 魔女会成员
    const defDmgIdx = 5
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      check: ({ params }) => params.LightShifts === true,
      title: '杜林天赋：获得【魔导·秘仪】效果时，队伍中附近的角色对敌人触发燃烧、超载、火元素扩散、火元素结晶反应后，或对处于燃烧状态下的敌人造成火元素伤害或草元素伤害时，' +
        '该敌人的火元素抗性与参与反应的对应元素抗性降低[kx]%',
      data: {
        kx: 20 * 1.75,
      }
    }, {
      check: ({ params }) => params.StarsSmolder === true,
      title: '杜林天赋：获得【魔导·秘仪】效果时，蒸发反应造成的伤害提升[vaporize]%，融化反应造成的伤害提升[melt]%。',
      data: {
        vaporize: 40 * 1.75,
        melt: 40 * 1.75
      }
    }, {
      title: '杜林天赋：施放元素爆发后，白焰之龙与黑蚀之龙的间歇性攻击造成伤害时，每100点攻击力都将额外造成相当于原本3%的伤害，至多通过这种方式额外造成相当于原本75%的伤害。',
      sort: 9,
      data: {
        multi: ({ calc, attr }) => Math.min(calc(attr.atk) / 100 * 3, 75)
      }
    }, {
      check: ({ params }) => params.StarsSmolder === true,
      title: '杜林1命：施放元素爆发黑度法·如星阴燃后，将消耗2层「轮变启迪」，提升造成的伤害，提升值相当于杜林攻击力的[qPct]%。',
      cons: 1,
      data: {
        qPct: 150
      }
    }, {
      title: '杜林2命：施放元素爆发后，放队伍中附近的角色对敌人触发蒸发、融化、燃烧、超载、火元素扩散或火元素结晶反应后，或对处于燃烧状态下的敌人造成火元素伤害或草元素伤害时，' +
        '队伍中附近的角色造成的火元素伤害与参与反应的对应元素伤害提升[dmg]%',
      cons: 2,
      data: {
        dmg: 50
      }
    }, {
      title: '杜林4命：元素爆发伤害提升[qDmg]%',
      cons: 4,
      data: {
        qDmg: 40
      }
    }, {
      title: '杜林6命：元素爆发伤害将无视敌人[qIgnore]%的防御力',
      cons: 6,
      data: {
        qIgnore: 30
      }
    }, {
      check: ({ params }) => params.LightShifts === true,
      title: '杜林6命：元素爆发白化法·如光流变与「白焰之龙」命中敌人时，该敌人的防御力降低[enemyDef]%',
      cons: 6,
      data: {
        enemyDef: 30
      }
    }, {
      check: ({ params }) => params.StarsSmolder === true,
      title: '杜林6命：元素爆发黑度法·如星阴燃与「黑蚀之龙」造成的伤害将额外无视敌人[qIgnore]%的防御力',
      cons: 6,
      data: {
        qIgnore: 40
      }
    }]

    const createdBy = '冰翼'
    return { details, defParams, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "林尼": () => {
    const details = [{
      title: '满蓄力重击伤害',
      params: { a2: true },
      dmg: ({ talent }, dmg) => dmg(talent.a['隐具魔术箭伤害'], 'a2')
    }, {
      title: '礼花术弹伤害',
      params: { catcathat: true },
      dmg: ({ talent, attr, calc }, { basic }) => {
        const atk = calc(attr.atk)
        const a2dmg = atk * 0.8 + atk * talent.a['礼花术弹伤害'] / 100
        return basic(a2dmg, 'a2')
      }
    }, {
      title: '满层E伤害',
      dmg: ({ talent }, dmg) => {
        let eDmg = dmg(talent.e['技能伤害'], 'e')
        let ePlusDmg = dmg(talent.e['技能伤害加成'] * 5, 'e')
        return {
          dmg: eDmg.dmg + ePlusDmg.dmg,
          avg: eDmg.avg + ePlusDmg.avg
        }
      }
    }, {
      title: 'Q总伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'] + talent.q['引爆礼花伤害'], 'q')
    }]

    const defDmgIdx = 0
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      check: ({ params }) => params.catcathat === true,
      title: '天赋-惊险演出：基于攻击力的80%，提高怪笑猫猫帽造成的伤害'
    }, {
      title: '天赋-完场喝彩：队伍有三名火元素角色时，对处于火元素影响下的敌人造成的伤害提升[dmg]%',
      data: {
        dmg: 100
      }
    }, {
      title: '双火共鸣：攻击力提高[atkPct]%',
      data: {
        atkPct: 25
      }
    }, {
      title: '林尼2命：在场6秒后，暴击伤害提高60%',
      cons: 2,
      data: {
        cdmg: 60
      }
    }, {
      title: '林尼4命：重击命中敌人后，降低敌人火元素抗性20%',
      cons: 4,
      data: {
        kx: 20
      }
    }, {
      check: ({ params }) => params.a2 === true,
      title: '林尼6命：发射隐具魔术箭时，额外发射一枚礼花术弹·重奏，造成礼花术弹80%的伤害',
      sort: 9,
      cons: 6,
      data: {
        a2Plus: ({ talent, attr, calc }) => talent.a['礼花术弹伤害'] / 100 * calc(attr.atk) * 0.8
      }
    }]

    const createdBy = 'Aluxes'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "枫原万叶": () => {
    const details = [{
      title: 'E长按伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['长按技能伤害'], 'e')
    }, {
      title: 'Q斩击伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['斩击伤害'], 'q')
    }, {
      title: 'Q无转化每段伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['持续伤害'], 'q')
    }, {
      title: '扩散反应伤害',
      dmg: ({}, { reaction }) => reaction('swirl')
    }]

    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '万叶2命：开Q后精通提高200',
      cons: 2,
      data: {
        mastery: 200
      }
    }, 'swirl']
    return { details, mainAttr, buffs }
  },
  "柯莱": () => {
    const details = [{
      title: 'E单次伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: 'Q爆发伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['爆发伤害'], 'q')
    }, {
      title: 'Q每跳伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['跃动伤害'], 'q')
    }]

    const mainAttr = 'atk,cpct,cdmg'

    const buffs = []
    return { details, mainAttr, buffs }
  },
  "桑多涅": () => {
    const details = [
      {
        title: '重击扫射伤害',
        dmg: ({ attr, calc, talent }, dmg) => dmg(talent.a['重击扫射伤害'], 'a2')
      },
      {
        title: '重击冷凝射线星超导伤害',
        params: { Stellar: true, a2: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(calc(attr.atk) * talent.a['重击冷凝射线星超导伤害'] / 100, '', 'stellarConduct')
      },
      {
        title: 'E棱晶弹伤害',
        dmg: ({ attr, calc, talent }, dmg) => dmg(talent.e['棱晶弹伤害'], 'e')
      },
      {
        title: '满buff E棱晶弹星超导伤害',
        params: { Stellar: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(4 * calc(attr.atk) * talent.e['棱晶弹星超导伤害'] / 100, '', 'stellarConduct')
      },
      {
        title: 'Q轰炸伤害',
        dmg: ({ attr, calc, talent }, dmg) => dmg(talent.q['轰炸伤害'], 'q')
      },
      {
        title: '满buff Q聚能光束星超导伤害',
        params: { Stellar: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(2 * calc(attr.atk) * talent.q['聚能光束星超导伤害'] / 100, '', 'stellarConduct')
      },
      {
        title: '4命额外星超导伤害',
        params: { Stellar: true },
        cons: 4,
        dmg: ({ attr, calc }, { basic }) => basic(calc(attr.atk) * 125 / 100, '', 'stellarConduct')
      },
      {
        title: '6命每次冷凝射线额外星超导总伤害',
        params: { Stellar: true },
        cons: 6,
        dmg: ({ attr, calc }, { basic }) => basic(calc(attr.atk) * 80 * 4 / 100, '', 'stellarConduct')
      }
    ]

    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [
      {
        title: '双冰共鸣：攻击冰元素附着或冻结状态下的敌人时，暴击率提高[cpct]%',
        data: {
          cpct: 15
        }
      },
      {
        check: ({ params }) => params.Stellar === true,
        title: '桑多涅天赋：基于桑多涅的攻击力，对队伍中角色造成的星超导反应提升[fypct]%的基础伤害',
        sort: 9,
        data: {
          fypct: ({ attr, calc }) => Math.min(calc(attr.atk) / 100 * 0.7, 14)
        }
      },
      {
        title: '桑多涅天赋：基于桑多涅的攻击力，提升[mastery]点的元素精通',
        sort: 9,
        data: {
          mastery: ({ attr, calc }) => Math.min(calc(attr.atk) / 100 * 8, 160)
        }
      },
      {
        title: '桑多涅1命：队伍中的所有角色造成的星超导反应伤害提升[stellarConduct]%。',
        cons: 1,
        data: {
          stellarConduct: 30
        }
      },
      {
        check: ({ params }) => params.a2 === true,
        title: '桑多涅2命：【辉映·星超导】3层状态下，重击发射的冷凝射线的暴击伤害提升[cdmg]%',
        cons: 2,
        data: {
          cdmg: 40 + 20 * 3
        }
      },
      {
        title: '桑多涅6命：星超导反应伤害擢升[elevated]%',
        cons: 6,
        data: {
          elevated: 20
        }
      }
    ]

    const createdBy = '冰翼'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "梦见月瑞希": () => {
    const details = [{
      title: 'E持续攻击伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['持续攻击伤害'], 'e')
    }, {
      title: '天赋「廓然梦生」E持续攻击伤害',
      params: { skills: true },
      dmg: ({ talent }, dmg) => dmg(talent.e['持续攻击伤害'], 'e')
    }, {
      title: '【辉映·星扩散】E额外持续星扩散伤害',
      params: { cons_6: true },
      dmg: ({ attr, calc }, { basic }) => basic(calc(attr.mastery) * 1000 / 100, '', 'stellarSwirl')
    }, {
      title: 'E后Q点心伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['梦念冲击波伤害'], 'q')
    }, {
      title: 'Q点心治疗量',
      dmg: ({ attr, calc, talent, cons }, { heal }) => heal(talent.q['拾取点心回复生命值2'][0] * calc(attr.mastery) / 100 + talent.q['拾取点心回复生命值2'][1] * 1)
    }, {
      title: '扩散反应伤害',
      dmg: ({ attr, calc, talent, cons }, { reaction }) => {
        let { avg } = reaction('swirl')
        let cons6dmg = cons >= 6 ? 2 : 1
        let cons6avg = cons >= 6 ? 1.3 : 1
        return {
          dmg: cons >= 6 ? (avg * cons6dmg) : undefined,
          avg: avg * cons6avg
        }
      }
    }, {
      title: '反应星扩散单层伤害',
      dmg: ({}, { reaction }) => reaction('stellarSwirl')
    }, {
      cons: 1,
      title: '1命「二十三夜待」扩散反应伤害',
      params: { Nights: true },
      dmg: ({ attr, calc, talent, cons }, { reaction }) => {
        let { avg } = reaction('swirl')
        let cons6dmg = cons >= 6 ? 2 : 1
        let cons6avg = cons >= 6 ? 1.3 : 1
        return {
          dmg: cons >= 6 ? (avg * cons6dmg) : undefined,
          avg: avg * cons6avg
        }
      }
    }, {
      cons: 1,
      title: '1命「二十三夜待」额外风元素伤害',
      dmg: ({ attr, calc }, { basic }) => basic(calc(attr.mastery) * 1000 / 100)
    }, {
      cons: 1,
      title: '【辉映·星扩散】1命「二十三夜待」额外星扩散伤害',
      params: { cons_6: true },
      dmg: ({ attr, calc }, { basic }) => basic(calc(attr.mastery) * 400 / 100, '', 'stellarSwirl')
    }, {
      cons: 4,
      title: '4命额外治疗',
      dmg: ({ attr, calc }, { heal }) => heal(calc(attr.mastery) * 266 / 100)
    }]

    const defDmgIdx = 2
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      check: ({ params }) => params.Nights === true,
      title: '1命效果：二十三夜待状态下的扩散反应的伤害提升[fyplus]',
      cons: 1,
      sort: 9,
      data: {
        fyplus: ({ attr, calc }) => calc(attr.mastery) * 1100 / 100
      }
    }, {
      title: '2命效果：处于梦浮状态下时，风元素抗性降低[kx]%',
      cons: 2,
      data: {
        kx: 20
      }
    }, {
      check: ({ params }) => params.cons_6 === true,
      title: '6命效果：星扩散反应伤害暴击率提升[cpct]%，暴击伤害提升[cdmg]%',
      cons: 6,
      data: {
        cpct: 10,
        cdmg: 20
      }
    }, {
      title: '6命效果：基于梦见月瑞希元素精通，使暴击率提升[cpct]%，暴击伤害提升[cdmg]%',
      cons: 6,
      sort: 9,
      data: {
        cpct: ({ attr, calc }) => Math.min(Math.max(calc(attr.mastery) - 500, 0) * 0.04, 20),
        cdmg: ({ attr, calc }) => Math.min(Math.max(calc(attr.mastery) - 500, 0) * 0.16, 80),
      }
    }, {
      title: '瑞希天赋：梦见月处于梦浮状态下时，其他的火、水、冰、雷元素角色的攻击命中敌人时,元素精通提升[mastery]点',
      data: {
        mastery: 100 + 100 * 0.1    // 因为下一个天赋【梦浮状态下时，元素精通提升10%】，所以这个天赋加的100精通后面，再追加 100 * 0.1
      }
    }, {
      title: '瑞希天赋：梦见月处于梦浮状态下时，队伍中附近的角色的元素精通提升[masteryPct]%',
      data: {
        masteryPct: 10
      }
    }, {
      check: ({ params }) => params.skills === true,
      title: '瑞希天赋：梦浮状态下的持续性伤害获得提升，提升值相当于梦见月元素精通的1000%',
      sort: 9,
      data: {
        ePlus: ({ calc, attr }) => calc(attr.mastery) * 1000 / 100,
      }
    }, {
      title: '瑞希元素战技：扩散反应伤害提升[swirl]%；星扩散反应伤害提升[stellarSwirl]%',
      sort: 9,
      data: {
        swirl: ({ attr, calc, talent }) => calc(attr.mastery) * talent.e['每100点精通提升扩散伤害百分比'] / 100,
        stellarSwirl: ({ attr, calc, talent }) => calc(attr.mastery) * talent.e['每100点精通提升星扩散伤害百分比'] / 100,
      }
    }]

    const createdBy = 'liangshi & 冰翼'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "欧洛伦": () => {
    const details = [{
      title: 'E宿灵球伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['宿灵球伤害'], 'e,nightsoul')
    },{
      title: 'Q秘仪伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['秘仪伤害'], 'q,nightsoul')
    },{
      title: 'Q音波碰撞伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['音波碰撞伤害'], 'q,nightsoul')
    },{
      title: '天赋「显象超感」伤害',
      params: { Hypersense: true },
      dmg: ({ attr, calc }, { basic }) => basic(calc(attr.atk) * 160 / 100, 'nightsoul')
    },{
      title: '感电反应伤害',
      dmgKey: 'r',
      dmg: ({}, { reaction }) => reaction('electroCharged')
    }]

    const defParams = { Nightsoul: true }
    const defDmgIdx = 0
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      check: ({ params }) => params.Hypersense === true,
      title: '欧洛伦1命：宿灵球命中敌人后，天赋「显象超感」造成的伤害提升[dmg]%',
      cons: 1,
      data: {
        dmg: 50
      }
    },{
      title: '欧洛伦2命：施放元素爆发后，根据命中敌人的个数，最高可获得[dmg]%雷元素伤害加成',
      cons: 2,
      data: {
        dmg: 40
      }
    },{
      title: '欧洛伦6命：触发固有天赋「显象超感」后，使当前场上角色的攻击力最高提升[atkPct]%',
      cons: 6,
      data: {
        atkPct: 30
      }
    }]

    const createdBy = '冰翼'
    return { details, defParams, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "沃雅妮莎": () => {
    const details = [
      {
        title: 'E唤春角笛后台伤害',
        dmg: ({ attr, calc, talent }, { basic }) => basic(calc(attr.hp) * talent.e['唤春角笛伤害'] / 100, 'e')
      },
      {
        title: 'Q技能伤害',
        params: { q: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(calc(attr.hp) * talent.q['技能伤害'] / 100, 'q')
      },
      {
        title: 'E每跳治疗量',
        dmg: ({ attr, calc, talent }, { heal }) => heal(calc(attr.hp) * talent.e['遥久之歌治疗量2'][1] / 100 + talent.e['遥久之歌治疗量2'][0])
      },
      {
        check: ({ cons }) => cons >= 1,
        params: ({ cons }) => ({ cons_4: cons >= 4 }),
        title: '1命提供攻击力提升',
        dmg: ({ attr, calc }) => { return { avg: calc(attr.hp) * 0.8 / 100 }}
      },
      {
        cons: 4,
        title: '4命buff E唤春角笛后台伤害',
        params: { cons_4: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(calc(attr.hp) * talent.e['唤春角笛伤害'] / 100, 'e')
      },
      {
        cons: 4,
        title: '4命buff Q技能伤害',
        params: { q: true, cons_4: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(calc(attr.hp) * talent.q['技能伤害'] / 100, 'q')
      },
      {
        title: '每层羽毛提供星扩散提升',
        dmg: ({ attr, calc }) => ({
          avg: Math.min(Math.max(calc(attr.hp) - 40000, 0) / 1000 * 260, 6500)
        })
      },
      {
        title: '(双水)每层羽毛提供冰水伤害提升',
        params: { hydroCryo: true },
        dmg: ({ attr, calc }) => ({
          avg: Math.min(Math.max(calc(attr.hp) - 40000, 0) / 1000 * 140, 3500)
        })
      }
    ]

    const defDmgIdx = 2
    const mainAttr = 'hp,cpct,cdmg'

    const buffs = [
      {
        title: '沃雅妮莎战技：敌人的水元素抗性与冰元素抗性降低[kx]%',
        data: {
          kx: ({ talent }) => talent.e['水元素/冰元素抗性降低']
        }
      },
      {
        check: ({ params }) => params.q === true,
        title: '沃雅妮莎元素爆发：处于遥久之歌状态下时，元素爆发造成的伤害提升[dmg]%',
        data: {
          dmg: ({ talent }) => talent.q['遥久之歌伤害加成']
        }
      },
      {
        check: ({ params }) => params.cons_4 === true,
        title: '沃雅妮莎4命：若受治疗角色的生命值不低于40%，沃雅妮莎生命值上限提升[hpPct]%',
        cons: 4,
        data: {
          hpPct: 60
        }
      },
      {
        title: '沃雅妮莎6命：水元素伤害与冰元素伤害的暴击伤害提升[cdmg]%，水元素伤害与冰元素伤害提升[dmg]%。',
        cons: 6,
        data: {
          cdmg: 50,
          dmg: 60
        }
      },
      {
        check: ({ params }) => params.hydroCryo === true,
        title: '(仅供羽毛提升计算)冰水队双水共鸣：生命值上限提升[hpPct]%',
        data: {
          hpPct: 25
        }
      }
    ]

    const createdBy = '冰翼'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "法尔伽": () => {
    const details = [
      {
        title: 'E「狂飙突进」尾段总伤害',
        params: { skills_1: true, skills_2: true, cons_6: true },
        dmg: ({ attr, talent } , dmg) => {
          let dmg1 = dmg(talent.e['狂飙突进·五段伤害2'][0], 'a', 'coloringDmg')
          let dmg2 = dmg(talent.e['狂飙突进·五段伤害2'][1], 'a')
          return {
            dmg: dmg1.dmg + dmg2.dmg,
            avg: dmg1.avg + dmg2.avg
          }
        }
      },
      {
        title: 'E「四风将起」总伤害',
        params: { skills_1: true, skills_2: true, cons_6: true },
        dmg: ({ attr, talent } , dmg) => {
          let dmg1 = dmg(talent.e['四风将起伤害2'][0], 'e', 'coloringDmg')
          let dmg2 = dmg(talent.e['四风将起伤害2'][1], 'e')
          return {
            dmg: dmg1.dmg + dmg2.dmg,
            avg: dmg1.avg + dmg2.avg
          }
        }
      },
      {
        title: 'E「苍噬」总伤害',
        params: { skills_1: true, skills_2: true, cons_6: true },
        dmg: ({ attr, talent } , dmg) => {
          let dmg1 = dmg(talent.e['苍噬伤害'][0], 'a2', 'coloringDmg')
          let dmg2 = dmg(talent.e['苍噬伤害'][1], 'a2')
          return {
            dmg: dmg1.dmg + dmg2.dmg,
            avg: dmg1.avg + dmg2.avg
          }
        }
      },
      {
        title: 'Q总伤害',
        dmg: ({ attr, talent } , dmg) => {
          let dmg1 = dmg(talent.q['技能第一段伤害'], 'q', 'coloringDmg')
          let dmg2 = dmg(talent.q['技能第二段伤害'], 'q')
          return {
            dmg: dmg1.dmg + dmg2.dmg,
            avg: dmg1.avg + dmg2.avg
          }
        }
      },
      {
        title: '1命强化后「四风将起」总伤害',
        cons: 1,
        params: { skills_1: true, skills_2: true, cons_1: true, cons_6: true },
        dmg: ({ attr, talent } , dmg) => {
          let dmg1 = dmg(talent.e['四风将起伤害2'][0], 'e', 'coloringDmg')
          let dmg2 = dmg(talent.e['四风将起伤害2'][1], 'e')
          return {
            dmg: dmg1.dmg + dmg2.dmg,
            avg: dmg1.avg + dmg2.avg
          }
        }
      },
      {
        title: '1命强化后「苍噬」总伤害',
        cons: 1,
        params: { skills_1: true, skills_2: true, cons_1: true, cons_6: true },
        dmg: ({ attr, talent } , dmg) => {
          let dmg1 = dmg(talent.e['苍噬伤害'][0], 'a2', 'coloringDmg')
          let dmg2 = dmg(talent.e['苍噬伤害'][1], 'a2')
          return {
            dmg: dmg1.dmg + dmg2.dmg,
            avg: dmg1.avg + dmg2.avg
          }
        }
      },
      {
        title: '2命额外伤害',
        cons: 2,
        dmg: ({ attr, talent } , dmg) => dmg(800)
      }
    ]

    const defParams = { Hexenzirkel: true } // 魔女会成员
    const defDmgIdx = 0
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [
      {
        check: ({ params }) => params.skills_1 === true,
        title: '法尔伽天赋：队伍中同时存在至少2名风元素角色与至少2名元素类型相同的火/水/雷/冰元素角色，则会使狂飙突进模式下进行的普通攻击、重击、苍噬、四风将起将造成原本[multi]%的伤害',
        data: {
          multi: 120
        }
      },
      {
        check: ({ params }) => params.skills_2 === true,
        title: '法尔伽天赋：队伍中附近的角色触发扩散反应时，法尔伽的普通攻击、重击、特殊重击苍噬与施放的特殊元素战技四风将起造成的伤害最多提升[dmg]%',
        data: {
          dmg: 7.5 * 4,
        }
      },
      {
        title: '法尔伽天赋：队伍中存在火/水/雷/冰元素角色时，每1000点攻击力都将使法尔伽获得10%风元素伤害加成与对应元素伤害加成。当前共获得[dmg]%元素伤害加成。',
        sort: 9,
        data: {
          dmg: ({ attr, calc }) => Math.min(calc(attr.atk) / 1000 * 10, 25)
        }
      },
      {
        check: ({ params }) => params.cons_1 === true,
        title: '法尔伽1命：切换至狂飙突进模式并消耗「歌中的佳酿」效果后，四风将起或苍噬造成原本[multi]%的伤害',
        cons: 1,
        data: {
          multi: 200
        }
      },
      {
        title: '法尔伽4命：法尔伽触发扩散反应时，使队伍中附近的所有角色分别获得[dmg]%风元素伤害加成与对应元素伤害加成',
        cons: 4,
        data: {
          dmg: 20
        }
      },
      {
        check: ({ params }) => params.cons_6 === true,
        title: '法尔伽6命：突破天赋获得强化——满层「苍牙之誓」还会使法尔伽的暴击伤害提升[cdmg]%',
        cons: 6,
        data: {
          cdmg: 20 * 4
        }
      }
    ]

    const createdBy = '冰翼'
    return { details, defParams, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "洛恩": () => {
    const details = [
      {
        title: "满buff EQ后普攻首段伤害",
        dmg: ({ talent }, dmg) => dmg(talent.e["一段伤害"], "a")
      },
      {
        title: "满buff EQ后普攻尾段伤害",
        dmg: ({ talent }, dmg) => {
          let a = dmg(talent.a["五段伤害2"][0], "a")
          let a2 = dmg(talent.a["五段伤害2"][1], "a")
          return {
            dmg: a.dmg + a2.dmg,
            avg: a.avg + a2.avg
          }
        }
      },
      {
        title: "EQ后重击伤害",
        dmg: ({ talent }, dmg) => {
          let a = dmg(talent.a["重击伤害2"][0], "a2")
          return {
            dmg: a.dmg * 2,
            avg: a.avg * 2
          }
        }
      },
      {
        title: "零层强化E伤害",
        params: { "争胜": 0 },
        dmg: ({ talent }, dmg) => {
          let e = dmg(talent.e["镂骨彻心伤害2"][0], "e")
          return {
            dmg: e.dmg * 4,
            avg: e.avg * 4
          }
        }
      }, {
        title: "满层强化E伤害",
        params: ({ cons }) => ({ "争胜": cons >= 1 ? 300 : 100 }),
        dmg: ({ cons, talent }, dmg) => {
          let e = dmg(talent.e["镂骨彻心伤害2"][0] * (1 + 0.004 * (cons >= 1 ? 300 : 100)), "e")
          return {
            dmg: e.dmg * 4,
            avg: e.avg * 4
          }
        }
      },
      {
        title: "零层Q伤害",
        params: { "争胜": 0 },
        dmg: ({ talent }, dmg) => {
          let q = dmg(talent.q["技能伤害2"][0], "q")
          return {
            dmg: q.dmg * 4,
            avg: q.avg * 4
          }
        }
      }, {
        title: "满层Q伤害",
        params: ({ cons }) => ({ "争胜": cons >= 1 ? 300 : 100 }),
        dmg: ({ cons, talent }, dmg) => {
          let q = dmg(talent.q["技能伤害2"][0] * (1 + 0.004 * (cons >= 1 ? 300 : 100)), "q")
          return {
            dmg: q.dmg * 4,
            avg: q.avg * 4
          }
        }
      }, {
        title: '2命额外伤害',
        cons: 2,
        dmg: ({}, dmg) => dmg(500)
      }
    ]

    const defParams = { "奇谋": true, Hexenzirkel: true }
    const mainAttr = 'atk,cpct,cdmg'
    const defDmgIdx = 6

    const buffs = [
      {
        title: "洛恩技能：当前拥有[buff]层争胜，元素战技镂骨彻心造成原本[_eDmg]%的伤害,元素爆发造成原本[_qDmg]%的伤害",
        data: {
          buff: ({ params }) => params["争胜"] || 0,
          _eDmg: ({ params }) => 100 + 0.4 * params["争胜"],
          _qDmg: ({ params }) => 100 + 0.4 * params["争胜"]
        }
      }, {
        check: ({ params }) => params["奇谋"] === true,
        title: "洛恩天赋：在奇谋状态下，其他角色触发冰元素反应后攻击力提升[atkPct]%",
        data: {
          atkPct: 15
        }
      }, {
        check: ({ params }) => params["奇谋"] === true,
        title: "洛恩天赋：施放强化战技或元素爆发时，若争胜至少为上限的50%，则普通攻击与重击造成的伤害提升[aDmg]%",
        data: {
          aDmg: 40,
          a2Dmg: 40
        }
      }, {
        check: ({ params }) => params["奇谋"] === true,
        title: "洛恩6命：施放特殊元素战技或在奇谋状态下释放元素爆发暴击伤害都将提升[eCdmg]%",
        data: {
          eCdmg: 175,
          qCdmg: 175
        }
      }
    ]

    const createdBy = "liangshi"
    return { details, defParams, mainAttr, defDmgIdx, buffs, createdBy }
  },
  "流浪者": () => {
    const details = [{
      title: '开E后首段普攻',
      params: { pyro: false, cryo: false },
      dmg: ({ talent }, dmg) => dmg(talent.a['一段伤害'], 'a')
    }, {
      title: '开E后重击',
      params: { pyro: false, cryo: false },
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2')
    }, {
      title: '开E满染火冰首段普攻',
      params: { pyro: true, cryo: true },
      dmg: ({ talent }, dmg) => dmg(talent.a['一段伤害'], 'a')
    }, {
      title: 'Q伤害',
      params: { pyro: true, cryo: true },
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    }]

    const defDmgIdx = 2
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      title: '羽画·风姿华歌：开启E后额外提升普通[aMulti]%伤害,重击[a2Multi]%伤害',
      data: {
        aMulti: ({ talent }) => talent.e['空居·不生断伤害'] - 100,
        a2Multi: ({ talent }) => talent.e['空居·刀风界伤害'] - 100
      }
    }, {
      title: '天赋拾玉得花：火元素攻击力提升30%,冰元素暴击率提升20%',
      data: {
        atkPct: ({ params }) => params.pyro ? 30 : 0,
        cpct: ({ params }) => params.cryo ? 20 : 0
      }
    }, {
      title: '二番·箙岛月白浪：至多使狂言·式乐五番造成的伤害提升200%',
      cons: 2,
      data: {
        qDmg: 200
      }
    }]
    return { details, defDmgIdx, mainAttr, buffs }
  },
  "温迪": () => {
    const details = [{
      title: '【魔导·秘仪】飓风箭首段总伤害',
      params: { WindsunderArrow : true, cons_6: true },
      dmg: ({ talent }, dmg) => dmg(talent.a['一段伤害'], 'a')
    }, {
      title: '【魔导·秘仪】飓风箭尾段伤害',
      params: { WindsunderArrow : true, cons_6: true },
      dmg: ({ talent }, dmg) => dmg(talent.a['六段伤害'], 'a')
    }, {
      title: 'E点按伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['点按伤害'], 'e')
    }, {
      title: 'Q后E点按伤害',
      params: { cons_2: true, cons_6: true  },
      cons: 2,
      dmg: ({ talent }, dmg) => dmg(talent.e['点按伤害'], 'e')
    }, {
      title: 'Q单段伤害',
      params: { cons_6: true },
      dmg: ({ talent }, dmg) => dmg(talent.q['持续伤害'], 'q')
    }, {
      title: 'Q含转化单段',
      params: { cons_6: true },
      dmg: ({ talent }, dmg) => {
        let basic = dmg(talent.q['持续伤害'], 'q')
        // 暂时以物伤近似计算
        let fj = dmg(talent.q['附加元素伤害'], 'q', 'phy')
        return {
          dmg: basic.dmg + fj.dmg,
          avg: basic.avg + fj.avg
        }
      }
    }, {
      title: '扩散反应伤害',
      dmg: ({}, { reaction }) => reaction('swirl')
    }]

    const defParams = { Hexenzirkel: true } // 魔女会成员
    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      check: ({ params }) => params.WindsunderArrow === true,
      title: '温迪被动：飓风箭造成原本[_aMulti]%的普通攻击伤害',
      data: {
        aMulti: ({ talent }) => talent.a['飓风箭伤害'] - 100,
        _aMulti: ({ talent }) => talent.a['飓风箭伤害']
      }
    }, {
      title: '温迪2命：E降低24%风抗与物抗',
      cons: 2,
      data: {
        kx: 24
      }
    }, {
      check: ({ params }) => params.cons_2 === true,
      title: '温迪2命：施放元素爆发后，点按元素战技将造成原本[_eMulti]%的伤害',
      cons: 2,
      data: {
        eMulti: 200,
        _eMulti: 300
      }
    }, {
      title: '温迪4命：温迪获取元素晶球或元素微粒后，获得25%风元素伤害加成',
      cons: 4,
      data: {
        dmg: 25
      }
    }, {
      check: ({ params }) => params.cons_6 === true,
      title: '温迪6命：受元素爆发伤害的敌人，风元素抗性降低[kx]%，温迪对这些敌人造成的伤害，还会获得[cdmg]%暴击伤害加成',
      cons: 6,
      data: {
        kx: 20,
        cdmg: 100,
      }
    }, 'swirl']

    const createdBy = '喵喵 & 冰翼'
    return { details, defParams, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "烟绯": () => {
    const details = [{
      title: '开Q满丹火印重击',
      params: { dhy: 15 },
      dmg: ({ talent, cons }, dmg) => dmg(talent.a['重击伤害2'][cons * 1 === 6 ? 4 : 3], 'a2')
    }, {
      title: '开Q满丹火印重击蒸发',
      params: { dhy: 15 },
      dmg: ({ talent, cons }, dmg) => dmg(talent.a['重击伤害2'][cons * 1 === 6 ? 4 : 3], 'a2', 'vaporize')
    }, {
      title: 'E伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: '4命护盾量',
      check: ({ cons }) => cons >= 4,
      dmg: ({ attr, calc }, { shield }) => shield(calc(attr.hp) * 0.45)
    }]

    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '烟绯被动：重击消耗4枚丹火印增加20%火伤',
      cons: 6,
      data: {
        a2Dmg: ({ params }) => params.dhy ? 20 : 0
      }
    }, {
      title: '烟绯被动：重击消耗3枚丹火印增加15%火伤',
      check: ({ cons }) => cons < 6,
      data: {
        a2Dmg: ({ params }) => params.dhy ? 15 : 0
      }
    }, {
      title: '烟绯被动：开Q后提高重击伤害[a2Dmg]%',
      data: {
        a2Dmg: ({ talent }) => talent.q['重击伤害提升']
      }
    }, 'vaporize']
    return { details, defDmgIdx, mainAttr, buffs }
  },
  "爱可菲": () => {
    const details = [{
      title: 'E技能伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: 'E「冻霜芭菲」伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['冻霜芭菲伤害'], 'e')
    }, {
      title: 'Q技能伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    }, {
      title: 'Q释放治疗量',
      dmg: ({ talent, attr, calc }, { heal }) => heal(talent.q['治疗量2'][0] / 100 * calc(attr.atk) + talent.q['治疗量2'][1])
    }, {
      title: '天赋每跳治疗',
      dmg: ({ attr, calc }, { heal }) => heal(138.24 / 100 * calc(attr.atk))
    }, {
      title: '6命「特级冻霜芭菲」伤害',
      cons: 6,
      dmg: ({}, dmg) => dmg(500, 'e')
    }]

    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      title: '双冰共鸣：攻击冰元素附着或冻结状态下的敌人时，暴击率提高[cpct]%',
      data: {
        cpct: 15
      }
    }, {
      title: '爱可菲天赋：当队伍中存在4名水/冰元素角色时，爱可菲的元素战技或元素爆发命中敌人后，将使该敌人的水元素抗性与冰元素抗性降低[kx]%',
      data: {
        kx: 55
      }
    }, {
      title: '爱可菲1命：队伍中所有角色的元素类型均为水/冰元素时，爱可菲施放元素战技或元素爆发后，冰元素伤害的暴击伤害提升[cdmg]%',
      cons: 1,
      data: {
        cdmg: 60
      }
    }]

    const createdBy = '冰翼'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "爱诺": () => {
    const details = [
      {
        title: 'E一段伤害',
        dmg: ({ talent }, dmg) => dmg(talent.e['一段伤害'], 'e')
      }, {
        title: 'E二段伤害',
        dmg: ({ talent }, dmg) => dmg(talent.e['二段伤害'], 'e')
      }, {
        title: 'Q水弹伤害',
        dmg: ({ talent }, dmg) => dmg(talent.q['水弹伤害'], 'q')
      }, {
        check: ({ cons }) => cons >= 2,
        title: '二命额外伤害',
        params: { Lunar: true },
        dmg: ({ calc, attr, talent }, { basic }) => basic(calc(attr.mastery) + calc(attr.atk) * 25 / 100, 'q')
      }, {
        title: '满辉月感电伤害',
        params: { Lunar: true, Moonsign: 3 },
        dmg: ({}, { reaction }) => reaction('lunarCharged')
      }, {
        title: '满辉绽放伤害',
        params: { Moonsign: 3 },
        dmg: ({}, { reaction }) => reaction('bloom')
      }
    ]

    const defDmgIdx = 2
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [
      {
        title: '爱诺天赋：[结构化功率提升] 元素爆发造成的伤害提升[qPlus]',
        sort: 9,
        data: {
          qPlus: ({ attr, calc }) => calc(attr.mastery) * 50 / 100
        }
      },
      {
        title: '爱诺1命：施放元素战技或元素爆发后元素精通提升[mastery]点',
        cons: 1,
        data: {
          mastery: 80
        }
      },
      {
        title: '爱诺6命：施放元素爆发后,当前场上角色触发的感电、绽放、月感电、月绽放造成的伤害提升[lunarBloom]%',
        cons: 6,
        data: {
          electroCharged: 35,
          bloom: 35,
          lunarCharged: 35,
          lunarBloom: 35
        }
      }
    ]
    return { details, defDmgIdx, mainAttr, buffs }
  },
  "玛拉妮": () => {
    const details = [{
      title: '巨浪鲨鲨撕咬伤害',
      dmg: ({ talent, calc, attr }, { basic }) => basic(calc(attr.hp) * ( talent.e['鲨鲨撕咬基础伤害'] + talent.e['巨浪鲨鲨撕咬伤害额外提升'] ) / 100, 'a,nightsoul')
    }, {
      check: ({ cons }) => cons < 6,
      title: '巨浪鲨鲨撕咬蒸发',
      dmgKey: 'e',
      dmg: ({ talent, calc, attr }, { basic }) => basic(calc(attr.hp) * ( talent.e['鲨鲨撕咬基础伤害'] + talent.e['巨浪鲨鲨撕咬伤害额外提升'] ) / 100, 'a,nightsoul', 'vaporize')
    }, {
      check: ({ cons }) => cons >= 1,
      title: '强化巨浪鲨鲨撕咬蒸发',
      dmgKey: 'e',
      params: { cons1: true },
      dmg: ({ talent, calc, attr }, { basic }) => basic(calc(attr.hp) * ( talent.e['鲨鲨撕咬基础伤害'] + talent.e['巨浪鲨鲨撕咬伤害额外提升'] ) / 100, 'a,nightsoul', 'vaporize')
    }, {
      title: '爆瀑飞弹伤害',
      dmg: ({ talent, calc, attr }, { basic }) => basic(calc(attr.hp) * talent.q['技能伤害'] / 100, 'q,nightsoul')
    }, {
      title: '爆瀑飞弹蒸发',
      dmg: ({ talent, calc, attr }, { basic }) => basic(calc(attr.hp) * talent.q['技能伤害'] / 100, 'q,nightsoul', 'vaporize')
    }]

    const defParams = { Nightsoul: true }
    const defDmgKey = 'e'
    const mainAttr = 'hp,cpct,cdmg,mastery'

    const buffs = [{
      title: '踏鲨破浪：3层浪势充能使鲨鲨撕咬造成的伤害提升[aPlus]巨浪鲨鲨撕咬伤害额外提升[_aPlus]',
      sort: 9,
      data: {
        aPlus: ({ talent, calc, attr }) => calc(attr.hp) * talent.e['浪势充能伤害提升'] / 100 * 3 ,
        _aPlus: ({ talent, calc, attr }) => calc(attr.hp) * talent.e['巨浪鲨鲨撕咬伤害额外提升'] / 100
      }
    }, {
      title: '玛拉妮天赋：3层逐浪心得使爆瀑飞弹伤害提升[qPlus]',
      sort: 9,
      data: {
        qPlus: ({ calc, attr }) => calc(attr.hp) * 45 / 100
      }
    }, {
      check: ({ params }) => params.cons1 === true,
      title: '玛拉妮1命：第一次巨浪鲨鲨撕咬及它所触发的鲨鲨飞弹造成的伤害提升[aPlus]',
      cons: 1,
      sort: 9,
      data: {
        aPlus: ({ calc, attr }) => calc(attr.hp) * 66 / 100
      }
    }, {
      title: '玛拉妮4命：爆瀑飞弹造成的伤害提升[qDmg]%',
      cons: 4,
      data: {
        qDmg: 75
      }
    }
    /*
    , {
      title: '幻境祝福：角色编入队伍后，生命值、攻击力与防御力提升[hpPct]%,该效果不论是否在幻想真境剧诗中都将生效。',
      data: {
        hpPct: 20,
        atkPct: 20,
        defPct: 20
      }
    }
    */
    ]

    const createdBy = 'liangshi'
    return { details, defParams, defDmgKey, mainAttr, buffs, createdBy }
  },
  "玛薇卡": () => {
    const details = [{
      title: '满战意E焚曜之环伤害',
      params: { Ring: true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.e['焚曜之环伤害'], 'e,nightsoul')
    },{
      title: '满战意驰轮车重击循环伤害',
      params: { Flamestrider: true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.e['驰轮车重击循环伤害'], 'a2,nightsoul')
    },{
      title: '满战意驰轮车重击循环融化伤害',
      params: { Flamestrider: true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.e['驰轮车重击循环伤害'], 'a2,nightsoul', 'melt')
    },{
      title: '满战意Q技能伤害',
      params: { Flamestrider: true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.q['技能伤害'], 'q,nightsoul')
    },{
      title: '满战意Q融化伤害',
      params: { Flamestrider: true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.q['技能伤害'], 'q,nightsoul', 'melt')
    },{
      title: '班玛希茜满战意驰轮车重击循环融化伤害',
      params: { team: true, Flamestrider: true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.e['驰轮车重击循环伤害'], 'a2,nightsoul', 'melt')
    },{
      title: '班玛希茜满战意Q融化伤害',
      params: { team: true, Flamestrider: true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.q['技能伤害'], 'q,nightsoul', 'melt')
    },{
      title: '班玛希茜(高配)满战意Q融化伤害',
      params: { team_best: true, Flamestrider: true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.q['技能伤害'], 'q,nightsoul', 'melt')
    }]

    const defParams = { Nightsoul: true }
    const defDmgIdx = 6
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      check: ({ params }) => params.Flamestrider === true,
      title: '玛薇卡元素爆发：满战意施放元素爆发后，坠日斩伤害提升[qPlus]，驰轮车普通攻击伤害提升[aPlus]，驰轮车重击伤害提升[a2Plus]',
      sort: 9,
      data: {
        qPlus: ({ talent, calc, attr }) => 200 * talent.q['坠日斩伤害提升'] * calc(attr.atk) / 100 ,
        aPlus: ({ talent, calc, attr }) => 200 * talent.q['驰轮车普通攻击伤害提升'] * calc(attr.atk) / 100 ,
        a2Plus: ({ talent, calc, attr }) => 200 * talent.q['驰轮车重击伤害提升'] * calc(attr.atk) / 100 ,
      }
    },{
      title: '玛薇卡天赋：队伍中的附近的角色触发「夜魂迸发」时，攻击力提升[atkPct]%',
      data: {
        atkPct: 30
      }
    },{
      title: '玛薇卡天赋：施放元素爆发后，如果拥有满层战意，则造成的伤害提升[dmg]%',
      data: {
        dmg: 40
      }
    },{
      title: '玛薇卡1命：获取战意后，玛薇卡的攻击力提升[atkPct]%',
      cons: 1,
      data: {
        atkPct: 40
      }
    },{
      title: '玛薇卡2命：基础攻击力提升[atkBase]',
      sort: 2,
      cons: 2,
      data: {
        atkBase: 200
      }
    },{
      check: ({ params }) => params.Ring === true,
      title: '玛薇卡2命：夜魂加持状态下时，焚曜之环附近的敌人的防御力降低[enemyDef]',
      cons: 2,
      data: {
        enemyDef: 20
      }
    },{
      title: '玛薇卡2命：夜魂加持状态下时，普通攻击伤害提升[aPlus]，重击伤害提升[a2Plus]，元素爆发伤害提升[qPlus]',
      sort: 9,
      cons: 2,
      data: {
        aPlus: ({ calc, attr }) => calc(attr.atk) * 60 / 100,
        a2Plus: ({ calc, attr }) => calc(attr.atk) * 90 / 100,
        qPlus: ({ calc, attr }) => calc(attr.atk) * 120 / 100
      }
    },{
      title: '玛薇卡4命：施放元素爆发燔天之时后额外获得[dmg]%伤害加成 ',
      cons: 4,
      data: {
        dmg: 10
      }
    },{
      check: ({ params }) => params.Flamestrider === true,
      title: '玛薇卡6命：驾驶驰轮车时使附近的敌人的防御力降低[enemyDef]% ',
      cons: 6,
      data: {
        enemyDef: 20
      }
    },{
      check: ({ params }) => params.team === true,
      title: '班玛希茜：班尼特6命风鹰剑宗室4、希诺宁0+0勇者4、茜特菈莉0+0',
      data: {
        atkPlus: 1203,
        atkPct: 25 + 20,
        dmg: 15 + 40,
        kx: 36 + 20
      }
    },{
      check: ({ params }) => params.team_best === true,
      title: '班玛希茜（高配）：班尼特6命风鹰剑宗室4、希诺宁6+5教官4、茜特菈莉6+5勇者4（茜特菈莉精通最终面板，按1500计）',
      data: {
        atkPlus: 1203,
        atkPct: 25 + 20 + 45,
        dmg: 15 + 40 + 51.2 + 56 + 60,
        kx: 45 + 20 + 20,
        qPlus: 1500 * 2,
        mastery: 250 + 120
      }
    }]

    const createdBy = '冰翼'
    return { details, defParams, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "珊瑚宫心海": () => {
    const details = [{
      check: ({ cons }) => cons < 2,
      title: '半血水母每跳治疗',
      dmgKey: 'q',
      dmg: ({ attr, talent, calc }, { heal }) => {
        let t = talent.e['治疗量2']
        let hp = calc(attr.hp)
        return heal(hp * t[0] / 100 + t[1] * 1)
      }
    }, {
      cons: 2,
      title: '半血水母每跳治疗',
      dmgKey: 'q',
      dmg: ({ attr, talent, calc }, { heal }) => {
        let t = talent.e['治疗量2']
        let hp = calc(attr.hp)
        return heal(hp * t[0] / 100 + t[1] * 1 + hp * 0.045)
      }
    }, {
      title: '开Q普攻三段伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['三段伤害'], 'a')
    }, {
      title: '开Q重击伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2')
    }, {
      title: '开Q普攻三段总伤',
      dmg: ({ attr, talent, cons, calc }, dmg) => {
        let ret = { dmg: 0, avg: 0 }
        lodash.forEach('一二三'.split(''), (num) => {
          let dmgRet = dmg(talent.a[`${num}段伤害`], 'a')
          ret.dmg += dmgRet.dmg
          ret.avg += dmgRet.avg
        })
        if (cons > 0) {
          let dmgRet = dmg.basic(calc(attr.hp) * 0.3)
          ret.dmg += dmgRet.dmg
          ret.avg += dmgRet.avg
        }
        return ret
      }
    }]
    const defDmgKey = 'q'
    const defDmgIdx = 2
    const mainAttr = 'hp,atk'

    const buffs = [{
      title: '心海被动：暴击率降低100%，治疗加成提高25%',
      isStatic: true,
      data: {
        cpct: -100,
        heal: 25
      }
    }, {
      title: '心海被动：开Q后重击伤害基于治疗加成提高[aPlus]',
      sort: 9,
      data: {
        aPlus: ({ attr, calc }) => calc(attr.hp) * calc(attr.heal) * 0.15 / 100,
        a2Plus: ({ attr, calc }) => calc(attr.hp) * calc(attr.heal) * 0.15 / 100
      }
    }, {
      title: '海人化羽：开Q后普攻伤害提高[aPlus]',
      sort: 9,
      data: {
        aPlus: ({ attr, talent, calc }) => calc(attr.hp) * talent.q['普通攻击伤害提升'] / 100
      }
    }, {
      title: '海人化羽：开Q后重击伤害提高[a2Plus]',
      sort: 9,
      data: {
        a2Plus: ({ attr, talent, calc }) => calc(attr.hp) * talent.q['重击伤害提升'] / 100
      }
    }, {
      title: '心海1命：开Q后第三段普攻额外释放一只游鱼，造成生命值上限30%的水元素伤害',
      cons: 1
    }, {
      title: '心海6命：开Q攻击获得治疗后，获得40%水伤加成',
      sort: 6,
      cons: 6,
      data: {
        dmg: 40
      }
    }]
    return { details, defDmgKey, defDmgIdx, mainAttr, buffs }
  },
  "珐露珊": () => {
    const details = [{
      title: '开Q提供风系伤害',
      dmg: ({ attr }) => {
        return {
          avg: (attr.atk.base || 0) * 0.32
        }
      }
    }, {
      title: 'E减抗后Q伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    }, {
      check: ({ cons }) => cons >= 6,
      title: '开Q后E后台伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['风压坍陷风涡伤害'], 'e')
    }, {
      title: '开Q后飓烈箭伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['满蓄力瞄准射击'], 'a2')
    }]

    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      title: '珐露珊6命：Q提升暴击伤害40%',
      cons: 6,
      data: {
        cdmg: 40
      }
    }, {
      title: '诡风之祸：降低敌人风抗[kx]%',
      data: {
        kx: 30
      }
    }, {
      title: '祈风之赐：获得风伤加成[dmg]%',
      data: {
        dmg: ({ talent }) => talent.q['风元素伤害加成']
      }
    }, {
      title: '珐露珊天赋：处于「祈风之赐」效果下角色的普通攻击、重击、下落攻击、元素战技或元素爆发对敌人造成风元素伤害时，基于珐露珊基础攻击力的32%，提高造成的伤害。',
      data: {
        aPlus: ({ attr }) => attr.atk.base * 32 / 100 ,
        a2Plus: ({ attr }) => attr.atk.base * 32 / 100 ,
        a3Plus: ({ attr }) => attr.atk.base * 32 / 100 ,
        ePlus: ({ attr }) => attr.atk.base * 32 / 100 ,
        qPlus: ({ attr }) => attr.atk.base * 32 / 100
      }
    }]
    return { details, defDmgIdx, mainAttr, buffs }
  },
  "班尼特": () => {
    const details = [{
      title: '点赞攻击力提升',
      dmg: ({ attr, talent, cons }) => {
        let baseAtk = attr.atk.base
        let pct = talent.q['攻击力加成比例']
        if (cons >= 1) {
          pct += 20
        }
        return {
          avg: baseAtk * pct / 100
        }
      }
    }, {
      title: 'Q+点E总伤害',
      dmg: ({ attr, talent, cons }, dmg) => {
        let eDmg = dmg(talent.e['点按伤害'], 'e')
        let qDmg = dmg(talent.q['技能伤害'], 'q')
        return {
          avg: eDmg.avg + qDmg.avg,
          dmg: eDmg.dmg + qDmg.dmg
        }
      }
    }, {
      title: '点赞每跳治疗',
      dmg: ({ attr, calc, talent }, { heal }) => heal(talent.q['持续治疗2'][0] * calc(attr.hp) / 100 + talent.q['持续治疗2'][1] * 1)
    }]

    const defDmgIdx = 2
    const mainAttr = 'atk,hp,cpct,cdmg'

    const buffs = [{
      cons: 1,
      title: '班尼特1命：Q攻击力提升比例提高20%'
    }, {
      cons: 6,
      title: '班尼特6命：获得15%火伤加成',
      data: {
        dmg: 15
      }
    }]
    return { details, defDmgIdx, mainAttr, buffs }
  },
  "琳妮特": () => {
    const details = [{
      title: 'E技能伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['谜影突刺伤害'], 'e')
    }, {
      title: 'Q释放伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    }, {
      title: 'Q每段风伤',
      dmg: ({ talent }, dmg) => dmg(talent.q['惊奇猫猫盒伤害'], 'q')
    }, {
      title: 'Q转化元素每段伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['彩练术弹伤害'], 'q', 'phy')// 以物伤近似
    }]

    const defDmgIdx = 0
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      title: '天赋-巧施协同：开Q后，队伍中所有角色攻击力提升20%（按四色队计算）',
      data: {
        atkPct: 20
      }
    }, {
      title: '天赋-道具完备：Q发生元素转化后，Q造成伤害提升15%',
      data: {
        qDmg: 15
      }
    }, {
      title: '琳妮特6命：释放E突刺时，风元素伤害加成提升20%',
      cons: 6,
      data: {
        dmg: 20
      }
    }]

    const createdBy = 'Aluxes'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "琴": () => {
    const details = [{
      title: '风压剑伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: 'Q爆发伤害',
      params: { q: true },
      dmg: ({ talent }, dmg) => dmg(talent.q['爆发伤害'], 'q')
    }, {
      title: 'Q爆发治疗',
      dmg: ({ talent, calc, attr }, { heal }) =>
        heal(talent.q['领域发动治疗量2'][0] * calc(attr.atk) / 100 + talent.q['领域发动治疗量2'][1] * 1)
    }, {
      title: 'Q每跳治疗',
      dmg: ({ talent, calc, attr }, { heal }) =>
        heal(talent.q['持续治疗2'][0] * calc(attr.atk) / 100 + talent.q['持续治疗2'][1] * 1)
    }]

    const mainAttr = 'atk,cpct,cdmg'
    const defDmgIdx = 2

    const buffs = [{
      cons: 1,
      title: '琴1命：长按1秒后风压剑伤害提升40%',
      data: {
        eDmg: 40
      }
    }, {
      cons: 4,
      title: '琴4命：蒲公英之风的领域内敌人风元素抗性降低40%',
      data: {
        kx: ({ params }) => params.q ? 40 : 0
      }
    }]
    return { details, mainAttr, defDmgIdx, buffs }
  },
  "瑶瑶": () => {
    const details = [{
      title: 'E每跳治疗',
      dmg: ({ talent, calc, attr }, { heal }) =>
        heal(talent.e['白玉萝卜治疗量2'][0] * calc(attr.hp) / 100 + talent.e['白玉萝卜治疗量2'][1])
    }, {
      title: 'E每跳伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['白玉萝卜伤害'], 'e')
    }, {
      title: 'Q每跳治疗',
      dmg: ({ talent, calc, attr }, { heal }) =>
        heal(talent.q['桂子仙机白玉萝卜治疗量2'][0] * calc(attr.hp) / 100 + talent.q['桂子仙机白玉萝卜治疗量2'][1])
    }, {
      title: '萝卜炸裂天赋治疗',
      dmg: ({ calc, attr }, { heal }) => heal(calc(attr.hp) * 0.8 / 100)
    }, {
      title: '6命大萝卜治疗',
      cons: 6,
      dmg: ({ calc, attr }, { heal }) => heal(calc(attr.hp) * 7.5 / 100)
    }]

    const mainAttr = 'atk,hp,cpct,cdmg'

    const buffs = [{
      title: '瑶瑶1命：萝卜炸裂获得15%草伤加成',
      cons: 1,
      data: {
        dmg: 15
      }
    }, {
      title: '瑶瑶4命：释放E或Q后，提升元素精通[mastery]点',
      cons: 4,
      sort: 5,
      data: {
        mastery: ({ calc, attr }) => calc(attr.hp) * 0.3 / 100
      }
    }]
    return { details, mainAttr, buffs }
  },
  "瓦列里": () => {
    const details = [
      {
        title: '特殊重击 臼炮直射·抵近轰击',
        params: { cons_6: true },
        dmg: ({ talent }, dmg) => dmg(talent.a['臼炮直射·抵近轰击伤害'], 'a2')
      },
      {
        title: 'E护盾量',
        dmg: ({ attr, calc, talent }, { shield }) => shield(calc(attr.atk) * talent.e['护盾吸收量2'][0] / 100 + talent.e['护盾吸收量2'][1])
      },
      {
        title: '雷元素伤害增加',
        dmg: ({ attr, calc, talent }) => {
          return {
            avg: talent.a["雷元素伤害增加"] * calc(attr.atk) / 100
          }
        }
      },
      {
        title: '星超导反应伤害增加',
        dmg: ({ attr, calc, talent }) => {
          return {
            avg: talent.a["星超导反应伤害增加"] * calc(attr.atk) / 100
          }
        }
      }
    ]

    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [
      {
        cons: 6,
        check: ({ params }) => params.cons_6 === true,
        title: '瓦列里6命：特殊重击 臼炮直射·抵近轰击造成的伤害提升[dmg]%',
        data: {
          dmg: 100
        }
      }
    ]

    const createdBy = '冰翼'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "瓦雷莎": () => {
    const details = [{
      title: '重击伤害',
      dmg: ({ talent, attr }, dmg) => dmg(talent.a['重击伤害'], 'a2,nightsoul')
    }, {
      title: '「炽热激情」重击伤害',
      dmg: ({ talent, attr }, dmg) => dmg(talent.a['炽热激情状态重击伤害'], 'a2,nightsoul')
    }, {
      title: 'EZ后下落伤害',
      params: { Rainbow_Crash: true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.a['低空/高空坠地冲击伤害'][1], 'a3,nightsoul')
    }, {
      title: 'EZ后「炽热激情」下落伤害',
      params: { Rainbow_Crash_FP: true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.a['炽热激情状态低空/高空坠地冲击伤害'][1], 'a3,nightsoul')
    }, {
      title: '4命「精进勇猛」满BUFF下落伤害',
      params: { Rainbow_Crash_FP: true, cons4_a3: true },
      cons: 4,
      dmg: ({ talent, attr }, dmg) => dmg(talent.a['炽热激情状态低空/高空坠地冲击伤害'][1], 'a3,nightsoul')
    }, {
      title: 'E突进伤害',
      dmg: ({ talent, attr }, dmg) => dmg(talent.e['突进伤害'], 'e,nightsoul')
    }, {
      title: '「炽热激情」E突进伤害',
      dmg: ({ talent, attr }, dmg) => dmg(talent.e['炽热激情状态突进伤害'], 'e,nightsoul')
    }, {
      title: 'Q飞踢伤害',
      dmg: ({ talent, attr }, dmg) => dmg(talent.q['飞踢伤害'], 'q,nightsoul')
    }, {
      title: '「炽热激情」Q飞踢伤害',
      params: { cons4_q: true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.q['炽热激情状态飞踢伤害'], 'q,nightsoul')
    }, {
      title: 'Q「大火山崩落」伤害',
      params: { cons1_q2: true, cons4_q: true },
      dmg: ({ talent, attr }, dmg) => dmg(talent.q['「大火山崩落」伤害'], 'a3,nightsoul')
    }]

    const defParams = { Nightsoul: true }
    const defDmgIdx = 9
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      check: ({ params }) => params.Rainbow_Crash === true,
      title: '瓦雷莎天赋：施放元素战技后的5秒内，坠地冲击能额外造成[a3Pct]%攻击力的伤害。',
      data: {
        a3Pct: ({ cons }) => cons < 1 ? 50 : 180
      }
    }, {
      check: ({ params }) => params.Rainbow_Crash_FP === true,
      title: '瓦雷莎天赋：施放元素战技后的5秒内，炽热激情状态下的坠地冲击能额外造成[a3Pct]%攻击力的伤害',
      data: {
        a3Pct: 180
      }
    }, {
      title: '瓦雷莎天赋：队伍中的附近的角色触发「夜魂迸发」时，瓦雷莎的攻击力至多可提升[atkPct]%',
      data: {
        atkPct: 35 * 2
      }
    }, {
      check: ({ params }) => params.cons1_q2 === true,
      title: '瓦雷莎1命：进行特殊下落攻击时，坠地冲击同样也会额外造成[atkPct]%攻击力的伤害',
      cons: 1,
      data: {
        a3Pct: 180
      }
    }, {
      check: ({ params }) => params.cons4_a3 === true,
      title: '瓦雷莎4命：施放元素爆发时，若不处于炽热激情状态或极限驱动状态，基于瓦雷莎攻击力的500%，提升瓦雷莎进行下落攻击时坠地冲击造成的伤害',
      sort: 9,
      cons: 4,
      data: {
        a3Plus: ({ calc, attr }) => Math.min(calc(attr.atk) * 500 / 100, 20000)
      }
    }, {
      check: ({ params }) => params.cons4_q === true,
      title: '瓦雷莎4命：施放元素爆发时，若处于炽热激情状态或极限驱动状态，本次元素爆发造成的伤害提升[dmg]%',
      cons: 4,
      data: {
        dmg: 100
      }
    }, {
      title: '瓦雷莎6命：下落攻击与元素爆发的暴击率提升10%，暴击伤害提升100%。',
      cons: 6,
      data: {
        a3Cpct: 10,
        qCpct: 10,
        a3Cdmg: 100,
        qCdmg: 100
      }
    }]

    const createdBy = '冰翼'
    return { details, defParams, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "甘雨": () => {
    const details = [{
      title: '霜华绽发伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['霜华矢·霜华绽发伤害'], 'a2')
    }, {
      title: '霜华矢两段总伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['霜华矢·霜华绽发伤害'] + talent.a['霜华矢命中伤害'], 'a2')
    }, {
      title: '霜华矢两段+融化',
      dmg: ({ talent }, dmg) => dmg(talent.a['霜华矢·霜华绽发伤害'] + talent.a['霜华矢命中伤害'], 'a2', 'melt')
    }, {
      title: 'Q单个冰凌伤害',
      params: {
        q: 1
      },
      dmg: ({ talent }, dmg) => dmg(talent.q['冰棱伤害'], 'q')
    }]

    const defDmgIdx = 2
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      cons: 0,
      title: '甘雨被动：霜华矢发射后的5秒内霜华矢暴击率提高20%',
      data: {
        a2Cpct: 20
      }
    }, {
      cons: 1,
      title: '甘雨1命：霜华失命中减少敌人15%冰抗',
      data: {
        kx: ({ params }) => params.q ? 0 : 15
      }
    }, {
      cons: 4,
      title: '甘雨4命：大招领域内敌人受到的伤害提升25%',
      data: {
        dmg: ({ params }) => params.q ? 25 : 0
      }
    }, 'melt']
    return { details, defDmgIdx, mainAttr, buffs }
  },
  "申鹤": () => {
    const details = [{
      title: 'E基础伤害提升值',
      dmg: ({ talent, calc, attr }) => {
        return {
          avg: talent.e['伤害值提升'] * calc(attr.atk) / 100
        }
      }
    }, {
      title: 'E点按技能伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['点按技能伤害'], 'e')
    }, {
      title: 'E长按技能伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['长按技能伤害'], 'e')
    }, {
      title: 'Q每跳伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['持续伤害'], 'q')
    }]

    const buffs = [{
      title: '天赋-大洞弥罗尊法：Q范围内冰伤提高15%',
      data: {
        dmg: 15
      }
    }, {
      title: '天赋-缚灵通真法印：点按E提高15%元素战技及元素爆发伤害，长按E提高15%普攻、重击和下落攻击伤害',
      data: {
        eDmg: 15,
        qDmg: 15,
        aDmg: 15,
        a2Dmg: 15,
        a3Dmg: 15
      }
    }, {
      title: '申鹤2命：Q范围内暴击伤害提高15%',
      cons: 2,
      data: {
        cdmg: 15
      }
    }, {
      title: '申鹤天赋：E提升冰伤害[ePlus]',
      sort: 9,
      data: {
        ePlus: ({ talent, calc, attr }) => talent.e['伤害值提升'] * calc(attr.atk) / 100,
        qPlus: ({ talent, calc, attr }) => talent.e['伤害值提升'] * calc(attr.atk) / 100
      }
    }]
    return { details, buffs }
  },
  "白术": () => {
    const details = [{
      title: 'E每跳治疗量',
      dmg: ({ talent, calc, attr }, { heal }) => heal(calc(attr.hp) * talent.e['治疗量2'][0] / 100 + talent.e['治疗量2'][1])
    }, {
      title: '2命·E+额外治疗量',
      cons: 2,
      dmg: ({ talent, calc, attr }, { heal }) => heal((calc(attr.hp) * talent.e['治疗量2'][0] / 100 + talent.e['治疗量2'][1]) * 1.2)
    }, {
      title: 'Q每跳治疗量',
      dmg: ({ talent, calc, attr }, { heal }) =>
        heal(talent.q['无郤气护盾治疗量2'][0] * calc(attr.hp) / 100 + talent.q['无郤气护盾治疗量2'][1])
    }, {
      title: 'Q每跳护盾吸收量',
      dmg: ({ talent, calc, attr }, { shield }) => shield(talent.q['无郤气护盾吸收量2'][0] * calc(attr.hp) / 100 + talent.q['无郤气护盾吸收量2'][1])
    }, {
      title: 'Q每跳伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['灵气脉技能伤害'], 'q')
    }, {
      title: 'Q每跳激化伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['灵气脉技能伤害'], 'q', 'spread')
    }]

    const mainAttr = 'atk,hp,cpct,cdmg'

    const buffs = [{
      cons: 4,
      title: '白术4命：释放Q之后，队伍中附近所有角色元素精通提升80点',
      data: {
        mastery: 80
      }
    }, {
      cons: 6,
      title: '白术6命：基于生命值上限的8%，灵气脉造成的伤害提高[qPlus]',
      sort: 9,
      data: {
        qPlus: ({ attr, calc }) => calc(attr.hp) * 0.08
      }
    }, 'spread']
    return { details, mainAttr, buffs }
  },
  "砂糖": () => {
    const details = [{
      title: 'E伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: 'Q每跳基础伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['持续伤害'], 'q')
    }, {
      title: '为队友提升精通',
      dmg: ({ calc, attr }) => {
        return {
          avg: calc(attr.mastery) * 0.2 + 50 + (attr.mastery.inc || 0)
        }
      }
    }, {
      title: '扩散反应伤害',
      dmg: ({}, { reaction }) => reaction('swirl')
    }]

    const defParams = { Hexenzirkel: true } // 魔女会成员
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = ['swirl']
    return { details, defParams, mainAttr, buffs }
  },
  "神里绫人": () => {
    const details = [{
      title: 'E后瞬水剑三段伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['三段瞬水剑伤害'], 'a')
    }, {
      title: 'E后瞬水剑三段蒸发',
      dmg: ({ talent }, dmg) => dmg(talent.e['三段瞬水剑伤害'], 'a', 'vaporize')
    }, {
      title: '神里流·水囿每段伤害',
      params: { q: 1 },
      dmg: ({ talent }, dmg) => dmg(talent.q['水花剑伤害'], 'q')
    }]

    const defDmgIdx = 1
    const mainAttr = 'hp,atk,cpct,cdmg,mastery'

    const buffs = [{
      cons: 2,
      title: '绫人2命：3层浪闪以上时提高50%生命值',
      data: {
        hpPct: ({ params }) => params.q ? 0 : 50
      }
    }, {
      cons: 1,
      title: '绫人1命：对于生命值低于或等于50%的敌人，瞬水剑造成的伤害提升40%',
      data: {
        aDmg: 40
      }
    }, {
      check: ({ cons }) => cons < 2,
      sort: 9,
      title: '4层浪闪：提高瞬水剑伤害[aPlus]',
      data: {
        aPlus: ({ attr, calc, talent }) => calc(attr.hp) * talent.e['浪闪伤害值提高'] / 100 * 4
      }
    }, {
      cons: 2,
      sort: 9,
      title: '绫人2命：5层浪闪提高瞬水剑伤害[aPlus]',
      data: {
        aPlus: ({ attr, calc, talent }) => calc(attr.hp) * talent.e['浪闪伤害值提高'] / 100 * 5
      }
    }, 'vaporize']
    return { details, defDmgIdx, mainAttr, buffs }
  },
  "神里绫华": () => {
    const details = [{
      title: '霰步E后重击总伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2')
    }, {
      title: '神里流·冰华 伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: '神里流·霜灭 单段伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['切割伤害'], 'q')
    }]

    const mainAttr = 'atk,cpct,cdmg'
    const defDmgIdx = 2

    const buffs = [{
      passive: 1,
      title: '神里被动：释放E后普攻与重击伤害提高30%',
      data: {
        aDmg: 30,
        a2Dmg: 30
      }
    }, {
      passive: 2,
      title: '神里被动：霰步命中敌人获得18%冰伤加成',
      data: {
        dmg: 18
      }
    }, {
      cons: 4,
      title: '神里4命：元素爆发后敌人防御力降低30%',
      data: {
        qDef: 30
      }
    }, {
      cons: 6,
      title: '神里6命：每10秒重击伤害提高[a2Dmg]%',
      data: {
        a2Dmg: 298
      }
    }, {
      title: '双冰共鸣：攻击冰元素附着或冻结状态下的敌人时，暴击率提高[cpct]%',
      data: {
        cpct: 15
      }
    }]
    return { details, mainAttr, defDmgIdx, buffs }
  },
  "米卡": () => {
    const details = [{
      title: 'Q施放治疗量',
      dmg: ({ talent, calc, attr }, { heal }) => heal(talent.q['施放治疗量2'][0] * calc(attr.hp) / 100 + talent.q['施放治疗量2'][1])
    }, {
      title: '鹰翎治疗量',
      dmg: ({ talent, calc, attr }, { heal }) => heal(talent.q['鹰翎治疗量2'][0] * calc(attr.hp) / 100 + talent.q['鹰翎治疗量2'][1])
    }]

    const mainAttr = 'hp,cpct,cdmg'

    const buffs = []
    return { details, mainAttr, buffs }
  },
  "米提亚": () => {
    const details = [
      {
        title: '特殊重击·递变聚爆星超导伤害',
        params: { cons_1: true, cons_2_2: true, Starsealed_Edict: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(calc(attr.mastery) * talent.a['递变聚爆星超导伤害'] / 100, '', 'stellarConduct')
      },
      {
        title: 'E稳态炉心消耗递变信标伤害',
        params: { skills_1: true, cons_2_1: true, cons_6: true, Starsealed_Edict: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(calc(attr.mastery) * talent.e['稳态炉心消耗递变信标伤害'] / 100, '', 'stellarConduct')
      },
      {
        title: '(单枚信标) E稳态炉心引爆伤害',
        params: { skills_1: true, cons_2_1: true, cons_6: true, Starsealed_Edict: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(calc(attr.mastery) * talent.e['稳态炉心引爆伤害'] / 100, '', 'stellarConduct')
      },
      {
        title: '(稳态炉心) Q技能伤害',
        params: { skills_1: true, cons_1: true, cons_2_1: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic((calc(attr.atk) * talent.q['技能伤害2'][0] + calc(attr.mastery) * talent.q['技能伤害2'][1]) / 100, 'q')
      },
      {
        title: '(过载炉心) Q技能伤害',
        params: { cons_1: true, cons_2_2: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic((calc(attr.atk) * talent.q['技能伤害2'][0] + calc(attr.mastery) * talent.q['技能伤害2'][1]) / 100, 'q')
      },
      {
        cons: 4,
        title: '(稳态炉心) 4命追加星超导伤害',
        params: { skills_1: true, cons_2_1: true, Starsealed_Edict: true },
        dmg: ({ attr, calc }, { basic }) => basic(calc(attr.mastery) * 300 / 100, '', 'stellarConduct')
      },
      {
        cons: 4,
        title: '(过载炉心) 4命追加星超导伤害',
        params: { cons_2_2: true, Starsealed_Edict: true },
        dmg: ({ attr, calc }, { basic }) => basic(calc(attr.mastery) * 300 / 100, '', 'stellarConduct')
      }
    ]

    const defDmgIdx = 0
    const mainAttr = 'mastery,cpct,cdmg'

    const buffs = [
      {
        check: ({ params }) => params.skills_1 === true,
        title: '天赋[基准承压测验]：稳态炉心存在，且递变信标携带数量达到上限时，元素精通提升[mastery]点',
        data: {
          mastery: ({ cons }) => 30 * (cons >= 1 ? 5 : 4)
        }
      },
      {
        title: '天赋[超限易爆试剂]：创造递变信标后，暴击率最高提升[cpct]%',
        data: {
          cpct: 5 * 4
        }
      },
      {
        title: '天赋[星耀祝礼·极密协议]：基于米提亚的精通，对队伍中角色造成的星超导反应提升[fypct]%的基础伤害',
        sort: 9,
        data: {
          fypct: ({ attr, calc }) => Math.min(calc(attr.mastery) * 0.028, 14)
        }
      },
      {
        cons: 1,
        check: ({ params }) => params.cons_1 === true,
        title: '米提亚1命：侦测炉心存在期间，场上角色的暴击伤害提升[cdmg]%',
        data: {
          cdmg: 40
        }
      },
      {
        cons: 2,
        title: '米提亚2命：处于极星辉域内的所有敌人雷元素抗性降低[kx]%',
        data: {
          kx: 20
        }
      },
      {
        cons: 2,
        check: ({ params }) => params.cons_2_1 === true,
        title: '米提亚2命：稳态炉心存在期间，元素精通提升[mastery]点',
        data: {
          mastery: 123
        }
      },
      {
        cons: 2,
        check: ({ params }) => params.cons_2_2 === true,
        title: '米提亚2命：过载炉心存在期间，元素精通提升[mastery]点',
        data: {
          mastery: 234
        }
      },
      {
        cons: 6,
        check: ({ params }) => params.cons_6 === true,
        title: '米提亚6命：稳态炉心造成原本[_multi]%的伤害',
        data: {
          _multi: 115,
          multi: 15
        }
      },
      {
        cons: 6,
        title: '米提亚6命：星烁反应伤害擢升[elevated]%',
        data: {
          elevated: 20
        }
      }
    ]

    const createdBy = '冰翼'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "纳西妲": () => {
    const details = [{
      title: 'E长按伤害',
      params: { e: true, q: false },
      dmg: ({ talent }, dmg) => dmg(talent.e['长按伤害'], 'e')
    }, {
      title: '灭净三业伤害',
      params: { e2: true, q: false },
      dmg: ({ talent, attr }, { basic }) => {
        const td = talent.e['灭净三业伤害2']
        const em = attr.mastery
        const atk = attr.atk
        return basic(td[0] * atk / 100 + td[1] * em / 100, 'e')
      }
    }, {
      title: '开Q灭净三业伤害',
      params: { e2: true },
      dmg: ({ talent, attr }, { basic }) => {
        const td = talent.e['灭净三业伤害2']
        const em = attr.mastery
        const atk = attr.atk
        return basic(td[0] * atk / 100 + td[1] * em / 100, 'e')
      }
    }, {
      title: '灭净三业·蔓激化',
      params: { e2: true, q: false },
      dmg: ({ talent, attr }, { basic }) => {
        const td = talent.e['灭净三业伤害2']
        const em = attr.mastery
        const atk = attr.atk
        return basic(td[0] * atk / 100 + td[1] * em / 100, 'e', 'spread')
      }
    }, {
      title: '开Q灭净三业·蔓激化',
      params: { e2: true },
      dmg: ({ talent, attr }, { basic }) => {
        const td = talent.e['灭净三业伤害2']
        const em = attr.mastery
        const atk = attr.atk
        return basic(td[0] * atk / 100 + td[1] * em / 100, 'e', 'spread')
      }
    }, {
      title: '六命特殊E伤害',
      cons: 6,
      dmg: ({ attr }, { basic }) => basic(attr.atk * 2.00 + attr.mastery * 4.00, 'e')
    }, {
      title: '六命特殊E伤害·蔓激化',
      cons: 6,
      dmg: ({ attr }, { basic }) => basic(attr.atk * 2.00 + attr.mastery * 4.00, 'e', 'spread')
    }]

    const defDmgIdx = 4
    const mainAttr = 'atk,mastery,cpct,cdmg'
    const defParams = { mArtisDiffCount: 2 }

    const buffs = [{
      title: '草神1命：火元素队友额外计入1位',
      cons: 1
    }, {
      title: '草神2命：激化相关反应降低敌人防御力30%',
      cons: 2,
      data: {
        enemyDef: 30
      }
    }, {
      title: '草神4命：E4个敌人提升精通160',
      cons: 4,
      data: {
        mastery: 160
      }
    }, {
      title: '草神被动：开Q元素精通提升[mastery]',
      sort: 7,
      data: {
        mastery: ({ attr, params }) => (params.q === false ? 0 : 1) * Math.min(250, attr.mastery * 0.25)
      }
    }, {
      title: '草神被动：基于元素精通提升灭净三业伤害[eDmg]%，暴击率[eCpct]%',
      sort: 9,
      data: {
        eDmg: ({ attr, params }) => (params.e ? 0 : 1) * Math.min(80, (attr.mastery - 200) * 0.1),
        eCpct: ({ attr, params }) => (params.e ? 0 : 1) * Math.min(24, (attr.mastery - 200) * 0.03)
      }
    }, {
      title: '草神Q：开Q提升灭净三业伤害[eDmg]%',
      data: {
        eDmg: ({ cons, talent, params }) => (params.q === false ? 0 : 1) *
          (cons >= 1 ? talent.q['火2伤害提升'] : talent.q['火1伤害提升'])
      }
    }, 'spread']
    return { details, defDmgIdx, mainAttr, defParams, buffs }
  },
  "绮良良": () => {
    const details = [{
      title: '秘法·惊喜特派伤害',
      talent: 'q',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    }, {
      title: '护盾最大吸收量',
      talent: 'e',
      dmg: ({ talent, calc, attr }, { shield }) => shield(talent.e['护盾吸收量上限2'][0] * calc(attr.hp) / 100 + talent.e['护盾吸收量上限2'][1] * 1)
    }]

    const mainAttr = 'atk,hp,cpct,cdmg'

    const buffs = [{
      title: '绮良良被动：基于绮良良的生命上限，秘法·惊喜特派伤害提升[qDmg]%',
      sort: 9,
      data: {
        qDmg: ({ attr, calc }) => calc(attr.hp) / 1000 * 0.3
      }
    }]
    return { details, mainAttr, buffs }
  },
  "罗莎莉亚": () => {
    const details = [{
      title: 'E两段伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: 'Q技能伤害(2段)',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    }, {
      title: 'Q每跳伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['冰枪持续伤害'], 'q')
    }]

    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      title: '修女被动：从背后攻击时，暴击率提升12%',
      data: {
        cpct: 12
      }
    }]
    return { details, mainAttr, buffs }
  },
  "胡桃": () => {
    const details = [{
      title: '半血开E重击',
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2')
    }, {
      title: '半血开E重击蒸发',
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2', 'vaporize')
    }, {
      title: '半血开E后Q',
      dmg: ({ talent }, dmg) => dmg(talent.q['低血量时技能伤害'], 'q')
    }]

    const defDmgIdx = 1
    const mainAttr = 'hp,atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '蝶引来生：开E获得[atkPlus]点攻击力加成',
      sort: 9,
      data: {
        atkPlus: ({ talent, attr }) => {
          return Math.min(talent.e['攻击力提高'] * attr.hp / 100, attr.atk.base * 4)
        }
      }
    }, {
      title: '胡桃被动：半血获得33%火伤加成',
      data: {
        dmg: 33
      }
    }, 'vaporize']
    return { details, defDmgIdx, mainAttr, buffs }
  },
  "艾尔海森": () => {
    const details = [{
      title: 'E普攻第一段激化',
      dmg: ({ talent }, dmg) => dmg(talent.a['一段伤害'], 'a', '蔓激化')
    }, {
      title: 'E突进激化',
      params: { e: true, q: false },
      dmg: ({ talent, calc, attr }, { basic }) => {
        const td = talent.e['突进攻击伤害2']
        const em = calc(attr.mastery)
        const atk = calc(attr.atk)
        return basic(td[0] * atk / 100 + td[1] * em / 100, 'e', 'spread')
      }
    }, {
      title: '3枚光幕单段',
      dmg: ({ talent, calc, attr }, { basic }) => {
        const td = talent.e['1枚光幕攻击伤害2']
        const em = calc(attr.mastery)
        const atk = calc(attr.atk)
        return basic(td[0] * atk / 100 + td[1] * em / 100, 'e')
      }
    }, {
      title: '3枚光幕单段激化',
      dmg: ({ talent, calc, attr }, { basic }) => {
        const td = talent.e['1枚光幕攻击伤害2']
        const em = calc(attr.mastery)
        const atk = calc(attr.atk)
        return basic(td[0] * atk / 100 + td[1] * em / 100, 'e', 'spread')
      }
    }, {
      title: 'Q激化总伤-4段',
      params: { e: false, q: true },
      dmg: ({ talent, calc, attr }, { basic }) => {
        const td = talent.q['单次伤害2']
        const em = calc(attr.mastery)
        const atk = calc(attr.atk)
        let q = basic(td[0] * atk / 100 + td[1] * em / 100, 'q', 'spread')
        let q_spread = basic(td[0] * atk / 100 + td[1] * em / 100, 'q')
        return {
          dmg: q.dmg * 2 + q_spread.dmg * 2,
          avg: q.avg * 2 + q_spread.avg * 2
        }
      }
    }, {
      title: 'Q激化总伤-10段',
      params: { e: false, q: true },
      dmg: ({ talent, calc, attr }, { basic }) => {
        const td = talent.q['单次伤害2']
        const em = calc(attr.mastery)
        const atk = calc(attr.atk)
        let q_spread = basic(td[0] * atk / 100 + td[1] * em / 100, 'q', 'spread')
        let q = basic(td[0] * atk / 100 + td[1] * em / 100, 'q')
        return {
          dmg: q.dmg * 6 + q_spread.dmg * 4,
          avg: q.avg * 6 + q_spread.avg * 4
        }
      }
    }]

    const defDmgIdx = 3
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const defParams = {
      q: false,
      e: true,
      mArtisDiffCount: 2
    }

    const buffs = [{
      title: '艾尔海森被动：基于元素精通提升EQ伤害[eDmg]%',
      sort: 9,
      data: {
        eDmg: ({ calc, attr }) => Math.min(100, (calc(attr.mastery)) * 0.1),
        qDmg: ({ calc, attr }) => Math.min(100, (calc(attr.mastery)) * 0.1)
      }
    }, {
      title: '海森2命：每1枚产生的琢光镜将使元素精通提升50点，默认3层',
      cons: 2,
      data: {
        mastery: 150
      }
    }, {
      check: ({ params }) => params.q === false,
      title: '海森4命：每1枚产生的琢光镜将使草元素伤害提升10%，默认3层,不加成Q',
      cons: 4,
      data: {
        dmg: 30
      }
    }, {
      check: ({ params }) => params.q === false,
      title: '艾尔海森六命：暴击率提升10%，暴击伤害提升70%,不加成Q',
      cons: 6,
      data: {
        cpct: 10,
        cdmg: 70
      }
    }, 'spread']
    return { details, defDmgIdx, mainAttr, defParams, buffs }
  },
  "艾梅莉埃": () => {
    const details = [{
      title: '柔灯之匣一阶伤害',
      params: { e: true },
      dmg: ({ talent }, dmg) => dmg(talent.e['柔灯之匣·一阶攻击伤害'], 'e')
    }, {
      title: '柔灯之匣二阶单枚伤害',
      params: { e: true },
      dmg: ({ talent }, dmg) => dmg(talent.e['柔灯之匣·二阶攻击伤害2'][0], 'e')
    },  {
      title: '后台柔灯之匣二阶单枚',
      check: ({ weapon }) => weapon.name === '息灾',
      params: { e: true , off_field: true },
      dmg: ({ talent }, dmg) => dmg(talent.e['柔灯之匣·二阶攻击伤害2'][0], 'e')
    }, {
      title: '天赋浸析伤害',
      params: { e: true },
      dmg: ({ attr }, { basic }) => basic(attr.atk * 600 / 100, '')
    }, {
      title: '柔灯之匣三阶(Q)伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['柔灯之匣·三阶攻击伤害'], 'q')
    }, {
      title: 'Q完整对单',
      dmg: ({ talent , cons }, dmg) => {
        let q1 = dmg(talent.q['柔灯之匣·三阶攻击伤害'], 'q')
        let cons4 = cons >= 4 ? 12 : 4
        return {
          dmg: q1.dmg * cons4,
          avg: q1.avg * cons4
        }
      }
    }, {
      check: ({ cons }) => cons >= 6,
      title: 'Q后重击伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2')
    }, {
      title: '燃烧反应伤害',
      dmg: ({}, { reaction }) => reaction('burning')
    }]

    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '艾梅莉埃天赋：基于攻击力，对处于燃烧状态下的敌人造成的伤害提升[dmg]%',
      data: {
        dmg: ({ attr }) => Math.min(36, attr.atk / 1000 * 15)
      }
    }, {
      check: ({ params }) => params.e === true,
      title: '艾梅莉埃1命：[淡香浸析] e与天赋造成的伤害提升[dmg]%',
      cons: 1,
      data: {
        dmg: 20
      }
    }, {
      title: '艾梅莉埃2命：EQ命中的敌人草元素抗性降低[kx]%',
      cons: 2,
      data: {
        kx: 30
      }
    }, {
      title: '艾梅莉埃6命：施放EQ时,普攻与重击造成的伤害提升[aPlus]',
      cons: 6,
      data: {
        aPlus: ({ attr }) => attr.atk * 300 / 100,
        a2Plus: ({ attr }) => attr.atk * 300 / 100
      }
    }]

    const createdBy = 'liangshi'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "芙宁娜": () => {
    const details = [{
      title: 'E众水歌者治疗',
      dmg: ({ talent, attr }, { heal }) =>
        heal(talent.e['众水的歌者治疗量2'][0] * attr.hp / 100 + talent.e['众水的歌者治疗量2'][1] * 1)
    }, {
      title: 'E海薇玛夫人(海马)·伤害',
      params: { talentQ: true },
      dmg: ({ talent, attr }, { basic }) => basic(attr.hp * talent.e['海薇玛夫人伤害'] / 100 * 1.4, 'e')
    }, {
      title: 'E乌瑟勋爵(章鱼)·伤害',
      params: { talentQ: true },
      dmg: ({ talent, attr }, { basic }) => basic(attr.hp * talent.e['乌瑟勋爵伤害'] / 100 * 1.4, 'e')
    }, {
      title: 'E谢贝蕾妲小姐(螃蟹)·伤害',
      params: { talentQ: true },
      dmgKey: 'e',
      dmg: ({ talent, attr }, { basic }) => basic(attr.hp * talent.e['谢贝蕾妲小姐伤害'] / 100 * 1.4, 'e')
    }, {
      title: 'E谢贝蕾妲小姐(螃蟹)·蒸发',
      params: { talentQ: true },
      dmgKey: 'e',
      dmg: ({ talent, attr }, { basic }) => basic(attr.hp * talent.e['谢贝蕾妲小姐伤害'] / 100 * 1.4, 'e', '蒸发')
    }, {
      title: 'Q万众狂欢·伤害',
      params: { talentQ: true },
      dmg: ({ talent, attr }, { basic }) => basic(attr.hp * (talent.q['技能伤害'] / 100), 'q')
    }, {
      title: 'Q万众狂欢伤害·蒸发',
      params: { talentQ: true },
      dmg: ({ talent, attr }, { basic }) => basic(attr.hp * (talent.q['技能伤害'] / 100), 'q', '蒸发')
    }, {
      title: '六命荒刀每秒治疗',
      cons: 6,
      params: { talentQ: true },
      dmg: ({ attr }, { heal }) => heal(attr.hp * 0.04)
    }, {
      title: '六命荒刀普攻伤害',
      cons: 6,
      params: { talentQ: true },
      dmg: ({ talent, attr }, { basic }) => basic(attr.atk * talent.a['一段伤害'] / 100 + attr.hp * 0.18, 'a')
    }, {
      title: '六命芒刀普攻伤害',
      cons: 6,
      params: { talentQ: true },
      dmg: ({ talent, attr }, { basic }) => basic(attr.atk * talent.a['一段伤害'] / 100 + attr.hp * 0.43, 'a')
    }, {
      title: '六命芒刀下落伤害·蒸发',
      cons: 6,
      params: { talentQ: true },
      dmg: ({ talent, attr }, { basic }) => basic(attr.atk * talent.a['低空/高空坠地冲击伤害'][1] / 100 + attr.hp * 0.43, 'a3', '蒸发')
    }]

    const mainAttr = 'hp,mastery,cpct,cdmg,dmg'
    const defDmgIdx = 3

    const buffs = [{
      title: '芙宁娜天赋：消耗4队友生命值，E伤害提升140%'
    }, {
      title: '天赋Q·万众狂欢：300层气氛值提升[dmg]%伤害，[healInc]%受治疗加成',
      data: {
        dmg: ({ talent }) => talent.q['气氛值转化提升伤害比例'] * 300,
        healInc: ({ talent }) => talent.q['气氛值转化受治疗加成比例'] * 300
      }
    }, {
      title: '芙宁娜被动：基于生命值，提升召唤物伤害[eDmg]%',
      sort: 9,
      data: {
        eDmg: ({ attr }) => Math.min(28, attr.hp / 1000 * 0.7)
      }
    }, {
      title: '芙宁娜1命：气氛值层数上限提升100',
      cons: 1,
      data: {
        dmg: ({ talent }) => talent.q['气氛值转化提升伤害比例'] * 100,
        healInc: ({ talent }) => talent.q['气氛值转化受治疗加成比例'] * 100
      }
    }, {
      title: '芙宁娜2命：万众狂欢持续期间，满气氛值提升芙宁娜140%生命值',
      cons: 2,
      check: ({ params }) => params.talentQ === true,
      data: {
        hpPct: 140
      }
    }, 'vaporize']
    return { details, mainAttr, defDmgIdx, buffs }
  },
  "芭芭拉": () => {
    const details = [{
      title: '重击伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2')
    }, {
      title: '重击蒸发',
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2', 'vaporize')
    }, {
      title: 'E每跳治疗',
      dmg: ({ talent, attr, calc }, { heal }) =>
        heal(talent.e['持续治疗量2'][0] * calc(attr.hp) / 100 + talent.e['持续治疗量2'][1] * 1)
    }, {
      title: 'Q治疗量',
      dmgKey: 'qHeal',
      dmg: ({ talent, attr, calc }, { heal }) =>
        heal(talent.q['治疗量2'][0] * calc(attr.hp) / 100 + talent.q['治疗量2'][1] * 1)
    }]

    const defDmgKey = 'qHeal'
    const mainAttr = 'atk,hp,cpct,cdmg,mastery'

    const buffs = [{
      title: '芭芭拉2命：开E水环持续期间获得15%水伤加成',
      cons: 2,
      data: {
        dmg: 15
      }
    }, 'vaporize']
    return { details, defDmgKey, mainAttr, buffs }
  },
  "茜特菈莉": () => {
    const details = [{
      title: 'E释放伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['黑曜星魔伤害'], 'e,nightsoul')
    }, {
      title: 'E风暴伤害',
      params: { windstorm: true },
      dmg: ({ talent }, dmg) => dmg(talent.e['霜陨风暴伤害'], 'e,nightsoul')
    }, {
      title: 'E护盾吸收量',
      dmg: ({ talent, calc, attr }, { shield }) => shield(talent.e['护盾吸收量2'][0] * calc(attr.mastery) / 100 + talent.e['护盾吸收量2'][1] * 1)
    }, {
      title: 'Q释放伤害',
      params: { windstorm: true },
      dmg: ({ talent }, dmg) => dmg(talent.q['冰风暴伤害'], 'q,nightsoul')
    }, {
      title: 'Q释放融化伤害',
      params: { windstorm: true },
      dmg: ({ talent }, dmg) => dmg(talent.q['冰风暴伤害'], 'q,nightsoul', 'melt')
    }, {
      title: '双火班希Q融化伤害',
      params: { windstorm: true, team: true },
      dmg: ({ talent }, dmg) => dmg(talent.q['冰风暴伤害'], 'q,nightsoul', 'melt')
    }, {
      check: ({ cons }) => cons >= 1,
      title: '「星刃」基础伤害提升值',
      dmg: ({ calc, attr }) => {
        return {
          avg: calc(attr.mastery) * 200 / 100
        }
      }
    }]

    const defParams = { Nightsoul: true }
    const defDmgIdx = 2
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      check: ({ params }) => params.windstorm === true,
      title: '茜特菈莉天赋：伊兹帕帕的霜陨风暴造成的伤害提升[ePlus],元素爆发冰风暴造成的伤害提升[qPlus]',
      sort: 9,
      data: {
        ePlus: ({ attr, calc }) => calc(attr.mastery) * 90 / 100,
        qPlus: ({ attr, calc }) => calc(attr.mastery) * 1200 / 100
      }
    }, {
      title: '茜特菈莉2命：元素精通提升[mastery]',
      cons: 2,
      data: {
        mastery: 125
      }
    }, {
      title: '茜特菈莉6命：施放元素战技时提供[dmg]%伤害加成',
      cons: 6,
      data: {
        dmg: 2.5 * 40
      }
    }, {
      check: ({ params }) => params.team === true,
      title: '双火班希：班尼特6命风鹰剑宗室4，希诺宁0+0',
      data: {
        atkPlus: 1203,
        atkPct: 25 + 20,
        kx: 36,
      }
    }]

    const createdBy = 'liangshi'
    return { details, defParams, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "荒泷一斗": () => {
    const details = [{
      title: '开大后每段重击',
      dmg: ({ talent }, dmg) => dmg(talent.a['荒泷逆袈裟连斩伤害'], 'a2')
    }, {
      title: '开大后重击尾段',
      dmg: ({ talent }, dmg) => dmg(talent.a['荒泷逆袈裟终结伤害'], 'a2')

    }, {
      title: '开大后牛牛伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }]

    const mainAttr = 'atk,def,cpct,cdmg'
    const enemyName = '魔偶/女士/雷神'

    const buffs = [{
      title: '一斗被动：荒泷逆袈裟造成的伤害基于防御值提高[a2Plus]',
      sort: 9,
      data: {
        a2Plus: ({ attr, calc }) => calc(attr.def) * 0.35
      }
    }, {
      title: '一斗6命：重击的暴击伤害提高70%',
      cons: 6,
      data: {
        a2Cdmg: 70
      }
    }, {
      title: '一斗大招：怒目鬼王状态提高攻击力[atkPlus]',
      sort: 9,
      data: {
        atkPlus: ({ attr, calc, talent }) => talent.q['攻击力提高'] * calc(attr.def) / 100
      }
    }]
    return { details, mainAttr, enemyName, buffs }
  },
  "莉奈娅": () => {
    const details = [
      {
        title: '满辉·露米捶捶乱打伤害（后台）',
        dmg: ({ attr, calc, talent } , { basic }) => basic(calc(attr.def) * talent.e['露米捶捶乱打伤害'] / 100, 'e')
      },
      {
        params: { Moonsign_Benediction: true, cons_1: true },
        title: '满辉·露米加力重锤伤害（后台）',
        dmg: ({ attr, calc, cons, talent } , { basic }) => basic(calc(attr.def) * talent.e['露米加力重锤伤害'] / 100, '', 'lunarCrystallize')
      },
      {
        params: { Moonsign_Benediction: true, cons_1_2: true, cons_2: true, cons_4_def50: true },
        title: '满辉·露米百万吨重锤伤害',
        dmg: ({ attr, calc, cons, talent } , { basic }) => basic(calc(attr.def) * talent.e['露米百万吨重锤伤害'] / 100, '', 'lunarCrystallize')
      },
      {
        title: 'Q释放治疗量',
        dmg: ({ talent, attr }, { heal }) => {
          return heal(talent.q['首次治疗量2'][0] / 100 * attr.def + talent.q['首次治疗量2'][1])
        }
      },
      {
        title: 'Q后续每次治疗',
        dmg: ({ talent, attr }, { heal }) => {
          return heal(talent.q['持续治疗量2'][0] / 100 * attr.def + talent.q['持续治疗量2'][1])
        }
      }
    ]

    const defDmgIdx = 2
    const mainAttr = 'def,cpct,cdmg,mastery'
    const defParams = { Moonsign: 2 }

    const buffs = [
      {
        check: ({ params }) => params.Moonsign_Benediction === true,
        title: '莉奈娅天赋：基于莉奈娅的防御力，对队伍中角色造成的月结晶反应提升[fypct]%的基础伤害',
        sort: 9,
        data: {
          fypct: ({ attr, calc }) => Math.min(calc(attr.def) / 100 * 0.7, 14)
        }
      },
      {
        title: '莉奈娅天赋：露米附近敌人的岩元素抗性会降低[kx]%',
        data: {
          kx: ({ params }) => ((params.Moonsign || 0) >= 2 ? 30 : 15)
        }
      },
      {
        check: ({ params }) => params.cons_1 === true,
        title: '莉奈娅1命：队伍中附近的角色造成月结晶反应伤害时，将消耗一层「历览编录」，提升造成的伤害，提升值相当于莉奈娅防御力的[_fyplus]%',
        cons: 1,
        sort: 9,
        data: {
          _fyplus: ({ cons }) => 75 * (cons == 6 ? 1.5 : 1),
          fyplus: ({ attr, calc, cons }) => calc(attr.def) * 75 / 100 * (cons == 6 ? 1.5 : 1)
        }
      },
      {
        check: ({ params }) => params.cons_1_2 === true,
        title: '莉奈娅1命：露米在究极厉害形态下使用百万吨重锤时，可消耗5层「历览编录」，提升造成的伤害，总提升值相当于莉奈娅防御力的[_fyplus]%',
        cons: 1,
        sort: 9,
        data: {
          _fyplus: ({ cons }) => 750 * (cons == 6 ? 1.5 : 1),
          fyplus: ({ attr, calc, cons }) => calc(attr.def) * 750 / 100 * (cons == 6 ? 1.5 : 1)
        }
      },
      {
        title: '莉奈娅2命：触发月笼谐奏后的8秒内，队伍中所有元素类型为水元素与岩元素的角色的暴击伤害提升[cdmg]%',
        cons: 2,
        data: {
          cdmg: 40
        }
      },
      {
        check: ({ params }) => params.cons_2 === true,
        title: '莉奈娅2命：露米在究极厉害形态下使用百万吨重锤的暴击伤害额外提升[cdmg]%',
        cons: 2,
        data: {
          cdmg: 150
        }
      },
      {
        title: '莉奈娅4命：触发月笼谐奏后的5秒内，莉奈娅与队伍中自己的当前场上角色的防御力分别提升[defPct]%',
        cons: 4,
        data: {
          defPct: ({ params }) => (params.cons_4_def50 === true ? 50 : 25)
        }
      },
      {
        title: '莉奈娅6命：【月兆·满辉】队伍中附近的角色造成的月结晶反应伤害擢升[elevated]%',
        cons: 6,
        data: {
          elevated: ({ params }) => ((params.Moonsign || 0) >= 2 ? 25 : 0),
        }
      }
    ]

    const createdBy = '冰翼'
    return { details, defDmgIdx, mainAttr, defParams, buffs, createdBy }
  },
  "莫娜": () => {
    const details = [{
      title: '重击伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2')
    }, {
      title: '重击蒸发',
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2', 'vaporize')
    }, {
      title: 'Q后重击蒸发',
      params: { q: true, cons_6 : true },
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2', 'vaporize')
    }, {
      title: 'Q泡影破裂伤害',
      params: { q: true },
      dmg: ({ talent }, dmg) => dmg(talent.q['泡影破裂伤害'], 'q')
    }, {
      title: 'Q泡影破裂蒸发',
      params: { q: true },
      dmg: ({ talent }, dmg) => dmg(talent.q['泡影破裂伤害'], 'q', 'vaporize')
    }]

    const defParams = { Hexenzirkel: true } // 魔女会成员
    const defDmgIdx = 3
    const mainAttr = 'atk,cpct,cdmg,recharge'

    const buffs = [{
      check: ({ params }) => params.q === true,
      title: '莫娜元素爆发：开Q获得[dmg]%伤害加成',
      data: {
        dmg: ({ talent }) => talent.q['伤害加成']
      }
    }, {
      title: '莫娜天赋：基于元素充能效率获得水元素伤害[dmg]%',
      sort: 4,
      data: {
        dmg: ({ calc, attr }) => calc(attr.recharge) * 0.2
      }
    }, {
      title: '莫娜1命：命中星异状态下的敌人水元素相关反应效果提升15%',
      cons: 1,
      data: {
        vaporize: ({ params }) => params.q ? 15 : 0
      }
    }, {
      title: '莫娜2命：莫娜的重击命中敌人时，还会使队伍中附近的所有角色的元素精通提升80点',
      cons: 2,
      data: {
        mastery: 80
      }
    }, {
      title: '莫娜4命：攻击处于星异状态下的敌人时暴击率提升15%，暴击伤害提升15%',
      cons: 4,
      data: {
        cpct: ({ params }) => params.q ? 15 : 0,
        cdmg: ({ params }) => params.q ? 15 : 0,
      }
    }, {
      title: '莫娜6命：虚实流动状态后（或命中星异敌人）满Buff提升重击180%伤害',
      cons: 6,
      data: {
        a2Dmg: 180
      }
    }, {
      check: ({ params }) => params.cons_6 === true,
      title: '莫娜6命：对处于星异状态下的敌人，莫娜的重击将会造成原本200%的伤害',
      cons: 6,
      data: {
        multi: 100
      }
    }, 'vaporize']

    const createdBy = '喵喵 & 冰翼'
    return { details, defParams, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "莱依拉": () => {
    const details = [{
      title: '满层E护盾量',
      dmg: ({ attr, calc, talent, cons }, { shield }) => {
        const sheildPlus = cons >= 1 ? 1.2 : 1
        return shield((calc(attr.hp) * talent.e['护盾基础吸收量2'][0] / 100 + talent.e['护盾基础吸收量2'][1]) * sheildPlus)
      }
    }, {
      title: 'E飞星单伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['飞星伤害'], 'e')
    }, {
      title: 'Q星光弹伤害',
      dmg: ({ attr, calc, talent }, { basic }) => basic(calc(attr.hp) * talent.q['星光弹伤害'] / 100)
    }]

    const mainAttr = 'hp,atk,cpct,cdmg'

    const buffs = [{
      title: '莱依拉1命：安眠帷幕护盾的伤害吸收量提高20%',
      cons: 1,
      data: {
        _shield: 20
      }
    }, {
      title: '莱依拉6命：飞星与星光弹造成的伤害提升40%',
      cons: 6,
      data: {
        eDmg: 40,
        qDmg: 40
      }
    }, {
      title: '莱依拉被动：满层护盾强效提升24%',
      data: {
        shield: 24
      }
    }, {
      title: '莱依拉被动：飞星造成的伤害值基于生命值提高[ePlus]',
      sort: 9,
      data: {
        ePlus: ({ attr, calc }) => calc(attr.hp) * 0.015
      }
    }]
    return { details, mainAttr, buffs }
  },
  "莱欧斯利": () => {
    const details = [{
      title: 'E后普攻首段',
      dmg: ({ talent }, dmg) => dmg(talent.a['一段伤害'], 'a')
    }, {
      title: 'E后强化重击伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2')
    }, {
      title: 'E后强化重击融化伤害',
      params: { Melt: true },
      dmg: ({ talent }, dmg) => dmg(talent.a['重击伤害'], 'a2', 'melt')
    }, {
      title: 'Q总伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    }, {
      title: 'Q融化总伤害',
      params: { Melt: true },
      dmg: ({ talent }, dmg) => {
        const td = talent.q['技能伤害2'][0]
        let normalDmg = dmg(td, 'q')
        let meltDmg = dmg(td, 'q', 'melt')
        return {
          dmg: normalDmg.dmg * 3 + meltDmg.dmg * 2,
          avg: normalDmg.avg * 3 + meltDmg.avg * 2
        }
      }
    }, {
      title: '一轮普攻5A接重击',
      dmg: ({ talent, cons }, dmg) => {
        let a1Dmg = dmg(talent.a['一段伤害'], 'a')
        let a2Dmg = dmg(talent.a['二段伤害'], 'a')
        let a3Dmg = dmg(talent.a['三段伤害'], 'a')
        let a4Dmg = dmg(talent.a['四段伤害'], 'a')
        let a5Dmg = dmg(talent.a['五段伤害'], 'a')
        let azDmg = dmg(talent.a['重击伤害'], 'a2')
        let azCount = cons < 6 ? 1 : 2
        return {
          dmg: a1Dmg.dmg + a2Dmg.dmg + a3Dmg.dmg + a4Dmg.dmg + a5Dmg.dmg + azDmg.dmg * azCount,
          avg: a1Dmg.avg + a2Dmg.avg + a3Dmg.avg + a4Dmg.avg + a5Dmg.avg + azDmg.avg * azCount
        }
      }
    }, {
      title: '一轮普攻5A接重击(融化)',
      params: { Melt: true },
      dmg: ({ talent, cons }, dmg) => {
        let a1Dmg = dmg(talent.a['一段伤害'], 'a', 'melt')
        let a2Dmg = dmg(talent.a['二段伤害'], 'a')
        let a3Dmg = dmg(talent.a['三段伤害'], 'a')
        let a41Dmg = dmg(talent.a['四段伤害2'][0], 'a', 'melt')
        let a42Dmg = dmg(talent.a['四段伤害2'][0], 'a')
        let a5Dmg = dmg(talent.a['五段伤害'], 'a')
        let azDmg = dmg(talent.a['重击伤害'], 'a2', 'melt')
        let azMeltCount = cons < 6 ? 1 : 2
        return {
          dmg: a1Dmg.dmg + a2Dmg.dmg + a3Dmg.dmg + a41Dmg.dmg + a42Dmg.dmg + a5Dmg.dmg + azDmg.dmg * azMeltCount,
          avg: a1Dmg.avg + a2Dmg.avg + a3Dmg.avg + a41Dmg.avg + a42Dmg.avg + a5Dmg.avg + azDmg.avg * azMeltCount
        }
      }
    }, {
      title: '一轮普攻5A接重击(星超导)',
      params: { Stellar: true },
      dmg: ({ talent, cons }, dmg) => {
        let a1Dmg = dmg(talent.a['一段伤害'], 'a')
        let a2Dmg = dmg(talent.a['二段伤害'], 'a')
        let a3Dmg = dmg(talent.a['三段伤害'], 'a')
        let a4Dmg = dmg(talent.a['四段伤害'], 'a')
        // 1命(星超导)：第五段斥逐拳与天辉·凌跃拳互相触发，造成的伤害提升50%
        let c1Mult = cons >= 1 ? 1.5 : 1
        let a5Dmg = dmg(talent.a['五段伤害'] * c1Mult, 'a')
        // 星超导反应伤害（天赋-冤苦终有显明之期）：
        //   第三段额外造成60%(2命90%)，第五段额外造成80%(2命120%)，天辉·凌跃拳(重击)造成100%(2命150%)
        //   用 dmg() 走 stellarConduct 公式，传入 pctNum = 天赋倍率 * stellarPct / 100
        //   （dmg() 内部会再 /100 并乘以攻击力，故只需 /100 将 stellarPct 转为小数）
        //   注意：c1Mult 仅作用于第五段与重击（1命为二者互相触发），第三段不受影响
        let stellarPct3 = cons < 2 ? 60 : 90
        let stellarPct5 = cons < 2 ? 80 : 120
        let stellarPctZ = cons < 2 ? 100 : 150
        let s3Dmg = dmg(talent.a['三段伤害'] * stellarPct3 / 100, 'a', 'stellarConduct')
        let s5Dmg = dmg(talent.a['五段伤害'] * stellarPct5 * c1Mult / 100, 'a', 'stellarConduct')
        let szDmg = dmg(talent.a['重击伤害'] * stellarPctZ * c1Mult / 100, 'a2', 'stellarConduct')
        let sDmg = s3Dmg.dmg + s5Dmg.dmg + szDmg.dmg
        let sAvg = s3Dmg.avg + s5Dmg.avg + szDmg.avg
        // 6命：第五段斥逐拳与天辉·凌跃拳额外生成冰锥，造成原本20%的星超导反应伤害（同样受1命加成）
        if (cons >= 6) {
          let s5Extra = dmg(talent.a['五段伤害'] * 20 * c1Mult / 100, 'a', 'stellarConduct')
          let szExtra = dmg(talent.a['重击伤害'] * 20 * c1Mult / 100, 'a2', 'stellarConduct')
          sDmg += s5Extra.dmg + szExtra.dmg
          sAvg += s5Extra.avg + szExtra.avg
        }
        return {
          dmg: a1Dmg.dmg + a2Dmg.dmg + a3Dmg.dmg + a4Dmg.dmg + a5Dmg.dmg + sDmg,
          avg: a1Dmg.avg + a2Dmg.avg + a3Dmg.avg + a4Dmg.avg + a5Dmg.avg + sAvg
        }
      }
    }]

    const defDmgIdx = 7
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '冰牙突驰：强化普攻，使其造成的伤害提升至[_aMulti]%',
      data: {
        _aMulti: ({ talent }) => talent.e['强化斥逐拳伤害'],
        aMulti: ({ talent }) => talent.e['强化斥逐拳伤害'] - 100
      }
    }, {
      title: '天赋-公理终有辩诉之日：重击造成的伤害提升[a2Dmg]%',
      data: {
        a2Dmg: 50
      }
    }, {
      title: '天赋-罪业终有报偿之时：生命变动时获得1层Buff，5层Buff使得攻击力提升[atkPct]%',
      data: {
        atkPct: 30
      }
    }, {
      title: '莱欧1命：重击造成的伤害额外提升[a2Dmg]%',
      cons: 1,
      data: {
        a2Dmg: 150
      }
    }, {
      // 仅展示用：1命(星超导)的伤害提升在上方detail中通过c1Mult实现，此处不设data
      check: ({ params }) => params.Stellar === true,
      cons: 1,
      title: '莱欧1命(星超导)：第五段斥逐拳与天辉·凌跃拳互相触发，造成的伤害提升50%',
      data: {}
    }, {
      title: '莱欧2命：5层Buff使得Q造成的伤害提升[qDmg]%',
      cons: 2,
      data: {
        qDmg: 200
      }
    }, {
      check: ({ params }) => params.Stellar !== true,
      cons: 2,
      title: '莱欧2命：5层Buff使得普攻与重击分别造成原本125%/130%的伤害',
      data: {
        // 普攻：独立乘区为加算(1+multi)，E技能强化已占用 aMulti=强化斥逐拳伤害-100。
        // 直接写25会与之加算导致结果偏低，故反推所需值：
        // 令 (1+(S-100+m)/100) = (1+(S-100)/100)*1.25，解得 m = S*0.25（S=强化斥逐拳伤害）
        aMulti: ({ talent }) => talent.e['强化斥逐拳伤害'] * 0.25,
        // 重击不受E技能强化，a2无其他multi来源，可直接写30
        a2Multi: 30
      }
    }, {
      title: '莱欧6命：重击的暴击率提升[a2Cpct]%,暴击伤害提升[a2Cdmg]%,并能够额外造成一次伤害',
      cons: 6,
      data: {
        a2Cpct: 10,
        a2Cdmg: 80
      }
    }, {
      // 融化队通常搭配双火共鸣(+25%攻击力)
      check: ({ params }) => params.Melt === true,
      title: '双火共鸣：队伍中有2名火元素角色时，攻击力提升[atkPct]%',
      data: {
        atkPct: 25
      }
    }, {
      // 星超导队通常搭配双冰共鸣(+15%暴击率)
      check: ({ params }) => params.Stellar === true,
      title: '双冰共鸣：攻击冰元素附着或冻结状态下的敌人时，暴击率提高[cpct]%',
      data: {
        cpct: 15
      }
    }, {
      check: ({ params }) => params.Stellar === true,
      title: '天赋-冤苦终有显明之期：莱欧斯利造成的星超导反应伤害提升[stellarConduct]%',
      data: {
        stellarConduct: 30
      }
    }, {
      check: ({ params }) => params.Stellar === true,
      cons: 6,
      title: '莱欧6命(星超导)：被寒烈的惩裁强化的斥逐拳与天辉·凌跃拳的暴击率提升[aCpct]%,暴击伤害提升[aCdmg]%',
      data: {
        aCpct: 10,
        aCdmg: 80
      }
    }]

    const createdBy = 'Aluxes'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "菈乌玛": () => {
    const details = [{
        title: '重击伤害',
        dmg: ({ talent }, dmg) => dmg(talent.a['唤灵之祷伤害'], 'a2')
      },
      {
        title: '满辉长按E二段3枚',
        dmgKey: 'e',
        params: { Lunar: true, Moonsign: 2 },
        dmg: ({ talent, calc, attr }, { basic }) => basic(calc(attr.mastery) * talent.e['长按二段伤害'] * 3 / 100, '', 'lunarBloom')
      },
      {
        title: 'E圣域伤害',
        params: { Linnunrata: true },
        dmg: ({ talent, calc, attr }, { basic }) => basic(((calc(attr.mastery) * talent.e['霜林圣域攻击伤害2'][1]) + (calc(attr.atk) * talent.e['霜林圣域攻击伤害2'][0])) / 100, 'e')
      },
      {
        title: '绽放伤害',
        params: { Moonsign: 1 },
        dmg: ({}, { reaction }) => {
          let r1 = reaction('bloom')
          return {
            dmg: r1.avg * 2,
            avg: r1.avg * 1.15
          }
        }
      }, {
        title: 'Q后绽放伤害',
        dmgKey: 'r',
        params: { Pale_Hymn: true, Moonsign: 1 },
        dmg: ({}, { reaction }) => {
          let r1 = reaction('bloom')
          return {
            dmg: r1.avg * 2,
            avg: r1.avg * 1.15
          }
        }
      },
      {
        check: ({ cons }) => cons >= 6,
        title: '六命满辉E附加伤害',
        params: { Lunar: true, Moonsign: 3 },
        dmg: ({ calc, attr }, { basic }) => basic(calc(attr.mastery) * 185 / 100, '', 'lunarBloom')
      },
      {
        check: ({ cons }) => cons >= 6,
        title: '六命满辉普攻附加伤害',
        params: { Lunar: true, Pale_Hymn: true, Moonsign: 3 },
        dmg: ({ calc, attr }, { basic }) => basic(calc(attr.mastery) * 150 / 100, '', 'lunarBloom')
      }
    ]

    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg,dmg,mastery'

    const buffs = [{
        check: ({ params }) => (params.Moonsign || 0) >= 2,
        title: '菈乌玛天赋：处于满辉时月绽放反应暴击率提升[cpct]%,暴击伤害提升[cdmg]%',
        data: {
          cpct: ({ params }) => params.Lunar === true ? 10 : 0,
          cdmg: ({ params }) => params.Lunar === true ? 20 : 0
        }
      }, {
        check: ({ params }) => params.Linnunrata === true,
        title: '菈乌玛天赋：元素战技造成的伤害提升[eDmg]%',
        sort: 9,
        data: {
          eDmg: ({ attr, calc }) => Math.min((calc(attr.mastery) * 0.04), 32)
        }
      }, {
        check: ({ params }) => params.Lunar === true,
        title: '菈乌玛天赋：触发绽放反应时转为触发月绽放反应，基础伤害提升[fypct]%',
        sort: 9,
        data: {
          fypct: ({ attr, calc }) => Math.min((calc(attr.mastery) * 0.0175), 14)
        }
      }, {
        title: '菈乌玛技能：元素战技命中敌人时该敌人的抗性降低[kx]%',
        data: {
          kx: ({ talent }) => talent.e['元素抗性降低']
        }
      }, {
        check: ({ params }) => params.Pale_Hymn === true,
        title: '菈乌玛元素爆发：绽放、超绽放、烈绽放、月绽放反应造成的伤害提升[fyplus]',
        sort: 9,
        data: {
          fyplus: ({ attr, calc, talent, params }) => calc(attr.mastery) * (params.Lunar === true ? talent.q['月绽放反应伤害提升'] : talent.q['绽放、超绽放、烈绽放反应伤害提升']) / 100
        }
      }, {
        check: ({ params }) => params.Pale_Hymn === true,
        title: '菈乌玛2命：绽放、超绽放、烈绽放、月绽放伤害额外提升[fyplus]',
        sort: 9,
        cons: 2,
        data: {
          fyplus: ({ attr, calc, params }) => calc(attr.mastery) * (params.Lunar === true ? 400 : 500) / 100
        }
      }, {
        check: ({ params }) => params.Lunar === true && (params.Moonsign || 0) >= 2,
        title: '菈乌玛2命：处于满辉时月绽放反应伤害提升[lunarBloom]%',
        cons: 2,
        data: {
          lunarBloom: 40
        }
      }, {
        check: ({ params }) => params.Lunar === true && (params.Moonsign || 0) >= 2,
        title: '菈乌玛6命：处于满辉时月绽放反应伤害擢升[elevated]%',
        cons: 6,
        data: {
          elevated: 25
        }
      }]

    const createdBy = 'liangshi'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "菲林斯": () => {
    const details = [{
        title: '二段E伤害',
        dmgKey: 'e',
        dmg: ({ talent }, dmg) => dmg(talent.e['北国枪阵伤害'], 'e')
      },
      {
        title: 'Q释放伤害',
        dmg: ({ talent }, dmg) => dmg(talent.q['技能初始伤害'], 'q')
      },
      {
        title: 'Q单段伤害',
        params: { Lunar: true, Moonsign: 3 },
        dmg: ({ calc, attr, talent }, { basic }) => basic(calc(attr.atk) * talent.q['中间段月感电伤害'] / 100, '', 'lunarCharged')
      },
      {
        title: 'Q尾段伤害',
        params: { Lunar: true, Moonsign: 3 },
        dmg: ({ calc, attr, talent }, { basic }) => basic(calc(attr.atk) * talent.q['最终段月感电伤害'] / 100, '', 'lunarCharged')
      },
      {
        title: 'Q雷霆交响释放伤害',
        params: { Lunar: true, Moonsign: 3 },
        dmg: ({ calc, attr, talent }, { basic }) => basic(calc(attr.atk) * talent.q['雷霆交响伤害'] / 100, '', 'lunarCharged')
      },
      {
        title: 'Q雷霆交响额外伤害',
        params: { Lunar: true, Moonsign: 3 },
        dmg: ({ calc, attr, talent }, { basic }) => basic(calc(attr.atk) * talent.q['雷霆交响额外伤害'] / 100, '', 'lunarCharged')
      },
      {
        title: 'Q雷霆交响释放伤害',
        params: { Lunar: true, Moonsign: 3 },
        dmg: ({ calc, attr, talent }, { basic }) => basic(calc(attr.atk) * talent.q['雷霆交响伤害'] / 100, '', 'lunarCharged')
      },
      {
        title: '单人月感电伤害',
        params: { Lunar: true, Moonsign: 3 },
        dmg: ({}, { reaction }) => reaction('lunarCharged')
      }
    ]

    const defDmgIdx = 3
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [
      {
        check: ({ params }) => params.Lunar === true,
        title: '菲林斯天赋：处于满辉时月感电伤害提升[lunarCharged]%',
        data: {
          lunarCharged: 20
        }
      },
      {
        title: '菲林斯天赋：元素精通提升[mastery]',
        sort: 9,
        data: {
          mastery: ({ attr, calc, cons }) => Math.min((calc(attr.atk) / 100 * (cons >= 4 ? 10 : 8)), (cons >= 4 ? 220 : 160))
        }
      },
      {
        check: ({ params }) => params.Lunar === true,
        title: '月兆祝赐：触发感电反应时转为触发月感电反应,基础伤害提升[fypct]',
        sort: 9,
        data: {
          fypct: ({ attr, calc }) => Math.min((calc(attr.atk) / 100 * 0.7), 14)
        }
      },
      {
        title: '菲林斯2命：处于满辉时敌人的元素抗性降低[kx]%',
        cons: 2,
        data: {
          kx: 25
        }
      },
      {
        title: '菲林斯4命：攻击力提升[atkPct]%',
        cons: 4,
        data: {
          atkPct: 20
        }
      },
      {
        title: '菲林斯6命：对敌人造成的月感电反应伤害擢升[elevated]%',
        cons: 6,
        data: {
          elevated: 45
        }
      }
    ]

    const createdBy = 'liangshi'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "菲米尼": () => {
    const details = [{
      title: '普攻首段伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['一段伤害'], 'a', 'phy')
    }, {
      title: 'E伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['上挑攻击伤害'], 'e')
    }, {
      title: '0阶E伤害',
      dmg: ({ talent }, { dynamic }) => dynamic(talent.e['零阶高压粉碎伤害'], 'e', { dynamicDmg: 40, dynamicCpct: 15 })
    }, {
      title: '4阶E伤害',
      dmg: ({ talent }, { dynamic }) => dynamic(talent.e['四阶高压粉碎伤害'], 'e', { dynamicPhy: 40, dynamicCpct: 15 }, 'phy')
    }, {
      title: 'Q伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    }, {
      title: 'Q状态·冰伤流4轮EEA',
      check: ({ calc, attr }) => calc(attr.phy) < 58,
      dmgKey: 'q',
      dmg: ({ talent }, dmg) => {
        let normalEDmg = dmg(talent.e['上挑攻击伤害'], 'e')
        let e2Dmg = dmg.dynamic(talent.e['零阶高压粉碎伤害'], 'e', { dynamicDmg: 40, dynamicCpct: 15 })
        let a1Dmg = dmg(talent.a['一段伤害'], 'a', 'phy')
        return {
          dmg: (normalEDmg.dmg + e2Dmg.dmg + a1Dmg.dmg) * 4,
          avg: (normalEDmg.avg + e2Dmg.avg + a1Dmg.avg) * 4
        }
      }
    }, {
      title: 'Q状态·物理流3轮EAAAA',
      check: ({ calc, attr }) => calc(attr.phy) >= 58,
      dmgKey: 'q',
      dmg: ({ talent }, dmg) => {
        let normalEDmg = dmg(talent.e['上挑攻击伤害'], 'e')
        let a1Dmg = dmg(talent.a['一段伤害'], 'a', 'phy')
        let a2Dmg = dmg(talent.a['二段伤害'], 'a', 'phy')
        let e2Dmg = dmg.dynamic(talent.e['四阶高压粉碎伤害'], 'e', { dynamicPhy: 40, dynamicCpct: 15 }, 'phy')
        return {
          dmg: (normalEDmg.dmg + a1Dmg.dmg * 2 + a2Dmg.dmg + e2Dmg.dmg) * 3,
          avg: (normalEDmg.avg + a1Dmg.avg * 2 + a2Dmg.avg + e2Dmg.avg) * 3
        }
      }
    }]

    const defDmgKey = 'q'
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      title: '天赋-并流式冷凝机关：触发碎冰反应后，使浮冰增压·高压粉碎造成的伤害提高40%'
    }, {
      title: '菲米尼1命：浮冰增压·高压粉碎的暴击率提高15%',
      cons: 1
    }, {
      title: '菲米尼4命：触发冰冻、碎冰、超导反应后，满层Buff提升攻击力[atkPct]%',
      cons: 4,
      data: {
        atkPct: 18
      }
    }, {
      title: '菲米尼6命：触发冰冻、碎冰、超导反应后，满层Buff提升暴击伤害[cdmg]%',
      cons: 6,
      data: {
        cdmg: 36
      }
    }]

    const createdBy = 'Aluxes'
    return { details, defDmgKey, mainAttr, buffs, createdBy }
  },
  "菲谢尔": () => {
    const details = [{
      title: '奥兹攻击激化伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['奥兹攻击伤害'], 'e', 'aggravate')
    }, {
      title: '奥兹攻击伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['奥兹攻击伤害'], 'e')
    }, {
      title: '奥兹召唤伤害',
      params: { e: true },
      dmg: ({ talent, cons }, dmg) => dmg(talent.e['召唤伤害'], 'e')
    }, {
      title: '至夜幻现伤害',
      dmg: ({ talent, cons }, dmg) => dmg(talent.q['落雷伤害'], 'q')
    }]

    const defParams = { Hexenzirkel: true } // 魔女会成员
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '皇女2命：施放夜巡影翼时，能额外造成200%攻击力的伤害',
      data: {
        ePct: ({ params }) => params.e ? 200 : 0
      }
    }, {
      title: '皇女4命：施放夜巡影翼时，能额外造成200%攻击力的伤害',
      data: {
        qPct: ({ params }) => params.q ? 222 : 0
      }
    }, 'aggravate']
    return { details, defParams, mainAttr, buffs }
  },
  "蓝砚": () => {
    const details = [{
      title: 'E翦月环伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['翦月环伤害'], 'e')
    },{
      title: '护盾吸收量',
      dmg: ({ talent, calc, attr }, { shield }) => shield((talent.e['护盾吸收量2'][0] * calc(attr.atk) / 100 + talent.e['护盾吸收量2'][1] * 1) * 1)
    },{
      title: 'Q技能单段伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害2'][0], 'q')
    }]

    const defParams = { Nightsoul: true }
    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '蓝砚天赋：元素战技与元素爆发造成的伤害值提升，提升值分别相当于蓝砚元素精通的[ePlus]和[qPlus]。',
      sort: 9,
      data: {
        ePlus: ({ attr, calc }) => calc(attr.mastery) * 309 / 100,
        qPlus: ({ attr, calc }) => calc(attr.mastery) * 774 / 100
      }
    },{
      title: '蓝砚4命：施放元素爆发之后元素精通提升[mastery]',
      cons: 4,
      data: {
        mastery: 60
      }
    }]

    const createdBy = '冰翼'
    return { details, defParams, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "薇斯纳": () => {
    const details = [
      {
        title: 'E后普攻首段伤害',
        dmg: ({ attr, talent }, dmg) => dmg(talent.a['一段伤害'], 'a')
      },
      {
        title: 'E后普攻尾段伤害',
        dmg: ({ attr, talent }, dmg) => dmg(talent.a['六段伤害'], 'a')
      },
      {
        title: '翔风剑一阶伤害',
        dmg: ({ attr, talent }, dmg) => dmg(talent.e['翔风剑一阶伤害'], 'e')
      },
      {
        title: '翔风剑二阶伤害',
        dmg: ({ attr, talent }, dmg) => dmg(talent.e['翔风剑二阶伤害'], 'e')
      },
      {
        title: '满「整肃」翔风剑二阶灵剑星扩散伤害',
        params: { Stellar: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(1.6 * calc(attr.atk) * talent.e['翔风剑二阶灵剑星扩散伤害'] / 100, '', 'stellarSwirl')
      },
      {
        title: '满「整肃」翔风剑三阶灵剑星扩散总伤害',
        params: { Stellar: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(1.6 * calc(attr.atk) * (talent.e['翔风剑三阶灵剑星扩散伤害'] + talent.e['翔风剑三阶灵剑最终段星扩散伤害'])/ 100, '', 'stellarSwirl')
      },
      {
        title: '满「整肃」Q灵剑星扩散伤害',
        params: { Stellar: true },
        dmg: ({ attr, calc, talent }, { basic }) => basic(1.6 * calc(attr.atk) * talent.q['灵剑星扩散伤害'] / 100, '', 'stellarSwirl')
      },
      {
        cons: 6,
        title: '6命翔风剑·变移风元素伤害',
        dmg: ({}, dmg) => dmg(150)
      },
      {
        cons: 6,
        title: '满「整肃」6命翔风剑·变移灵剑星扩散伤害',
        params: { Stellar: true },
        dmg: ({ attr, calc }, { basic }) => basic(1.6 * calc(attr.atk) * 200 / 100, '', 'stellarSwirl')
      }
    ]

    const defDmgIdx = 5
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [
      {
        title: '薇斯纳天赋：每有一位元素类型为冰元素或风元素的角色，薇斯纳的攻击力提升6%（默认3位）；' +
          '每有一位不为上述元素类型的角色，薇斯纳的元素精通提升25点。（默认1位）',
        data: {
          atkPct: ({ cons, params }) => (params.num1 || 3) * (cons >= 4 ? 6 * 3 : 6),
          mastery: ({ cons, params }) => (params.num2 || 1) * (cons >= 4 ? 25 * 3 : 25)
        }
      },
      {
        check: ({ params }) => params.Stellar === true,
        title: '薇斯纳天赋：基于薇斯纳的攻击力，对队伍中角色造成的星扩散反应提升[fypct]%的基础伤害',
        sort: 9,
        data: {
          fypct: ({ attr, calc }) => Math.min(calc(attr.atk) / 100 * 0.7, 14)
        }
      },
      {
        title: '薇斯纳1命：薇斯纳在巡风列装模式下造成的星扩散反应伤害提升[stellarSwirl]%。',
        cons: 1,
        data: {
          stellarSwirl: 20,
          stellarVortex: 20
        }
      },
      {
        title: '薇斯纳2命：拥有最大层数的整肃时，薇斯纳的攻击力提升[atkPct]%',
        cons: 2,
        data: {
          atkPct: 40
        }
      },
      {
        title: '薇斯纳6命：星扩散反应伤害擢升[elevated]%',
        cons: 6,
        data: {
          elevated: 20
        }
      }
    ]

    const createdBy = '冰翼'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "行秋": () => {
    const details = [{
      title: '先QA后E两段伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: '雨帘剑伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['剑雨伤害'], 'q')
    }, {
      title: '雨帘剑蒸发',
      dmg: ({ talent }, dmg) => dmg(talent.q['剑雨伤害'], 'q', 'vaporize')
    }]

    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
      title: '行秋被动：获得20%水伤加成',
      isStatic: true,
      data: {
        dmg: 20
      }
    }, {
      title: '行秋2命：受到剑雨攻击的敌人水元素抗性降低15%',
      cons: 2,
      data: {
        kx: 15
      }
    }, {
      title: '行秋4命：开Q后E的伤害提升50%',
      cons: 4,
      data: {
        eMulti: 50
      }
    }, 'vaporize']
    return { details, mainAttr, buffs }
  },
  "诺艾尔": () => {
    const details = [{
      title: '护心铠盾量',
      dmg: ({ talent, calc, attr }, { shield }) =>
        shield((talent.e['吸收量2'][0] * calc(attr.def) / 100 + talent.e['吸收量2'][1] * 1) * 1.5)
    }, {
      title: '护心铠单次治疗',
      dmg: ({ talent, calc, attr }, { heal }) =>
        heal(talent.e['治疗量2'][0] * calc(attr.def) / 100 + talent.e['治疗量2'][1] * 1)
    }, {
      title: '开Q尾刀',
      dmg: ({ talent }, dmg) => dmg(talent.a['四段伤害'], 'a')
    }, {
      title: '开Q重击',
      params: { q: true },
      dmg: ({ talent }, dmg) => dmg(talent.a['重击循环伤害'], 'a2')
    }]

    const defDmgIdx = 2
    const mainAttr = 'atk,def,cpct,cdmg'

    const buffs = [{
      title: '元素爆发：诺艾尔开Q基于防御力提高攻击力[atkPlus]',
      sort: 9,
      data: {
        atkPlus: ({ attr, calc, talent }) => talent.q['攻击力提高'] * calc(attr.def) / 100
      }
    }, {
      title: '诺艾尔6命：诺艾尔开Q基于防御力提高攻击力[atkPlus]',
      sort: 9,
      cons: 6,
      data: {
        atkPlus: ({ attr, calc, talent }) => calc(attr.def) * 0.5
      }
    }]
    return { details, defDmgIdx, mainAttr, buffs }
  },
  "赛索斯": () => {
    const details = [{
        title: '贯影箭伤害',
        dmg: ({ talent, attr }, { basic }) => basic(talent.a['贯影箭伤害2'][0] * attr.atk / 100 + talent.a['贯影箭伤害2'][1] * attr.mastery / 100, 'a2')
    }, {
        title: '贯影箭激化',
        dmg: ({ talent, attr }, { basic }) => basic(talent.a['贯影箭伤害2'][0] * attr.atk / 100 + talent.a['贯影箭伤害2'][1] * attr.mastery / 100, 'a2', 'aggravate')
    }, {
        title: 'E伤害',
        dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
        title: 'E激化伤害',
        dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e', 'aggravate')
    }, {
        title: 'Q后普攻一段',
        params: { q: true },
        dmg: ({ talent }, dmg) => dmg(talent.a['一段伤害'], 'a2')
    }, {
        title: 'Q后普攻一段激化',
        params: { q: true },
        dmg: ({ talent }, dmg) => dmg(talent.a['一段伤害'], 'a2', 'aggravate')
    }, {
        title: 'Q后普攻三段',
        params: { q: true },
        dmg: ({ talent }, dmg) => dmg(talent.a['三段伤害'], 'a2')
    }, {
        title: 'Q后普攻三段激化',
        params: { q: true },
        dmg: ({ talent }, dmg) => dmg(talent.a['三段伤害'], 'a2', 'aggravate')
    }]

    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = [{
        check: ({ params }) => params.q === true,
        title: '赛索斯技能：暝弦矢造成的伤害提升[a2Plus]',
        data: {
          a2Plus: ({ talent, attr }) => attr.mastery / 100 * talent.q['瞑弦矢伤害提升']
        }
    }, {
        check: ({ params }) => params.q !== true,
        title: '赛索斯天赋：贯影箭造成的伤害值提升[a2Plus]',
        data: {
          a2Plus: ({ attr, calc }) => calc(attr.mastery) * 600 / 100
        }
    }, {
        check: ({ params }) => params.q !== true,
        title: '赛索斯1命：贯影箭的暴击率提升[a2Cpct]%',
        cons: 1,
        data: {
          a2Cpct: 15
        }
    }, {
        title: '赛索斯2命：释放EQ获得[dmg]%雷伤加成',
        cons: 2,
        data: {
          dmg: 15 * 2
        }
    }, {
        title: '赛索斯4命：贯影箭与暝弦矢命中2名及以上的敌人元素精通提升[mastery]',
        cons: 4,
        data: {
          mastery: 80
        }
    }, 'aggravate']

    const createdBy = 'liangshi'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "赛诺": () => {
    const details = [{
      title: 'Q状态·普攻首段',
      dmg: ({ talent }, dmg) => dmg(talent.q['一段伤害'], 'a')
    }, {
      title: 'Q状态·E伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['冥祭伤害'], 'e')
    }, {
      title: 'Q状态·强化E伤害',
      params: { showEBuff: true, eBuff: true },
      dmg: ({ talent }, dmg) => dmg(talent.e['冥祭伤害'], 'e')
    }, {
      title: '【辉映·星超导】渡荒之雷·星偕星超导伤害',
      params: { cons_1: true, cons_2: true },
      dmg: ({ attr, calc }, { basic }) => basic(calc(attr.atk) * 200 / 100 + calc(attr.mastery) * 600 / 100, '', 'stellarConduct')
    }, {
      title: 'Q状态·QTE总伤害',
      params: { showEBuff: true },
      dmg: ({ attr, calc, talent }, { basic, dynamic }) => {
        const em = calc(attr.mastery)
        const atk = calc(attr.atk)
        const ePlustd = 1.00 * atk + em * 2.5
        let eDmg = dynamic(talent.e['冥祭伤害'], 'e', { dynamicDmg: 35 })
        let ePlusDmg = basic(ePlustd, 'e')
        return {
          dmg: eDmg.dmg + ePlusDmg.dmg * 3,
          avg: eDmg.avg + ePlusDmg.avg * 3
        }
      }
    }, {
      title: 'Q状态·QTE超激化总伤害',
      params: { showEBuff: true },
      dmg: ({ attr, calc, talent }, { basic, dynamic }) => {
        const em = calc(attr.mastery)
        const atk = calc(attr.atk)
        const ePlustd = 1.00 * atk + em * 2.5
        let eAggrDmg = dynamic(talent.e['冥祭伤害'], 'e', { dynamicDmg: 35 }, 'aggravate')
        let ePlusDmg = basic(ePlustd, 'e')
        let ePlusAggrDmg = basic(ePlustd, 'e', 'aggravate')
        return {
          dmg: eAggrDmg.dmg + ePlusAggrDmg.dmg + ePlusDmg.dmg * 2,
          avg: eAggrDmg.avg + ePlusAggrDmg.avg + ePlusDmg.avg * 2
        }
      }
    }, {
      check: ({ cons }) => cons < 6,
      dmgKey: 'qAggravate',
      title: 'Q状态·一轮普攻5A+QTE超激化总伤害',
      params: { showEBuff: true },
      dmg: ({ attr, calc, talent }, dmg) => {
        const em = calc(attr.mastery)
        const atk = calc(attr.atk)
        const ePlustd = 1.00 * atk + em * 2.5
        let eAggrDmg = dmg.dynamic(talent.e['冥祭伤害'], 'e', { dynamicDmg: 35 }, 'aggravate')
        let ePlusDmg = dmg.basic(ePlustd, 'e')
        let ePlusAggrDmg = dmg.basic(ePlustd, 'e', 'aggravate')
        let eAllDmg = {
          dmg: eAggrDmg.dmg + ePlusAggrDmg.dmg + ePlusDmg.dmg * 2,
          avg: eAggrDmg.avg + ePlusAggrDmg.avg + ePlusDmg.avg * 2
        }

        let a1Aggrdmg = dmg(talent.q['一段伤害'], 'a', 'aggravate')
        let a2dmg = dmg(talent.q['二段伤害'], 'a')
        let a3dmg = dmg(talent.q['三段伤害'], 'a')
        let a4Aggrdmg = dmg(talent.q['四段伤害2'][0], 'a', 'aggravate')
        let a4dmg = dmg(talent.q['四段伤害2'][1], 'a')
        let a5dmg = dmg(talent.q['五段伤害'], 'a')
        return {
          dmg: eAllDmg.dmg + a1Aggrdmg.dmg + a2dmg.dmg + a3dmg.dmg + a4Aggrdmg.dmg + a4dmg.dmg + a5dmg.dmg,
          avg: eAllDmg.avg + a1Aggrdmg.avg + a2dmg.avg + a3dmg.avg + a4Aggrdmg.avg + a4dmg.avg + a5dmg.avg
        }
      }
    }, {
      check: ({ cons }) => cons >= 6,
      dmgKey: 'qAggravate',
      title: 'Q状态·一轮普攻5A+QTE超激化总伤害（消耗4层豺祭）',
      params: { showEBuff: true },
      dmg: ({ attr, calc, talent }, dmg) => {
        const em = calc(attr.mastery)
        const atk = calc(attr.atk)
        const ePlustd = 1.00 * atk + em * 2.5
        let eAggrDmg = dmg.dynamic(talent.e['冥祭伤害'], 'e', { dynamicDmg: 35 }, 'aggravate')
        let ePlusDmg = dmg.basic(ePlustd, 'e')
        let ePlusAggrDmg = dmg.basic(ePlustd, 'e', 'aggravate')
        let eAllDmg = {
          dmg: eAggrDmg.dmg + ePlusAggrDmg.dmg + ePlusDmg.dmg * 2,
          avg: eAggrDmg.avg + ePlusAggrDmg.avg + ePlusDmg.avg * 2
        }

        let a1Aggrdmg = dmg(talent.q['一段伤害'], 'a', 'aggravate')
        let a2dmg = dmg(talent.q['二段伤害'], 'a')
        let a3dmg = dmg(talent.q['三段伤害'], 'a')
        let a4Aggrdmg = dmg(talent.q['四段伤害2'][0], 'a', 'aggravate')
        let a4dmg = dmg(talent.q['四段伤害2'][1], 'a')
        let a5dmg = dmg(talent.q['五段伤害'], 'a')
        return {
          dmg: eAllDmg.dmg + a1Aggrdmg.dmg + a2dmg.dmg + a3dmg.dmg + a4Aggrdmg.dmg + a4dmg.dmg + a5dmg.dmg + ePlusDmg.dmg * 3 + ePlusAggrDmg.dmg,
          avg: eAllDmg.avg + a1Aggrdmg.avg + a2dmg.avg + a3dmg.avg + a4Aggrdmg.avg + a4dmg.avg + a5dmg.avg + ePlusDmg.avg * 3 + ePlusAggrDmg.avg
        }
      }
    }, {
      check: ({ cons }) => cons < 6,
      dmgKey: 'qStellarConduct',
      title: 'Q状态·一轮普攻5A+QTE星超导总伤害',
      params: { showEBuff: true, cons_1: true, cons_2: true },
      dmg: ({ attr, calc, talent }, dmg) => {
        const em = calc(attr.mastery)
        const atk = calc(attr.atk)
        const stellarTd = 2.00 * atk + em * 6.0
        let eDmg = dmg.dynamic(talent.e['冥祭伤害'], 'e', { dynamicDmg: 35 })
        let stellarDmg = dmg.basic(stellarTd, '', 'stellarConduct')
        let a1dmg = dmg(talent.q['一段伤害'], 'a')
        let a2dmg = dmg(talent.q['二段伤害'], 'a')
        let a3dmg = dmg(talent.q['三段伤害'], 'a')
        let a4dmg1 = dmg(talent.q['四段伤害2'][0], 'a')
        let a4dmg2 = dmg(talent.q['四段伤害2'][1], 'a')
        let a5dmg = dmg(talent.q['五段伤害'], 'a')
        return {
          dmg: eDmg.dmg + stellarDmg.dmg * 3 + a1dmg.dmg + a2dmg.dmg + a3dmg.dmg + a4dmg1.dmg + a4dmg2.dmg + a5dmg.dmg,
          avg: eDmg.avg + stellarDmg.avg * 3 + a1dmg.avg + a2dmg.avg + a3dmg.avg + a4dmg1.avg + a4dmg2.avg + a5dmg.avg
        }
      }
    }, {
      check: ({ cons }) => cons >= 6,
      dmgKey: 'qStellarConduct',
      title: 'Q状态·一轮普攻5A+QTE星超导总伤害（消耗4层豺祭）',
      params: { showEBuff: true, cons_1: true, cons_2: true },
      dmg: ({ attr, calc, talent }, dmg) => {
        const em = calc(attr.mastery)
        const atk = calc(attr.atk)
        const stellarTd = 2.00 * atk + em * 6.0
        let eDmg = dmg.dynamic(talent.e['冥祭伤害'], 'e', { dynamicDmg: 35 })
        let stellarDmg = dmg.basic(stellarTd, '', 'stellarConduct')
        let a1dmg = dmg(talent.q['一段伤害'], 'a')
        let a2dmg = dmg(talent.q['二段伤害'], 'a')
        let a3dmg = dmg(talent.q['三段伤害'], 'a')
        let a4dmg1 = dmg(talent.q['四段伤害2'][0], 'a')
        let a4dmg2 = dmg(talent.q['四段伤害2'][1], 'a')
        let a5dmg = dmg(talent.q['五段伤害'], 'a')
        return {
          dmg: eDmg.dmg + stellarDmg.dmg * 3 + a1dmg.dmg + a2dmg.dmg + a3dmg.dmg + a4dmg1.dmg + a4dmg2.dmg + a5dmg.dmg + stellarDmg.dmg * 4,
          avg: eDmg.avg + stellarDmg.avg * 3 + a1dmg.avg + a2dmg.avg + a3dmg.avg + a4dmg1.avg + a4dmg2.avg + a5dmg.avg + stellarDmg.avg * 4
        }
      }
    }]

    const defDmgKey = 'qStellarConduct'
    const mainAttr = 'atk,cpct,cdmg,mastery'
    const defParams = { mArtisDiffCount: 2 }

    const buffs = [{
      title: '圣仪·煟煌随狼行：Q状态下提升元素精通100点',
      data: {
        mastery: 100
      }
    }, {
      check: ({ params }) => params.cons_1 === true,
      title: '赛诺1命：【辉映·星超导】进入启途誓使状态时，元素精通提升[mastery]点',
      cons: 1,
      data: {
        mastery: 200
      }
    }, {
      title: '赛诺2命：普攻后提高雷伤，满5层Buff增加50%雷元素伤害',
      cons: 2,
      data: {
        dmg: 50
      }
    }, {
      check: ({ params }) => params.cons_2 === true,
      title: '赛诺2命：【辉映·星超导】处于偕日共升效果影响下的角色的普通攻击与重击命中敌人时，该角色造成的星超导反应伤害最高累计提升[stellarConduct]%',
      cons: 2,
      data: {
        stellarConduct: 16 * 5
      }
    }, {
      check: ({ params }) => params.showEBuff === true,
      title: '天赋-落羽的裁择：末途真眼状态提升秘仪·律渊渡魂35%伤害，发射渡荒之雷造成100%攻击力伤害',
      data: {
        eDmg: ({ params }) => params.eBuff ? 35 : 0
      }
    }, {
      title: '天赋-九弓的执命：基于元素精通提升普攻[aPlus]点伤害值，渡荒之雷提升[_ePlus]伤害值，渡荒之雷·星偕提升[_stellarPlus]伤害值',
      sort: 9,
      data: {
        aPlus: ({ attr, calc }) => calc(attr.mastery) * 1.5,
        _ePlus: ({ attr, calc }) => calc(attr.mastery) * 2.5,
        _stellarPlus: ({ attr, calc }) => calc(attr.mastery) * 6.0
      }
    }]

    const createdBy = 'Aluxes'
    return { details, defDmgKey, mainAttr, defParams, buffs, createdBy }
  },
  "辛焱": () => {
    const details = [{
      title: 'E伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['挥舞伤害'], 'e')
    }, {
      title: '三级护盾量',
      dmg: ({ talent, calc, attr }, { shield }) =>
        shield(talent.e['三级护盾吸收量2'][0] * calc(attr.def) / 100 + talent.e['三级护盾吸收量2'][1] * 1)
    }, {
      title: 'Q释放伤害',
      params: { phy: true },
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q', 'phy')
    }, {
      title: '重击循环伤害',
      params: { a2: true, phy: true },
      dmg: ({ talent }, dmg) => dmg(talent.a['重击循环伤害'], 'a2', 'phy')
    }]

    const mainAttr = 'atk,def,cpct,cdmg'
    const enemyName = '魔偶/女士/雷神/丘丘'

    const buffs = [{
      title: '辛焱被动：处于护盾下物理伤害提高15%',
      data: {
        phy: 15
      }
    }, {
      title: '辛焱2命：Q的暴击率提升100%',
      cons: 2,
      data: {
        qCpct: 100
      }
    }, {
      title: '辛焱4命：E造成伤害使敌人物理抗性降低15%',
      cons: 4,
      check: ({ params }) => params.phy === true,
      data: {
        kx: 15
      }
    }, {
      title: '辛焱6命：进行重击时，基于防御力的50%获得[atkPlus]攻击力加成',
      cons: 6,
      sort: 9,
      check: ({ params }) => params.a2 === true,
      data: {
        atkPlus: ({ attr, calc }) => calc(attr.def) * 0.5
      }
    }]
    return { details, mainAttr, enemyName, buffs }
  },
  "达达利亚": () => {
    const details = [{
      title: '开E后重击',
      dmg: ({ talent }, dmg) => dmg(talent.e['重击伤害'], 'a2')
    }, {
      title: '断流·斩 伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['断流·斩 伤害'], 'e')
    }, {
      title: '开E后Q伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害·近战'], 'q')
    }, {
      title: '开E后Q蒸发',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害·近战'], 'q', 'vaporize')
    }]

    const mainAttr = 'atk,cpct,cdmg,mastery'

    const buffs = ['vaporize']
    return { details, mainAttr, buffs }
  },
  "迪卢克": () => {
    const details = [{
      title: 'E三段伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['三段伤害'], 'e')
    }, {
      title: 'E三段蒸发',
      dmg: ({ talent }, dmg) => dmg(talent.e['三段伤害'], 'e', 'vaporize')
    }, {
      title: 'Q爆发伤害',
      params: { q: true },
      dmg: ({ talent }, dmg) => dmg(talent.q['斩击伤害'], 'q')
    }, {
      title: '开Q后单次重击',
      params: { q: true },
      dmg: ({ talent }, dmg) => dmg(talent.a['重击循环伤害'], 'a2')
    }]

    const defParams = { monv: 3 }
    const mainAttr = 'atk,cpct,cdmg,mastery'
    const defDmgIdx = 1

    const buffs = [{
      title: '迪卢克天赋：释放元素爆发后获得20%火伤加成',
      data: {
        dmg: ({ params }) => params.q ? 20 : 0
      }
    }, {
      title: '迪卢克1命：对于生命值高于50%的敌人，造成伤害提高15%',
      cons: 1,
      data: {
        dmg: 15
      }
    }, {
      title: '迪卢克2命：受伤3层提高攻击力30%',
      cons: 2,
      data: {
        atkPct: 30
      }
    }, {
      title: '迪卢克4命：间隔2秒释放E提高伤害40%',
      cons: 4,
      data: {
        eDmg: 40
      }
    }, 'vaporize']
    return { details, defParams, mainAttr, defDmgIdx, buffs }
  },
  "迪奥娜": () => {
    const details = [{
      title: '长按E总伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['猫爪伤害'] * 5, 'e')
    }, {
      title: '长按E护盾量',
      dmg: ({ talent, attr, calc, cons }, { shield }) => {
        const sheildPlus = cons >= 2 ? 1.15 : 1
        return shield((talent.e['护盾基础吸收量2'][0] * calc(attr.hp) / 100 + talent.e['护盾基础吸收量2'][1] * 1) * 1.75 * sheildPlus)
      }

    }, ({ cons }) => {
      return {
        title: `${cons === 6 ? '半血' : ''}Q每跳治疗`,
        dmg: ({ talent, calc, attr }, { heal }) =>
          heal(talent.q['持续治疗量2'][0] * calc(attr.hp) / 100 + talent.q['持续治疗量2'][1] * 1)
      }
    }]

    const defDmgIdx = 1
    const mainAttr = 'atk,hp,cpct,cdmg'

    const buffs = [{
      title: '迪奥娜天赋：长按E获得75%护盾吸收量加成',
      data: {
        _shield: 75
      }
    }, {
      title: '迪奥娜2命：猫爪冻冻造成的伤害提高15%，护盾吸收量提高15%',
      cons: 2,
      data: {
        eDmg: 15,
        _shield: 15
      }
    }, {
      title: '迪奥娜6命：生命值低于50%时受治疗加成提升30%',
      cons: 6,
      data: {
        heal: 30
      }
    }]
    return { details, defDmgIdx, mainAttr, buffs }
  },
  "迪希雅": () => {
    const details = [{
      title: 'E释放伤害',
      params: { e2: false },
      dmg: ({ talent }, dmg) => dmg(talent.e['净焰昂藏伤害'], 'e')
    }, {
      title: 'E协同伤害',
      params: { e2: true },
      dmg: ({ talent, calc, attr, cons }, { basic }) => {
        const td = talent.e['领域伤害2']
        const hp = calc(attr.hp)
        const atk = calc(attr.atk)
        return basic(td[0] * atk / 100 + td[1] * hp / 100, 'e')
      }
    }, {
      title: 'Q炽鬃拳伤害',
      dmg: ({ talent, calc, attr, cons }, { basic }) => {
        const td = talent.q['炽鬃拳伤害2']
        const hp = calc(attr.hp)
        const atk = calc(attr.atk)
        return basic(td[0] * atk / 100 + td[1] * hp / 100, 'q')
      }
    }, {
      title: 'Q炽鬃拳蒸发伤害',
      dmg: ({ talent, calc, attr, cons }, { basic }) => {
        const td = talent.q['炽鬃拳伤害2']
        const hp = calc(attr.hp)
        const atk = calc(attr.atk)
        return basic(td[0] * atk / 100 + td[1] * hp / 100, 'q', '蒸发')
      }
    }]

    const defDmgIdx = 2
    const mainAttr = 'hp,atk,cpct,cdmg'

    const defParams = {
      e2: true
    }

    const buffs = [{
      title: '迪希雅1命：生命值上限提升20%',
      cons: 1,
      data: {
        hpPct: 20
      }
    }, {
      title: '迪希雅1命：基于生命值上限，e伤害提高[ePlus]，q伤害提高[qPlus]',
      cons: 1,
      sort: 9,
      data: {
        ePlus: ({ attr, calc }) => calc(attr.hp) * 0.036,
        qPlus: ({ attr, calc }) => calc(attr.hp) * 0.06
      }
    }, {
      check: ({ params }) => params.e2 === true,
      title: '迪希雅2命：净焰剑狱下次协同攻击造成的伤害提升50%',
      cons: 2,
      data: {
        eDmg: 50
      }
    }, {
      title: '迪希雅6命：暴击率增加10%，暴击伤害增加60%（默认叠满）',
      cons: 6,
      data: {
        cpct: 10,
        cdmg: 60
      }
    }, 'vaporize']
    return { details, defDmgIdx, mainAttr, defParams, buffs }
  },
  "那维莱特": () => {
    const details = [{
      title: '重击伤害',
      dmg: ({ talent, attr, calc, cons }, { basic }) => {
        const a2Multi = cons >= 1 ? 1.6 : 1.25
        return basic(a2Multi * talent.a['重击·衡平推裁持续伤害'] * calc(attr.hp) / 100, 'a2')
      }
    }, {
      title: 'E伤害',
      dmg: ({ talent, attr, calc }, { basic }) => basic(talent.e['技能伤害'] * calc(attr.hp) / 100, 'e')
    }, {
      title: 'Q释放伤害',
      dmg: ({ talent, attr, calc }, { basic }) => basic(talent.q['技能伤害'] * calc(attr.hp) / 100, 'q')
    }, {
      title: 'Q总伤害',
      dmg: ({ talent, attr, calc }, { basic }) => {
        const td = talent.q['技能伤害'] + talent.q['水瀑伤害'] * 2
        return basic(td * calc(attr.hp) / 100, 'q')
      }
    }, {
      title: '满水滴一轮重击总伤害',
      dmg: ({ talent, attr, calc, cons }, { basic }) => {
        const count = cons >= 6 ? 30 : 8
        const td = talent.a['重击·衡平推裁持续伤害'] * count
        const extraTd = cons >= 6 ? 20 * 6 : 0
        const a2Multi = cons >= 1 ? 1.6 : 1.25
        return basic(a2Multi * (td + extraTd) * calc(attr.hp) / 100, 'a2')
      }
    }]

    const defDmgIdx = 4
    const mainAttr = 'hp,dmg,cpct,cdmg'

    const buffs = [{
      title: '天赋-古海孑遗：按两层计算，重击·衡平推裁造成原本125%的伤害',
      check: ({ cons }) => cons < 1
    }, {
      title: '天赋-古海孑遗：按三层计算，重击·衡平推裁造成原本160%的伤害',
      cons: 1
    }, {
      title: '天赋-至高仲裁：基于当前生命值超出生命值上限30%的部分，提升[dmg]%水元素伤害',
      data: {
        dmg: 30
      }
    }, {
      title: '那维2命：重击·衡平推裁的暴击伤害提升[a2Cdmg]%',
      cons: 2,
      data: {
        a2Cdmg: 42
      }
    }, {
      title: '那维6命：延长重击持续时间至12s，同时每2s，额外造成20%生命倍率的视为重击·衡平推裁的伤害',
      cons: 6
    }, {
      title: '双水Buff：生命值提高[hpPct]%',
      data: {
        hpPct: 25
      }
    }]

    const createdBy = 'Aluxes'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "重云": () => {
    const details = [{
      title: '重云E伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, ({ cons }) => {
      let count = cons === 6 ? 4 : 3
      return {
        title: `Q ${count}柄灵刃总伤害`,
        dmg: ({ talent, cons }, dmg) => dmg(talent.q['技能伤害'] * count, 'q')
      }
    }]

    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      title: '重云6命：对于生命百分比低于重云的敌人伤害提升15%，同时额外多一柄灵刃',
      cons: 6,
      data: {
        qDmg: 15
      }
    }]
    return { details, defDmgIdx, mainAttr, buffs }
  },
  "钟离": () => {
    const details = [{
      title: '玉璋护盾量',
      talent: 'e',
      dmg: ({ attr, calc, talent }, { shield }) => shield(talent.e['护盾基础吸收量'] + calc(attr.hp) * talent.e['护盾附加吸收量'] / 100)
    }, {
      title: '共鸣伤害',
      talent: 'e',
      dmg: ({ talent }, dmg) => dmg(talent.e['岩脊伤害/共鸣伤害'][1], 'e') // 6856
    }, {
      title: '天星伤害',
      talent: 'q',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    }]

    const mainAttr = 'hp,atk,cpct,cdmg'

    const buffs = [{
      title: '钟离被动：满层Buff下护盾强效提高25%',
      data: {
        shield: 25
      }
    }, {
      title: '岩系护盾：岩系护盾吸收效率150%',
      data: {
        shieldInc: 50
      }
    }, {
      title: '钟离被动：基于生命值上限，共鸣伤害提高[ePlus]，天星伤害提高[qPlus]',
      sort: 9,
      data: {
        ePlus: ({ attr, calc }) => calc(attr.hp) * 0.019,
        qPlus: ({ attr, calc }) => calc(attr.hp) * 0.33
      }
    }, {
      title: '玉璋护盾：降低敌人全抗性20%',
      data: {
        kx: 20
      }
    }]
    return { details, mainAttr, buffs }
  },
  "闲云": () => {
    const details = [{
      title: '仙力助推下落攻击伤害提升值',
      dmg: ({ attr, cons }) => {
        return {
          avg: cons < 2 ? Math.min(attr.atk * 2, 9000) : Math.min(attr.atk * 4, 18000)
        }
      }
    }, {
      title: 'E释放伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: 'E一段跳冲击波伤害',
      params: { btt: 1 },
      dmg: ({ talent }, dmg) => dmg(talent.e['闲云冲击波伤害'][0], 'a3')
    }, {
      title: 'E二段跳冲击波伤害',
      params: { btt: 2 },
      dmg: ({ talent }, dmg) => dmg(talent.e['闲云冲击波伤害'][1], 'a3')
    }, {
      title: 'E三段跳冲击波伤害',
      params: { btt: 3 },
      dmg: ({ talent }, dmg) => dmg(talent.e['闲云冲击波伤害'][2], 'a3')
    }, {
      title: 'Q释放伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    }, {
      title: 'Q释放治疗量',
      dmg: ({ attr, talent }, { heal }) => heal(talent.q['治疗量2'][0] * attr.atk / 100 + talent.q['治疗量2'][1])
    }, {
      title: 'Q持续治疗量',
      dmg: ({ attr, talent }, { heal }) => heal(talent.q['持续治疗量2'][0] * attr.atk / 100 + talent.q['持续治疗量2'][1])
    }]

    const defDmgIdx = 0
    const mainAttr = 'atk,cpct,cdmg,heal'

    const buffs = [{
      title: '闲云天赋：Q后下落攻击坠地冲击造成的伤害提升[a3Plus]',
      sort: 9,
      data: {
        a3Plus: ({ attr, cons }) => cons < 2 ? Math.min(attr.atk * 2, 9000) : Math.min(attr.atk * 4, 18000)
      }
    }, {
      title: '闲云2命：施放E后，攻击力提升[atkPct]%',
      cons: 2,
      data: {
        atkPct: 20
      }
    }, {
      check: ({ params }) => params.btt !== undefined,
      title: '闲云6命：施展了[buffCount]次步天梯,闲云冲击波的暴击伤害提升[a3Cdmg]%',
      cons: 6,
      data: {
        buffCount: ({ params }) => params.btt,
        a3Cdmg: ({ params }) => (5 / 3) * Math.pow(params.btt, 3) - (5 / 2) * Math.pow(params.btt, 2) + (95 / 6) * params.btt
      }
    }]

    const createdBy = 'liangshi'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "阿罗夏": () => {
    const getHunterAimStacks = ({ cons }) => cons >= 6 ? 2 : 1

    const details = [{
      title: '点按E伤害',
      params: { HunterAim: true },
      dmg: ({ talent }, dmg) => dmg(talent.e['点按伤害'], 'e')
    }, {
      title: 'Q每跳治疗量',
      params: { HunterAim: true },
      dmg: ({ attr, calc }, { heal }) => heal(calc(attr.atk) * 120 / 100)
    }, {
      title: 'E攻击力提升',
      params: { HunterAim: true },
      dmg: ({ talent, cons }) => ({
        avg: Format.percent(talent.e['猎者之准攻击力提升'] * getHunterAimStacks({ cons }) / 100),
        type: 'text'
      })
    }, {
      cons: 4,
      title: '4命追加每跳治疗',
      params: { HunterAim: true },
      dmg: ({ attr, calc }, { heal }) => heal(calc(attr.atk) * 60 / 100)
    }]

    const defDmgIdx = 1
    const mainAttr = 'atk,recharge,cpct,cdmg,heal'

    const buffs = [{
      check: ({ params }) => params.HunterAim === true,
      title: '猎者之准：当前场上角色攻击力提升[atkPct]%',
      data: {
        atkPct: ({ talent, cons }) => talent.e['猎者之准攻击力提升'] * getHunterAimStacks({ cons })
      }
    }, {
      title: '阿罗夏天赋：基于元素充能效率提升元素战技与元素爆发伤害[eDmg]%',
      sort: 4,
      data: {
        eDmg: ({ attr, calc }) => Math.min(calc(attr.recharge) * 0.35, 70),
        qDmg: ({ attr, calc }) => Math.min(calc(attr.recharge) * 0.35, 70)
      }
    }]

    const createdBy = '墨痕'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "阿蕾奇诺": () => {
    const details = [{
      title: 'E后普攻首段伤害',
      params: { BondOfLifeGet: 1, DecreasedBondOfLife: 1 },
      dmg: ({ talent }, dmg) => dmg(talent.a['一段伤害'], 'a')
    }, {
      check: ({ cons }) => cons >= 2,
      title: '2命血偿勒令回收伤害',
      params: { BondOfLifeGet: 1 },
      dmg: ({ attr }, { basic }) => basic(attr.atk * 900 / 100, '')
    }, {
      title: 'Q伤害',
      params: { BondOfLifeGet: 1, DecreasedBondOfLife: 8, HealNumber: 1 },
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    }, {
      title: 'Q蒸发伤害',
      params: { BondOfLifeGet: 1, DecreasedBondOfLife: 8, HealNumber: 1 },
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q', 'vaporize')
    }, {
      title: 'Q治疗量',
      params: { BondOfLife: 145, BondOfLifeGet: 1, DecreasedBondOfLife: 8, HealNumber: 1 },
      dmg: ({ attr, weapon }, { heal }) => heal(150 / 100 * ((weapon.name === '赤月之形' ? 170 : 145) / 100) * attr.hp + 150 / 100 * attr.atk)
    }]

    const defDmgIdx = 0
    const mainAttr = 'atk,cpct,cdmg,mastery,dmg'
    const defParams = ({ weapon }) => weapon.name === '赤月之形' ? { BondOfLife: 155 } : { BondOfLife: 130 }// 生命之契在此调整,请勿超过200

    const buffs = [{
      title: '阿蕾奇诺天赋：[buffCount]%最大生命值的生命之契,普通攻击伤害提升[aPlus]',
      data: {
        buffCount: ({ params }) => Math.min(params.BondOfLife, 200),
        aPlus: ({ talent, attr, params, cons }) => attr.atk * Math.min(params.BondOfLife, 200) / 100 * (cons >= 1 ? (talent.a['红死之宴提升'] + 100) : talent.a['红死之宴提升']) / 100
      }
    }, {
      title: '阿蕾奇诺天赋：在战斗状态下获得[dmg]%伤害加成',
      data: {
        dmg: 40
      }
    }, {
      title: '阿蕾奇诺6命：Q造成的伤害提高[qPlus],且释放后普通攻击与元素爆发的暴击率提高[aCpct]%,暴击伤害提高[aCdmg]%',
      cons: 6,
      data: {
        qPlus: ({ attr, params }) => attr.atk * Math.min(params.BondOfLife, 200) / 100 * 700 / 100,
        aCpct: 10,
        aCdmg: 70,
        qCpct: 10,
        qCdmg: 70
      }
    }, 'vaporize']

    const createdBy = 'liangshi'
    return { details, defDmgIdx, mainAttr, defParams, buffs, createdBy }
  },
  "阿贝多": () => {
    const details = [{
      title: 'E刹那之花伤害',
      dmg: ({ talent, attr }, { basic }) => {
        let ret = talent.e['刹那之花伤害'] * attr.def / 100
        return basic(ret, 'e')
      }
    }, {
      title: 'E刹那之花(打半血)',
      params: {
        half: true
      },
      dmg: ({ talent, attr }, { basic }) => {
        let ret = talent.e['刹那之花伤害'] * attr.def / 100
        return basic(ret, 'e')
      }
    }, {
      title: 'Q总伤害',
      check: ({ cons }) => cons < 2,
      dmg: ({ talent }, dmg) => dmg(talent.q['爆发伤害'] + talent.q['生灭之花伤害'] * 7, 'q')
    }, {
      title: '满BuffQ总伤害',
      params: { cons_2 : true },
      cons: 2,
      dmg: ({ talent }, dmg) => dmg(talent.q['爆发伤害'] + talent.q['生灭之花伤害'] * 7, 'q')
    }, {
      title: '后台满buff自动施放生灭之花总伤害',
      cons: 2,
      dmg: ({ cons, calc, attr }, { basic }) => basic(3 * calc(attr.def) * (cons < 6 ? 300 : 550) / 100, 'q')
    }]

    const defParams = { Hexenzirkel: true } // 魔女会成员
    const defDmgIdx = 1
    const mainAttr = 'def,atk,cpct,cdmg'

    const buffs = [{
      title: '阿贝多被动：刹那之花对生命值低于50%的敌人造成的伤害提高25%',
      data: {
        eDmg: ({ params }) => params.half ? 25 : 0
      }
    }, {
      check: ({ params }) => params.half === true,
      title: '阿贝多天赋：若场上存在由阿贝多自己创造的瑰银，还会提升刹那之花对生命值低于50%的敌人造成的伤害，提升值相当于阿贝多防御力的240%',
      sort: 9,
      data: {
        ePlus: ({ calc, attr }) => calc(attr.def) * 240 / 100
      }
    }, {
      title: '阿贝多天赋：获得【魔导·秘仪】效果时，炼成阳华和瑰银后的20秒内，提升元素战技和元素爆发造成的伤害，每1000点防御力都将提升14%伤害。当前共提升[eDmg]%',
      sort: 9,
      data: {
        eDmg: ({ calc, attr }) => Math.min(calc(attr.def) / 1000 * 14, 42),
        qDmg: ({ calc, attr }) => Math.min(calc(attr.def) / 1000 * 14, 42)
      }
    }, {
      title: '阿贝多1命：施放元素战技后的20秒内，自身的防御力提升[defPct]%',
      data: {
        defPct: 50
      }
    }, {
      check: ({ params }) => params.cons_2 === true,
      title: '阿贝多2命：4层Buff提高Q [qPlus]伤害',
      cons: 2,
      sort: 9,
      data: {
        qPlus: ({ calc, attr }) => calc(attr.def) * 240 / 100
      }
    }]

    const createdBy = '喵喵 & 冰翼'
    return { details, defParams, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "雅珂达": () => {
    const details = [{
      title: 'E秘藏瓶装满伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['秘藏瓶装满伤害'], 'e')
    }, {
      title: 'E猫猫球伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['猫猫球伤害'], 'e')
    }, {
      title: 'Q技能伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['技能伤害'], 'q')
    }, {
      title: 'Q释放治疗量（通常）',
      dmg: ({ talent, attr, calc }, { heal }) => heal(talent.q['猫型家用互助协调器治疗量2'][0] / 100 * calc(attr.atk) + talent.q['猫型家用互助协调器治疗量2'][1])
    }, {
      title: 'Q释放治疗量（通常+额外）',
      dmg: ({ talent, attr, calc }, { heal }) => heal((talent.q['猫型家用互助协调器治疗量2'][0] + talent.q['最低生命值角色额外治疗量2'][0]) / 100 * calc(attr.atk)
        + talent.q['猫型家用互助协调器治疗量2'][1] + talent.q['最低生命值角色额外治疗量2'][1])
    }]

    const defDmgIdx = 3
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      title: '雅珂达6命：月兆·满辉情况下，秘藏瓶装满后，暴击率提升[cpct]%，暴击伤害提升[cdmg]%',
      cons: 6,
      data: {
        cpct: 5,
        cdmg: 40
      }
    }]

    const createdBy = '冰翼'
    return { details, defDmgIdx, mainAttr, buffs, createdBy }
  },
  "雷泽": () => {
    const details = [{
      title: '普攻首段伤害',
      dmg: ({ talent }, dmg) => dmg(talent.a['一段伤害'], 'a', 'phy')
    }, {
      title: 'E点按技能伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['点按技能伤害'], 'e')
    }, {
      title: 'E长按技能伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['长按技能伤害'], 'e')
    }, {
      title: 'Q协同攻击首段',
      dmg: ({ talent }, dmg) => dmg(talent.q['狼魂伤害'] * talent.a['一段伤害'] / 100, 'q')
    }, {
      title: '【魔导·秘仪】落雷伤害',
      dmg: ({ talent }, dmg) => dmg(150)
    }, {
      title: '6命落雷伤害',
      cons: 6,
      dmg: ({ talent }, dmg) => dmg(100)
    }]

    const defParams = { Hexenzirkel: true } // 魔女会成员
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      title: '雷泽1命：获得元素球后8秒伤害提高10%',
      cons: 1,
      data: {
        dmg: 10,
        phy: 10
      }
    }, {
      title: '雷泽4命：E点按降低敌人防御力15%',
      cons: 4,
      data: {
        enemyDef: 15
      }
    }, {
      title: '雷泽6命：消耗雷之印后的15秒内，雷泽的暴击率提升[cpct]%，暴击伤害提升[cdmg]%。',
      cons: 6,
      data: {
        cpct: 10,
        cdmg: 50
      }
    }]
    return { details, defParams, mainAttr, buffs }
  },
  "雷电将军": () => {
    const details = [{
      title: '零愿力Q首刀',
      params: {
        type: 1,
        num: 0
      },
      dmg: ({ talent, attr }, dmg) => dmg(talent.q['梦想一刀基础伤害'], 'q')
    }, {
      title: '满愿力Q首刀',
      params: {
        type: 0,
        num: 60
      },
      dmg: ({ talent, attr }, dmg) => dmg(talent.q['梦想一刀基础伤害'], 'q')
    }, {
      title: '满愿力Q后重击',
      params: {
        type: 1,
        num: 60
      },
      dmg: ({ talent, attr }, dmg) => dmg(talent.q['重击伤害'], 'q')
    }]

    const defParams = {
      num: 60,
      type: 0
    }

    const defDmgIdx = 1
    const mainAttr = 'atk,cpct,cdmg,recharge,dmg'

    const buffs = [{
      title: '恶曜开眼：开E元素爆发伤害提升[qDmg]%',
      data: {
        qDmg: ({ talent }) => talent.e['元素爆发伤害提高'] * 90
      }
    }, {
      title: '梦想真说：Q满愿力获得[qPct]%大招倍率加成',
      data: {
        qPct: ({ talent, params }) => talent.q['愿力加成'][params.type || 0] * params.num
      }
    }, {
      check: ({ cons }) => cons >= 2,
      title: '雷神2命：大招无视敌人[qIgnore]%防御力',
      data: {
        qIgnore: 60
      }
    }, {
      title: '雷神被动：基于元素充能获得[dmg]%雷伤加成',
      sort: 4,
      data: {
        dmg: ({ attr }) => Math.max(attr.recharge.base + attr.recharge.plus - 100, 0) * 0.4
      }
    }]
    return { details, defParams, defDmgIdx, mainAttr, buffs }
  },
  "香菱": () => {
    const details = [{
      title: '锅巴单口伤害',
      dmg: ({ talent }, dmg) => dmg(talent.e['喷火伤害'], 'e')
    }, {
      title: '锅巴单口蒸发',
      dmg: ({ talent }, dmg) => dmg(talent.e['喷火伤害'], 'e', 'vaporize')
    }, {
      title: '旋火轮单次伤害',
      params: { isQ: true},
      dmg: ({ talent }, dmg) => dmg(talent.q['旋火轮伤害'], 'q')
    }, {
      title: '旋火轮单次蒸发',
      params: { isQ: true },
      dmg: ({ talent }, dmg) => dmg(talent.q['旋火轮伤害'], 'q', 'vaporize')
    }]

    const defDmgIdx = 3
    const mainAttr = 'atk,cpct,cdmg'

    const buffs = [{
      cons: 1,
      title: '香菱1命：锅巴降低敌人火抗15',
      data: {
        kx: 15
      }
    }, {
      check: ({ params }) => !params.isQ,
      title: '香菱6命：旋火轮持续期间获得15%火伤加成',
      cons: 6,
      data: {
        dmg: 15
      }
    }, 'vaporize']
    return { details, defDmgIdx, mainAttr, buffs }
  },
  "魈": () => {
    const details = [{
      title: '风轮两立',
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: '开Q满被动E',
      params: { e: 1, layer: 5 },
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: '靖妖傩舞·首插',
      params: {
        layer: 1
      },
      dmg: ({ talent }, dmg) => dmg(talent.a['低空/高空坠地冲击伤害'][1], 'a3')
    }, {
      title: '靖妖傩舞·尾插',
      params: {
        layer: 5
      },
      dmg: ({ talent }, dmg) => dmg(talent.a['低空/高空坠地冲击伤害'][1], 'a3')
    }]

    const defDmgIdx = 3
    const mainAttr = 'atk,cpct,cdmg'

    const defParams = {
      layer: 0
    }

    const buffs = [{
      title: '靖妖傩舞：下落攻击伤害提升[a3Dmg]%',
      data: {
        a3Dmg: ({ talent }) => talent.q['普通攻击/重击/下落攻击伤害提升']
      }
    }, {
      title: '魈天赋：开Q后每3秒伤害提升5%，满层提高25%',
      data: {
        dmg: ({ params }) => params.layer * 5
      }
    }, {
      title: '魈被动：3层E使E的伤害提高45%',
      data: {
        eDmg: ({ params }) => params.e ? 45 : 0
      }
    }]
    return { details, defDmgIdx, mainAttr, defParams, buffs }
  },
  "鹿野院平藏": () => {
    const details = [{
      title: '勠心拳伤害',
      params: { e: 0 },
      dmg: ({ talent }, dmg) => dmg(talent.e['技能伤害'], 'e')
    }, {
      title: '满层勠心拳伤害',
      params: { e: 4 },
      dmg: ({ talent }, dmg) => {
        return dmg(talent.e['技能伤害'] * 1 + talent.e['变格伤害提升'] * 4 + talent.e['正论伤害提升'] * 1, 'e')
      }
    }, {
      title: 'Q真空弹伤害',
      dmg: ({ talent }, dmg) => dmg(talent.q['不动流·真空弹伤害'], 'q')
    }]

    const defDmgIdx = 1

    const buffs = [{
      title: '平藏6命：每层「变格」提高E 4%暴击率,「正论」提高E 32%暴击伤害',
      cons: 6,
      data: {
        eCpct: ({ params }) => params.e === 4 ? 24 : 0,
        eCdmg: ({ params }) => params.e === 4 ? 32 : 0
      }
    }]
    return { details, defDmgIdx, buffs }
  },
}
