import {expect,test} from 'bun:test';
import {buffs} from './lolomi/rules/尼可/calc_llm.ts';
import {TeamBuff} from './lolomi/rules/teambuffs.ts';
import {nativeWeaponEffects} from './lolomi/native.ts';

test('Lolomi 0f6cf5e existing Nico C2, Xilonen signature and Scion effects',()=>{
 const nico=buffs.find((b:{cons?:number;data?:object})=>b.cons===2)!;
 expect(nico.data).toMatchObject({atkPlus:300,kx:25});
 const xilonen=TeamBuff.find((b:{check?:unknown})=>String(b.check).includes('params.Xilonen_low'))!;
 expect(xilonen).toBeDefined();
 for(const [element,params,value] of [['火',{Xilonen_best:true},51.2],['冰',{Xilonen_mid:true},25.6],['岩',{Xilonen_best:true},101.2],['岩',{Xilonen_mid:true},75.6],['岩',{Xilonen_low:true},0]] as const){
  expect((xilonen.data.dmg as (ctx:{element:string;params:object})=>number)({element,params})).toBe(value);
 }
 const scion=nativeWeaponEffects('烈阳之嗣',{},1) as {data:Record<string,unknown>}[];
 expect(scion.length).toBeGreaterThan(0);
 expect(scion.some(x=>typeof x.data.a2Dmg==='function' && x.data.a2Dmg({refine:0})===28)).toBe(true);
 expect(scion.some(x=>'dmg' in x.data)).toBe(false);
});

import {estimatePanelDamage} from './damage.ts';
import {readNativeRule} from './lolomi/native.ts';
import type {PanelAvatar} from './model.ts';
import type {PanelTheme} from './theme.ts';
const theme: PanelTheme={characters:{},artifacts:new Map(),artifactSets:new Map(),async picture(){}};
for(const [id,name,elem] of [[10000084,'林尼','pyro'],[10000105,'欧洛伦','electro'],[10000149,'安娜丝塔夏','cryo'],[10000147,'达妮卡','electro']] as const){
 test(`Lolomi 1.4.5 ${name} native rules calculate single and team rotations`,async()=>{
  const avatar:PanelAvatar={id,name,elem,level:90,promote:6,cons:6,_source:'enka',talent:{a:10,e:10,q:10},weapon:{name:name==='达妮卡'?'西风大剑':'最初的大魔术',level:90,promote:6,affix:1},artis:{1:{name:'宗室之花',set:'昔日宗室之仪',mainId:10001,star:5,level:20,attrIds:['501201','501223','501024','501022']}}};
  expect(await readNativeRule(name)).toBeDefined();
  const result=await estimatePanelDamage(avatar,theme,undefined,103,{includeComparison:false});
  if(!('rows' in result))throw Error(result.message);
  expect(result.ruleAuthors).toEqual(['洛洛米']);
  const rotations=result.rows.filter(row=>row.title.includes('总伤'));
  expect(rotations.length).toBeGreaterThanOrEqual(2);
  for(const row of rotations)expect(typeof row.average==='number'&&Number.isFinite(row.average)&&row.average>0).toBe(true);
 });
}
test('Great Magic weapon retains dynamic title and same-element stack scaling',()=>{
 const rows=nativeWeaponEffects('最初的大魔术',{},1) as {title:unknown;data:Record<string,unknown>}[];
 const effect=rows.find(row=>typeof row.title==='function')!;
 expect(effect).toBeDefined();
 const run=effect.data.atkPct as (ctx:{params:object;refine:number})=>number;
 expect(run({params:{magic_stacks:1},refine:0})).toBe(16);
 expect(run({params:{magic_stacks:3},refine:4})).toBe(96);
 expect((effect.title as (ctx:object)=>string)({params:{magic_stacks:2}})).toContain('最初的大魔术：2名');
});

import DmgCalc from './lolomi/engine/DmgCalc.ts';

test('lunar contribution parameters scale reactions without mutating the original damage function', () => {
 const pair={base:0,plus:0};
 const attr={atk:2000,mastery:180,dmg:pair,phy:pair,coloringDmg:pair,cpct:{base:50,plus:0},cdmg:{base:100,plus:0},enemydmg:pair,
  multi:100,fyplus:0,fypct:0,fybase:0,fyinc:0,elevated:0,enemy:{def:0,ignore:0},kx:0,element:'雷',lunarCharged:0,lunarCrystallize:0,lunarBloom:0};
 const calc=(value:unknown)=>typeof value==='number'?value:0;
 const params={retained:true};
 type LunarDamage = { (ratio?:number,talent?:string|false,element?:string|false):{avg:number;dmg:number}; reaction(element:string):{avg:number;dmg:number}; withParams(params:Record<string,unknown>):LunarDamage };
 const fn=DmgCalc.getDmgFn({attr,ds:{attr,params,calc},params,level:90,enemyLv:103,game:'gs'}) as unknown as LunarDamage;
 for(const reaction of ['lunarCharged','lunarCrystallize']){
  const baseline=fn.reaction(reaction);
  expect(Number.isFinite(baseline.avg)&&baseline.avg>0).toBe(true);
  for(const share of [1,.5,1/12,0]){
   const result=fn.withParams({lunarShare:share}).reaction(reaction);
   expect(result.avg).toBeCloseTo(baseline.avg*share,8);
   expect(result.dmg).toBeCloseTo(baseline.dmg*share,8);
  }
  expect(fn.reaction(reaction)).toEqual(baseline);
  expect(fn.withParams({lunarShare:NaN}).reaction(reaction)).toEqual(baseline);
  expect(fn.withParams({lunarShare:.5}).withParams({lunarShare:1/12}).reaction(reaction).avg).toBeCloseTo(baseline.avg/12,8);
 }
 expect(params).toEqual({retained:true});
 const direct=fn(100,'','lunarCharged');
 expect(fn.withParams({lunarShare:.5})(100,'','lunarCharged')).toEqual(direct);
 const bloom=fn.reaction('lunarBloom');
 expect(fn.withParams({lunarShare:.5}).reaction('lunarBloom')).toEqual(bloom);
});

test('Ororon moon-reaction rotations remain available through Miao fallback', async () => {
 const {spyOn}=await import('bun:test');
 const {nativeCalc}=await import('./lolomi/native.ts');
 const spy=spyOn(nativeCalc,'getDmgFn').mockImplementation(()=>{throw Error('fixture native unavailable')});
 try{
  const avatar:PanelAvatar={id:10000105,name:'欧洛伦',elem:'electro',level:90,promote:6,cons:6,_source:'enka',talent:{a:10,e:10,q:10},weapon:{name:'最初的大魔术',level:90,promote:6,affix:1},artis:{1:{name:'宗室之花',set:'昔日宗室之仪',mainId:10001,star:5,level:20,attrIds:['501201','501223','501024','501022']}}};
  const result=await estimatePanelDamage(avatar,theme,undefined,103,{includeComparison:false});
  if(!('rows'in result))throw Error(result.message);
  const rotations=result.rows.filter(row=>row.title.includes('总伤'));
  expect(rotations.length).toBeGreaterThanOrEqual(2);
  expect(rotations.every(row=>typeof row.average==='number'&&Number.isFinite(row.average)&&row.average>0)).toBe(true);
 }finally{spy.mockRestore()}
});
