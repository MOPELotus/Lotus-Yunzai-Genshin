// @ts-nocheck — Fixed upstream formula source. The module adapter validates inputs and outputs.
import { TeamBuff, LIMITED_PLUS } from '../teambuffs.ts'
import { teamDetail, withStdTeam, bounded, addHit } from '../util.ts'
import { Config } from '../../config.ts'

const mainCharName = '林尼'

const team = ['尼可', '杜林', '希诺宁']
const artifact_normal = ['天美', '宗室', '烬城']

const teamParams = {
  // external_heal 是否有治疗类队友
  pyro_two: true, pyro_count: 3, external_heal: true, Xilonen_pyro: true
}
const config = Config.getConfig('user', 'config')
const applyStandardTeam = withStdTeam(mainCharName, team, artifact_normal, config, teamParams)

const has = (params, name) => !!(params[`${name}_low`] || params[`${name}_mid`] || params[`${name}_best`])
const stacks = params => Math.floor(bounded(params.prop_stacks, 5, 0, 5))
// 天赋完场喝彩：基础60% + 每名火系队友额外+20%，上限100%
const ovation = params => Math.min(100, 60 + 20 * (Math.floor(bounded(params.pyro_count, 1, 1, 4)) - 1))

const createHitCalc = (ds, dmg) => {
  const { attr, params, calc } = ds
  const sources = ['Nicole', 'Durin', 'Xilonen'].map(name => {
    const source = LIMITED_PLUS[name]
    const limit = typeof source.limit === 'function' ? source.limit(ds) : source.limit
    return { name, plus: has(params, name) ? source.plus(ds) : 0,
      left: Math.floor(bounded(params[`${name.toLowerCase()}_hits`], limit, 0, limit)) }
  })
  const cache = new Map()
  return (pct, slot = 'a2', state = {}) => {
    const { ele = false, a1 = false } = state
    // 蒸发/融化不是火底或未挂火时不吃天赋完场喝彩
    const pyro = (state.pyro ?? params.enemy_pyro) !== false && !['vaporize', 'melt'].includes(ele)
    const ovationDelta = ((pyro ? 1 : 0) - (params.enemy_pyro !== false ? 1 : 0)) * ovation(params)
    const patch = {
      atk: { plus: attr.atk.plus },
      cdmg: { plus: attr.cdmg.plus },
      dmg: { plus: attr.dmg.plus + ovationDelta },
      phy: { plus: attr.phy.plus + ovationDelta },
      kx: attr.kx,
      [slot]: { plus: attr[slot].plus, dmg: attr[slot].dmg }
    }
    for (const source of sources) {
      if (source.name === 'Xilonen' && !['a', 'a2', 'a3'].includes(slot)) continue
      if (source.plus && source.left > 0) source.left--
      else patch[slot].plus -= source.plus
    }
    const key = JSON.stringify(patch)
    if (!cache.has(key)) cache.set(key, dmg.withAttr(patch))
    const atk = calc({ ...attr.atk, ...patch.atk })
    return cache.get(key).dynamic(pct, slot, false, ele, a1 ? atk * 0.8 : 0)
  }
}
const arrow = (ds, dmg) => createHitCalc(ds, dmg)(ds.talent.a['隐具魔术箭伤害'])
const amplifiedArrow = ele => (ds, dmg) => createHitCalc(ds, dmg)(ds.talent.a['隐具魔术箭伤害'], 'a2', { ele })
const hat = a1 => (ds, dmg) => createHitCalc(ds, dmg)(ds.talent.a['礼花术弹伤害'], 'a2', { a1 })
const burst = (ds, dmg) => {
  const hit = createHitCalc(ds, dmg)
  return addHit(hit(ds.talent.q['技能伤害'], 'q'), hit(ds.talent.q['引爆礼花伤害'], 'q'))
}

/*
 * 15秒站场
 * A2 * 3 → QE → A2 * 2
 */
const rotation = (ds, dmg) => {
  const { params, cons, talent } = ds
  const hitCalc = dmg ? createHitCalc(ds, dmg) : null
  const total = { dmg: 0, avg: 0 }
  let hp = bounded(params.hp_ratio, 100, 1, 100)
  let prop = 0
  const hit = (pct, slot, state = {}) => { if (hitCalc) addHit(total, hitCalc(pct, slot, state)) }
  const arrowHit = index => {
    hit(talent.a['隐具魔术箭伤害'], 'a2')
    // 血量>60%时扣20%血换1层隐具余数，最低扣到60%血线
    const paid = hp > 60
    if (paid) { hp = Math.max(60, hp - 20); prop++ }
    // C1首箭双帽 + 额外1层隐具余数
    const extra = cons >= 1 && index === 0
    if (extra) prop++
    prop = Math.min(5, prop)
    hit(talent.a['礼花术弹伤害'], 'a2', { a1: paid })
    if (extra) hit(talent.a['礼花术弹伤害'], 'a2', { a1: paid })
    if (cons >= 6) hit(talent.a['礼花术弹伤害'] * 0.8, 'a2')
    if (index === 0) hit(talent.a['灵息之刺伤害'], 'a2')
    // 队伍存在治疗队友时每箭后补血
    if (params.external_heal === true) hp = Math.min(100, hp + 20)
  }
  for (let i = 0; i < 3; i++) arrowHit(i)
  hit(talent.q['技能伤害'], 'q')
  hit(talent.q['引爆礼花伤害'], 'q')
  prop = Math.min(5, prop + 1)
  hit(talent.a['礼花术弹伤害'], 'a2')
  // E按释放时隐具余数层数加成本体伤害
  hit(talent.e['技能伤害'] + talent.e['技能伤害加成'] * prop, 'e')
  for (let i = 3; i < 5; i++) arrowHit(i)
  return total
}

