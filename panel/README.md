# 原神角色面板

- `#更新面板`、`#更新全部面板`、`#米游社面板更新` 从绑定的国服角色更新面板并显示角色列表。
- `#面板`、`#角色面板`、`#面板列表` 读取本地面板。
- `#芙宁娜面板`、`#芙芙面板`、`#芙宁娜圣遗物` 和 `#芙宁娜武器` 查看角色、装备和属性。常见旧角色别名仍可使用。
- 命令末尾加档案号可选择档案，例如 `#更新面板2` 和 `#芙宁娜面板2`。沿用长 UID 的用法时，UID 需要与当前档案绑定的原神角色一致。

新版面板写入 `data/genshin/panels/<QQ>/<UID>.json`，可用 `LOTUS_GENSHIN_PANEL_DIR` 指定目录。旧版喵喵 `data/PlayerData/gs/<UID>.json` 可直接读取，通过 `LOTUS_GENSHIN_LEGACY_PANEL_DIR` 指定已有档案目录。首次更新后，旧面板中仍可使用的角色会一同保留，源档案保持原样。旧文件若缺少角色最终属性，属性栏显示横线。群排行由另外的功能处理。

用 `LOTUS_GENSHIN_PANEL_THEME_DIR` 指向有权使用的喵喵 `resources/` 目录。默认沿用已配置的原神 Miao 主题，读取原背景、角色、武器和圣遗物图。模板以 Skia 绘制，未配置的图像会保留对应的文本。

## 练度统计

`#原神练度统计`、`#面板练度统计` 或 `#练度统计` 汇总当前档案的本地角色练度，展示等级、命座、好感、三项天赋、武器等级和精炼、圣遗物套装和已核对的评分。例 `#练度统计2` 可选档案。列表沿用旧版等级、星级、基础天赋总和、命座、武器和好感的排序，每 48 名角色分页。旧米游社简档可显示查得到的条目，缺项显示横线或「暂无评分」。当前实现从 `#更新面板` 获取新数据，查看统计无需即时访问米游社。资源使用旧模板的原神底图、头图、好感、天赋皇冠和装备图。

## 圣遗物评分

`#芙宁娜圣遗物` 展示旧喵喵评分规则、分件得分、总分和评级。角色流派沿用固定版本规则，包括依赖命座、武器、套装和最终属性的分支。旧档已有的完整主副词条可直接评分。评分所需字段缺失时会指出原因并继续展示已有词条，更新面板后可重试。

`#圣遗物列表` 汇总绑定档案中可评分的圣遗物，按旧版筛选规则排序并展示前 28 件。末尾加档案号可切换档案，例如 `#圣遗物列表2`。若旧档缺少评分流派需要的角色属性，目录中的完整旧数值表可用于复算。资料不足的角色暂不进入列表。

## 伤害估算

`#胡桃伤害` 使用绑定角色的面板，列出旧喵喵预设情景、期望和暴击数值。`#胡桃伤害2` 选择第二种情景查看词条替换对照及生效条件。末尾用 `档案2` 切换账号档案，例如 `#胡桃伤害2 档案2`。默认目标为 103 级小宝及 10% 基础抗性，实际游戏中的队伍、抗性和触发条件会影响结果。

`#敌人等级90` 或 `#怪物等级90` 可按 QQ 设置 0 至 999 级的计算目标，同一 QQ 的原神档案共享偏好。用 `#敌人等级90 档案2` 可从已绑定的其他档案进行设置。设置保存在面板目录的 `preferences/<QQ>/1.json`。如需继承旧设置，可将 `LOTUS_GENSHIN_PANEL_LEGACY_REDIS_URL` 指向隔离 Redis 或 Valkey 副本，为两个旧键前缀授予 `GETRANGE` 读取权限。本地偏好优先，未设置时依次读取旧 `miao:user-cfg:<QQ>` 或 `genshin:user-cfg:<QQ>` 的 `char.enemyLv`。

普通详情图在装备下沿用旧版伤害表，列出暴击、期望与治疗等单值结果，目标与同档案的独立伤害命令一致。部分情景缺少数值时标为「数据不全」。没有可计算的情景时仍可查看原面板资料。

## 群面板榜

`#芙宁娜排行` 和 `#芙宁娜圣遗物评分排行` 查询本群当前成员的角色榜。伤害使用原规则默认情景的期望值，目标固定 103 级。圣遗物按角色总分排序，最多展示 15 项，分数相同沿用旧榜的 UID 逆序。

