// @ts-nocheck — Fixed upstream formula source. The module adapter validates inputs and outputs.
import { TeamBuff } from '../teambuffs.ts'
import { teamConfig, withStdTeam } from '../util.ts'
import { Config } from '../../config.ts'

const mainCharName = '欧洛伦'

const team = ['菲林斯', '伊涅芙', '哥伦比娅']
const artifact_normal = ['烬城']

const config = Config.getConfig('user', 'config')
const applyStandardTeam = withStdTeam(mainCharName, team, artifact_normal, config, { Moonsign: 2 })

// 一轮后台总伤
// EQ 切后台：E宿灵球，1命额外弹跳2次，Q超音灵眼4命以下默认9hit，4命及以上默认12hit
// 显象超感1.8秒ICD，默认8次，hypersense_times
// 月感电2秒ICD，15秒窗口默认7次，lunar_times
const rotationDmg = (ds, dmg, lunar = false) => {
  const { talent, cons, attr, calc, params = {} } = ds
  const eDmg = dmg(talent.e['宿灵球伤害'], 'e,nightsoul')
  const eHits = cons >= 1 ? 3 : 1
  const qDmg = dmg(talent.q['秘仪伤害'], 'q,nightsoul')
  const sonic = dmg(talent.q['音波碰撞伤害'], 'q,nightsoul')
  const sonicHits = cons >= 4 ? 12 : 9
  const hsFn = cons >= 1 ? dmg.withAttr({ dmg: { plus: (attr.dmg?.plus ?? 0) + 50 } }) : dmg
  const hs = hsFn.basic(calc(attr.atk) * 160 / 100, 'nightsoul')
  const hsTimes = params.hypersense_times ?? 8
  const c6Hs = cons >= 6 ? hsFn.basic(calc(attr.atk) * 320 / 100, 'nightsoul') : { dmg: 0, avg: 0 }
  // 队伍伤害欧洛伦基本占末尾，月感电贡献 lunarShare = 0.0833，，单人木桩默认全额
  const luna = lunar ? dmg.withParams({ lunarShare: params.lunarShare ?? 0.0833 }).reaction('lunarCharged') : { dmg: 0, avg: 0 }
  const lunaHits = lunar ? (params.lunar_times ?? 7) : 0
  return {
    dmg: eDmg.dmg * eHits + qDmg.dmg + sonic.dmg * sonicHits + hs.dmg * hsTimes + c6Hs.dmg + luna.dmg * lunaHits,
    avg: eDmg.avg * eHits + qDmg.avg + sonic.avg * sonicHits + hs.avg * hsTimes + c6Hs.avg + luna.avg * lunaHits
  }
}

export const details = applyStandardTeam([
  {
    title: '「暝色缒索」宿灵球伤害',
    dmg: ({ talent }, dmg) => dmg(talent.e['宿灵球伤害'], 'e,nightsoul')
  }, {
    title: '「黯声回响」秘仪伤害',
    dmg: ({ talent }, dmg) => dmg(talent.q['秘仪伤害'], 'q,nightsoul')
  }, {
    title: '「超音灵眼」音波碰撞伤害',
    dmg: ({ talent }, dmg) => dmg(talent.q['音波碰撞伤害'], 'q,nightsoul')
  }, {
    title: '天赋「显象超感」伤害',
    params: { Hypersense: true },
    dmg: ({ attr, calc }, { basic }) => basic(calc(attr.atk) * 160 / 100, 'nightsoul')
  }, {
    title: '感电反应伤害',
    dmg: ({}, { reaction }) => reaction('electroCharged')
  }, {
    title: '月感电反应伤害',
    params: { Moonsign: 2 },
    dmg: ({}, { reaction }) => reaction('lunarCharged')
  }, {
    title: '伪单人月感电站场总伤',
    params: { Moonsign: 2, lunarShare: 1 },
    dmg: (ds, dmg) => rotationDmg(ds, dmg, true)
  }, {
    title: ({ cons }) => `${teamConfig(cons, team, artifact_normal, mainCharName).title} 月感电后台总伤`,
    params: ({ cons }) => ({
      ...teamConfig(cons, team, artifact_normal).params,
      Moonsign: 2
    }),
    dmg: (ds, dmg) => rotationDmg(ds, dmg, true)
  }, {
    title: '当前圣遗物套装',
    dmg: ({ artis }) => ({ avg: artis, type: 'text' })
  }
])

export const defDmgIdx = 5
export const consDmgKey = '伪单人月感电站场总伤'
export const defParams = { Nightsoul: true }
export const mainAttr = 'atk,cpct,cdmg,mastery'

export const buffs = [
  ...TeamBuff,
  {
    title: '天赋「夜翳的通感」：触发「显象超感」时基于攻击力的160%，造成夜魂性质的雷元素伤害',
  }, {
    check: ({ params }) => params.Hypersense,
    title: '1命「林雾间的行迹」：宿灵球命中施加「夜暝」，显象超感伤害提升[dmg]%',
    cons: 1,
    data: {
      dmg: 50
    }
  }, {
    title: '2命「藏蜜酒的王蜂」：施放元素爆发后雷元素伤害加成至多[dmg]%',
    cons: 2,
    data: {
      dmg: 40
    }
  }, {
    title: '4命「如夜风的谜烟」：超音灵眼旋转速度提升25%，施放元素爆发后恢复8点元素能量',
    cons: 4
  }, {
    title: '6命「致深泉的颂赞」：显象超感触发后场上角色攻击力至多提升30%，额外触发一次原本200%伤害的显象超感',
    cons: 6
  }
]
