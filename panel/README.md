# 原神角色面板

- `#更新面板`、`#更新全部面板`、`#米游社面板更新` 从绑定的国服角色更新面板并显示角色列表。
- `#面板`、`#角色面板`、`#面板列表` 读取本地面板。
- `#芙宁娜面板`、`#芙芙面板`、`#芙宁娜圣遗物` 和 `#芙宁娜武器` 查看角色、装备和属性。常见旧角色别名仍可使用。
- 命令末尾加档案号可选择档案，例如 `#更新面板2` 和 `#芙宁娜面板2`。沿用长 UID 的用法时，UID 需要与当前档案绑定的原神角色一致。

新版面板写入 `data/genshin/panels/<QQ>/<UID>.json`，可用 `LOTUS_GENSHIN_PANEL_DIR` 指定目录。旧版喵喵 `data/PlayerData/gs/<UID>.json` 可直接读取，通过 `LOTUS_GENSHIN_LEGACY_PANEL_DIR` 指定已有档案目录。首次更新后，旧面板中仍可使用的角色会一同保留，源档案保持原样。旧文件若缺少角色最终属性，属性栏显示横线。伤害计算和群排行由另外的功能处理。

用 `LOTUS_GENSHIN_PANEL_THEME_DIR` 指向有权使用的喵喵 `resources/` 目录。默认沿用已配置的原神 Miao 主题，读取原背景、角色、武器和圣遗物图。模板以 Skia 绘制，未配置的图像会保留对应的文本。

## 圣遗物评分

`#芙宁娜圣遗物` 展示旧喵喵评分规则、分件得分、总分和评级。角色流派沿用固定版本规则，包括依赖命座、武器、套装和最终属性的分支。旧档已有的完整主副词条可直接评分。评分所需字段缺失时会指出原因并继续展示已有词条，更新面板后可重试。

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
