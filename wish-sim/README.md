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

## 祈愿开关与概率

管理面板「业务设置 → 原神模拟祈愿」可以启停模拟与多连，并设置角色、武器各自的四星、五星基础概率。机器人主人也可用 `#抽卡设置` 查询，通过同一入口加 `自定义开启/关闭`、`百连开启/关闭`、`五星角色概率`、`四星角色概率`、`五星武器概率`、`四星武器概率` 或 `小保底概率` 写入。基础概率用万分比，小保底用百分比。清空面板的小保底字段使用角色 50%、武器 75%；旧 `#抽卡设置概率复位` 将四项基础概率复原，两个池的小保底都设为旧版的 50%。

关闭模拟或多连会先检查开关，再扣除球数。已保存的票数、保底和定轨继续保留。

## 公共手工卡池

在「业务设置 → 原神模拟祈愿」配置五星、四星角色和武器名单。主人也可发送 `#抽卡设置卡池同步开启` 或 `#抽卡设置卡池同步关闭`，以及 `#抽卡设置五星角色...`、`#抽卡设置四星角色...`、`#抽卡设置五星武器...`、`#抽卡设置四星武器...`。聊天用逗号分隔，面板每行一项。五星角色填一名时两个角色池共用，五星武器填两件不同武器。

`#抽卡设置随机卡池` 从本机可确认的角色和武器中生成名单。关闭自动轮换后，手工名单用于公共模拟卡池，未填写的类别继续使用当前默认名单。开启自动轮换会保留已存手工名单。显式文件和已配置的旧个人专池沿用原优先级。

## 按会话限制每日抽数

「业务设置 → 原神模拟祈愿」的每日抽数限制按 QQ 和会话分别计算，北京时间 04:00 刷新。可以填写 `{"default":{"count":2,"separate":false},"123456789":null}`。默认、私聊和群分别用 `default`、`private`、群号设定，`null` 取消该会话继承。每个 `count` 单位等于 10 抽，`separate: true` 时武器池和其余卡池分开。每批开始前检查已抽数，余额先于次数检查。机器人主人豁免次数限制。

迁移继承可靠的旧 TRSS 次数覆盖。同一范围的 Flower 票数特设优先，现有新版配置原样保留。

## 转生

- `#转生`、`#原神转生` 随机抽取角色身份，显示名字、神之眼、称号和身份。QQ 的冷却在群聊和私聊间共用，重启后仍生效，机器人主人可在冷却中使用。转生不会发放或扣除模拟球数。
- 默认冷却 120 分钟，可在管理面板「业务设置 → 原神模拟祈愿」设置为 1–1440 分钟。新值从下一次转生起生效。迁移时继承旧配置中的有效 `relifeCD`。设置 `LOTUS_GENSHIN_WISH_LEGACY_DIR` 后，也可沿用该目录中的角色身份与元素配色。
- 角色底图和立绘沿用已有原神面板主题，可通过 `LOTUS_GENSHIN_PANEL_THEME_DIR` 指定。字体读取授权旧 Flower 根目录的 `resources/font` 或面板主题的 `common/font`；缺资源时仍能显示角色信息。

## 续接旧 TRSS 当日限抽

旧 Genshin `0290a17` 的同日次数可由已经停写的 Valkey 副本续接。先在目标安装中迁入或启用会话的每日抽数限制，停止目标模拟祈愿写入，再准备保留绝对到期时间的隔离副本。副本用 `127.0.0.1` 上的独立非默认端口和带密码的具名账号，仅授权所列旧键的 `GET`、`PEXPIRETIME` 及选择数据库和建立连接所需的权限。旧键格式为 `Yz:genshin:gacha:<群号或private>:<QQ>`。

授权 JSON 的 `source` 为 `trss-genshin-0290a17`，`timeZone` 为 `Asia/Shanghai`，`capturedAt` 填副本停写采样时的 Unix 毫秒时间戳，`accounts` 明确列出各 QQ 的会话。只有写入 `private` 才读取该 QQ 的私聊。

```json
{
  "source": "trss-genshin-0290a17",
  "timeZone": "Asia/Shanghai",
  "capturedAt": 1795485600000,
  "accounts": [{ "qq": "123456789", "conversations": ["876543210", "private"] }]
}
```

在目标 Lotus-Yunzai 安装中以 `LOTUS_GENSHIN_TRSS_WISH_SNAPSHOT_URL` 指定隔离副本和数据库编号。首次迁移时可把授权 JSON 一同交给宿主。在北京时间 04:00 日界之前完成预检和迁移。

```sh
bun run migrate:plan /旧安装副本 --trss-wish-authorization /授权.json
bun run migrate /旧安装副本 --trss-wish-authorization /授权.json
```

预检只报告聚合数量，不创建目标档案。正式迁移将限抽随配置和其他数据一起发布。授权会话读不到时，检查副本及权限后重新运行迁移。用于检查暂存内容的 `migrate:stage` 也接受同一个参数。首次暂存完成后，宿主重试发布可复用该批数据，也可以关闭隔离副本。未提供授权参数时按普通流程迁移。

已经手工安装的目标仍可单独运行下列命令。完成其他旧 Flower 导入后再续接 TRSS。

```sh
bun plugins/genshin/wish-sim/import-legacy-cli.ts --trss-daily 授权.json data/genshin/wish-sim
bun plugins/genshin/wish-sim/import-legacy-cli.ts --trss-daily --apply 授权.json data/genshin/wish-sim
```

只有启用限抽的会话才读取。续接从旧绝对到期时间反推最后写入时间，并核对当天和旧业务到期秒。旧代码在 00:00–00:59 会把业务到期延长一天，04:00 首秒也可能把昨日累计带入，这两个时段保存的快照会跳过。若旧端随后再次保存并重写了合法到期时间，单份快照只能看到旧端当时实际累计的次数。

新版或已导入的 Flower 当日抽数优先。同日重复导入保留已保存的续接，不同计数会报告冲突。续接次数只参与对应会话的限抽，下个北京时间 04:00 失效。模拟票数、保底、周统计和普通当日抽卡摘要依旧由各自的档案提供。