export const details = applyStandardTeam([
  {
    title: '触发特效后攻击力',
    dmg: ({ attr, calc }) => ({ avg: calc(attr.atk) })
  }, {
    title: '物理普攻四段总伤',
    params: { c4_active: false },
    dmg: (ds, dmg) => {
      const hit = createHitCalc(ds, dmg)
      const a = ds.talent.a
      return [a['一段伤害'], a['二段伤害'], ...a['三段伤害2'], a['四段伤害']]
        .reduce((total, pct) => addHit(total, hit(pct, 'a', { ele: 'phy' })), { dmg: 0, avg: 0 })
    }
  }, {
    title: '「隐具魔术箭」伤害',
    dmg: arrow
  }, {
    title: '「隐具魔术箭」融化',
    params: { enemy_pyro: false },
    dmg: amplifiedArrow('melt')
  }, {
    title: '「礼花术弹」伤害',
    dmg: hat(true)
  }, {
    title: '「眩惑光戏法」零层伤害',
    params: { prop_stacks: 0 },
    dmg: (ds, dmg) => createHitCalc(ds, dmg)(ds.talent.e['技能伤害'], 'e')
  }, {
    title: '「眩惑光戏法」满层伤害',
    dmg: (ds, dmg) => createHitCalc(ds, dmg)(
      ds.talent.e['技能伤害'] + stacks(ds.params) * ds.talent.e['技能伤害加成'], 'e')
  }, {
    title: '「大魔术·灵迹巡游」总伤',
    dmg: burst
  }, {
    title: '6命礼花术弹·重奏',
    cons: 6,
    dmg: (ds, dmg) => ds.cons >= 6
      ? createHitCalc(ds, dmg)(ds.talent.a['礼花术弹伤害'] * 0.8)
      : { dmg: 0, avg: 0 }
  }, {
    title: '单人15秒站场总伤',
    params: { c4_active: false },
    dmg: rotation
  },
  teamDetail(mainCharName, team, artifact_normal, '重击伤害', arrow, teamParams),
  teamDetail(mainCharName, team, artifact_normal, '15秒站场总伤', rotation, { ...teamParams, c4_active: false }),
  { title: '当前圣遗物套装', dmg: ({ artis }) => ({ avg: artis, type: 'text' }) }
])

export const mainAttr = 'atk,cpct,cdmg'
export const defDmgIdx = 2
export const consDmgKey = '单人15秒站场总伤'
// enemy_pyro 是否有火元素队友，pyro_count 火元素人数（包含林尼）
// c2_stacks 2命叠层，c4_active 触发4命减抗，magic_stacks 大魔术弓层数（包含林尼）
export const defParams = {
  enemy_pyro: true, pyro_count: 2, magic_stacks: 2, c2_stacks: 3, c4_active: true
}

export const buffs = [
  ...TeamBuff,
  {
    check: ({ params }) => params.enemy_pyro !== false,
    title: ({ params }) => `天赋「完场喝彩」：${Math.floor(bounded(params.pyro_count, 1, 1, 4)) - 1}名火系队友提高[dmg]%伤害`,
    data: {
      dmg: ({ params }) => ovation(params),
      phy: ({ params }) => ovation(params)
    }
  }, {
    title: '1命「空取奇思的手艺」：猫猫帽同时存在2顶，隐具魔术箭命中时积累1层隐具余数',
    cons: 1,
  }, {
    title: ({ params }) => `2命「巧言贴耳的诱引」：${Math.floor(bounded(params.c2_stacks, 3, 0, 3))}层集意专注提高[cdmg]%暴伤`,
    cons: 2,
    data: { cdmg: ({ params }) => Math.floor(bounded(params.c2_stacks, 3, 0, 3)) * 20 }
  }, {
    check: ({ params }) => params.c4_active !== false,
    title: '4命「熟稔习练的筹谋」：火元素重击命中后降低20%火抗',
    cons: 4,
    data: {
      kx: 20
    }
  }, {
    title: '6命「违心的笑」：隐具魔术箭将发射一枚礼花术弹·重奏，造成礼花术弹80%的伤害',
    cons: 6,
  }
]
