# Flower 模拟祈愿来源

基线为 Nwflower 的 Flower 插件提交 `32139ee8b48c9bbea85f2ce48dd36007811b35c2`。移植的代码与随附配置沿用木兰宽松许可证第 2 版，本目录保留原始许可证。[Flower 上游仓库](https://gitee.com/Nwflower/flower-plugin/tree/32139ee8b48c9bbea85f2ce48dd36007811b35c2)

| 上游文件均位于 `GachaMOD/Genshin/` | 使用范围 |
| --- | --- |
| `model/gachaData.js`、`model/pool.js`、`apps/singlegacha.js` | 抽选、保底、星级排序、UP 和非 UP 物品分组 |
| `model/coin.js`、`apps/coin.js`、`apps/torrent.js` | 每日球数、命令兼容、分批结果、武器定轨 |
| `def/gacha.yaml`、`def/pool.yaml`、`def/coin.yaml` | Flower 的默认配置与历史卡池 |
| `resources/html/gacha/gacha.html`、`resources/html/gacha/gacha.css` | 十连结果的横排祈愿框、裁切路径、位置与素材图层 |
| `resources/html/single/single.html`、`resources/html/single/single.css` | 单抽结果的背景、道具与信息布局 |

祈愿图引用已有部署有权使用的原图和字体。二进制画面资源不随本仓分发。配置元素图标时，运行时可读取旧 genshin 的 `defSet/element/` 映射。