`#芙宁娜双暴排行`（兼容「双爆」）按暴击、暴伤副词条加权，并计入双暴头部的主词条。`#芙宁娜词条排行` 按角色评分规则对全部副词条加权。两榜沿用 MIT 旧提交 `edae19cf` 中的 `getCritMark` 和 `getValidMark`，使用面板已核对的词条和当前评分权重，按原精度排序。先前只有伤害和圣遗物总分的摘要可在本群重新查看本人详情，登记这两项附加数据。

功能默认关闭。设置 `LOTUS_GENSHIN_PANEL_RANK_GROUPS=群号1,群号2` 后，已登录且当前档案已绑定角色的成员，在获准群聊主动发送 `#芙宁娜面板` 或 `#芙宁娜详情` 可登记本人记录。每个机器人和群单独存放卡片所需的摘要，默认目录为 `data/genshin/panel-ranks/`，可通过 `LOTUS_GENSHIN_PANEL_RANK_DIR` 指定。发榜前重新核验当前群成员和当前绑定关系。旧全局 Redis 榜可用于迁移核对，群榜入口从上文的主动登记开始收集。

计算沿用内置的固定版本喵喵角色、武器及圣遗物规则。角色与武器的等级属性和天赋倍率取自已配置的 Miao 主题目录。命令只读取本地面板和数值资料。旧表或面板缺项时提示缺失。部分情景资料不足时仍显示其他可计算的情景。

## 来源

使用喵喵插件 `2860761836069af80bacee5cb85b6dd2e91ea0b0` 的列表和详情命令、玩家档案字段与模板布局。移植文件在 `miao/` 保留 MIT 许可。[上游提交](https://github.com/MOPELotus/miao-plugin/tree/2860761836069af80bacee5cb85b6dd2e91ea0b0)

| 上游路径 | 使用内容 |
| --- | --- |
| `apps/profile/ProfileList.js`、`apps/profile.js` | 面板更新和查询命令、排序及新角色标记 |
| `models/Player.js`、`models/Avatar.js` | 玩家和角色档案格式 |
| `models/serv/api/MysPanelData.js`、`models/serv/api/MysPanelMappings.js` | 米游社面板属性、天赋和圣遗物映射 |
| `models/artis/ArtisAttr.js`、`resources/meta-gs/artifact/extra.js` | 旧档案主属性和副词条数据 |
| `resources/meta-gs/character/alias.js` | 原神角色别名 |
| `resources/character/profile-list.html`、`resources/character/profile-list.css`、`resources/character/profile-detail.html`、`resources/character/profile-detail.css` | 列表与详情的布局、头像、装备和属性位置 |
| `models/artis/ArtisMark.js`、`models/artis/ArtisMarkCfg.js`、`resources/meta-gs/artifact/artis-mark.js` | 原神评分公式、档位、主副词条权重和角色默认规则 |
| `resources/meta-gs/character/*/artis.js`、`resources/meta-gs/character/*/data.json`、`resources/meta-gs/weapon/*/*/data.json` | 77 个原版角色专属规则、角色基础属性和武器副属性类别 |
| `resources/character/artis-mark.html`、`resources/character/artis-mark.css` | 圣遗物评分卡布局、评级、词条和计算详情 |
| `models/ProfileDmg.js`、`models/dmg/*.js`、`models/attr/Attr.js`、`models/Weapon.js` | 原神面板基础属性、旧情景与词条替换计算 |
| `resources/meta-gs/character/**/calc.js`、`resources/meta-gs/weapon/*/calc.js`、`resources/meta-gs/artifact/calc.js` | 原版人物、武器和套装伤害规则 |
| `resources/character/profile-detail.html`、`resources/character/profile-detail.css` | 伤害清单、词条对照和触发条件布局 |
| `apps/profile/ProfileArtis.js`、`resources/character/artis-list.html`、`resources/character/artis-list.css` | 旧圣遗物列表入口、过滤、28 件上限和四列卡片 |
| `apps/profile/ProfileStat.js`、`models/Player.js`、`models/character/CharTalent.js`、`resources/character/profile-stat.html`、`resources/character/profile-stat.css` | 旧练度统计入口、排行顺序、原始与实显天赋、原神十列表格 |
