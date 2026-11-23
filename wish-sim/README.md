# 原神模拟祈愿

- `#单抽`、`#十连`、`#二十连` 至 `#百连`、`#抽卡` 可模拟角色活动祈愿。第二个活动祈愿使用 `#单抽2` 或 `#十连2`。武器和常驻分别使用 `#武器十连`、`#常驻十连`，池名也可放在抽数后。
- `#定轨` 循环选择武器。`#定轨1`、`#定轨2` 及 `#定轨武器全名` 直接选择，`#定轨查询` 查看当前目标，`#定轨取消` 清除。
- `#我的纠缠之缘` 或 `#查看蓝球` 查看当天球数。角色和武器消耗纠缠之缘，常驻消耗相遇之缘。每日北京时间 04:00 刷新，同 QQ 的群聊和私聊共用球数，保底按会话和卡池保存。两个角色活动祈愿共用保底，武器池轮换时重置定轨和命定值。默认每天发放 100 个纠缠之缘与 10 个相遇之缘。

服务器将模拟数据存放在 `data/genshin/wish-sim/`，与官方抽卡档案分开。本地存档支持通过 `LOTUS_GENSHIN_WISH_STATE_DIR` 指定路径。旧 Flower 的 Redis 保底与额度可按下方步骤迁移。

| 环境变量 | 用途 |
| --- | --- |
| `LOTUS_GENSHIN_WISH_POOL_FILE` | 按 Flower 的 `def/pool.yaml` 指定模拟用卡池，优先于旧目录和 Miao 数据。 |
| `LOTUS_GENSHIN_WISH_LEGACY_DIR` | 指向旧模拟祈愿的 `GachaMOD/Genshin/`。可复用旧卡池、常驻名单、球数配置和结果资源。 |
| `LOTUS_GENSHIN_WISH_COIN_FILE` | 按 Flower 的 `def/coin.yaml` 设置默认及分群发放的球数。 |
| `LOTUS_GENSHIN_WISH_THEME_DIR` | 指向有权使用的旧 Flower `GachaMOD/Genshin/resources/`，读取结果背景、祈愿图框与道具图。留空时优先从旧 Flower 目录读取，资源缺失时使用内置绘制。 |
| `LOTUS_GENSHIN_WISH_ELEMENTS_DIR` | 指向已有的原 genshin `defSet/element/`，为使用 Flower 图包的卡片匹配角色元素或武器类别图标。 |

概率曲线与每周首个五星后的加成沿用 Flower。单抽和多抽使用同一套规则，角色和常驻最多 90 抽、武器最多 80 抽出五星，武器定轨使用 1 点命定值。程序与配置许可见 [来源记录](flower/SOURCES.md)。


## 沿用旧卡池文件

设置 `LOTUS_GENSHIN_WISH_LEGACY_DIR` 后，每次查询都会重新读取卡池，优先使用 `data/<QQ>/pool.yaml`。没有个人卡池时，`config/gacha.yaml` 的 `sync: false` 选用 `config/pool.yaml`，开启同步时选用 `def/pool.yaml`。未设旧目录或独立卡池时，从原神主题目录读取当期有效数据，缺少有效期次时使用随附卡池。已经结束的卡池在结果图标注「历史卡池」。已有的 `LOTUS_GENSHIN_WISH_FLOWER_DIR` 仍可读取，新键优先。

## 导入旧 Flower 模拟数据

从旧 Redis 或 Valkey 准备隔离副本，保留旧键的剩余 TTL。在 Lotus-Yunzai 根目录运行，`LOTUS_GENSHIN_WISH_LEGACY_REDIS_URL` 指定旧副本和数据库编号。可使用只有 `GET`、`PTTL` 权限的账号，另授予选择数据库和建立连接所需的权限。

授权文件是 JSON 数组。每个 QQ 导入个人球数与私聊保底，额外列出的群导入对应保底。一次列齐需要保留的群。

```json
[
  { "qq": "123456789", "groups": ["876543210"] },
  { "qq": "234567890" }
]
```

```sh
bun plugins/genshin/wish-sim/import-legacy-cli.ts 授权.json data/genshin/wish-sim
bun plugins/genshin/wish-sim/import-legacy-cli.ts --apply 授权.json data/genshin/wish-sim
```

第一条预检并统计将导入的球数和会话。第二条逐 QQ 保存，留存已有的当日球数和保底。每个 QQ 的数据和完成记录一起提交，重复运行会跳过已完成的 QQ。旧来源保持只读。当天已过期的球数按新版发放规则处理，旧保底保留原 TTL。

若要保留武器定轨，在预检和导入时将 `LOTUS_GENSHIN_WISH_LEGACY_DIR` 指向旧副本对应的模拟祈愿模块目录。以旧卡池核对武器档位，武器换期后保底仍然有效，定轨和命定值按新版换期规则重置。

## 转生

- `#转生`、`#原神转生` 随机抽取角色身份，显示名字、神之眼、称号和身份。QQ 的冷却在群聊和私聊间共用，重启后仍生效，机器人主人可在冷却中使用。转生不会发放或扣除模拟球数。
- 默认冷却 120 分钟，可在管理面板「业务设置 → 原神模拟祈愿」设置为 1–1440 分钟。新值从下一次转生起生效。迁移时继承旧配置中的有效 `relifeCD`。设置 `LOTUS_GENSHIN_WISH_LEGACY_DIR` 后，也可沿用该目录中的角色身份与元素配色。
- 角色底图和立绘沿用已有原神面板主题，可通过 `LOTUS_GENSHIN_PANEL_THEME_DIR` 指定。字体读取授权旧 Flower 根目录的 `resources/font` 或面板主题的 `common/font`；缺资源时仍能显示角色信息。
