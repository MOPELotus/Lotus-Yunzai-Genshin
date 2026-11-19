# Ark 角色排名统计

`#芙宁娜排名统计` 或 `#芙芙排名统计` 查询该角色在 Ark 的公开伤害分布，展示十个百分位和统计样本量。查询只使用角色编号、百分位参数和接口版本。伤害类型和样本由 Ark 定义。

旧版统计模板使用 `LOTUS_GENSHIN_ARK_THEME_DIR` 下的 `graph/background.png`。目录应指向有权使用的 Ark `resources/`，可以留空使用内置背景。

原版命令和接口来自 Ark 插件 `e81b5ef9111294c17b2b489aee9a94e4ebc0c9c6` 的 `apps/user.js`、`model/rankResponse.js` 和 `model/api.js`。图表参照同一提交的 `resources/graph/stats.html` 与 `resources/graph/stats.css`。Ark 的 MIT 许可证见 [LICENSE](LICENSE)。[上游提交](https://github.com/MOPELotus/ark-plugin/tree/e81b5ef9111294c17b2b489aee9a94e4ebc0c9c6)
