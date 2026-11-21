# 原神本地队伍伤害

本地计算使用本人所选档案的面板。命令沿用 `#队伍伤害` 和 `#队伍伤害详情`。当前内置的对接支持锁定的 54 份配队脚本，覆盖 53 套整队。模拟结果是固定时间轴与假人条件下的估算，详情页显示实际时间轴和样本种子。

从 Lotus-Yunzai 根目录安装可选运行时。

```sh
bun plugins/genshin/panel/gcsim/install.ts
```

安装需要 GitHub 网络访问和 `tar`，校验通过后才替换活动运行库。Linux x64 已验证冷装、修复和计算，约占 36 MiB。运行只读取本机依赖。安装和计算使用当前宿主，不启动额外的常驻服务。

`LOTUS_GENSHIN_GCSIM_MODE` 可设为 `auto`、`local` 或 `legacy`。默认 `auto` 在本地运行库和对应时间轴齐全时计算，查不到本地组合时沿用现有提瓦特小助手入口，发送档案投影前会在聊天中告知。设为 `local` 时只有本地计算，设为 `legacy` 时沿用旧入口。

引擎固定为 gcsim v2.50.0，使用原神 7.2 数据。队伍脚本固定为 PaiGramMetadata 的 `ab121a6`。安装保留原许可证和来源记录。版本可在 `versions.ts` 查完整 SHA 和各平台二进制摘要。

[gcsim 发布与源码](https://github.com/genshinsim/gcsim/releases/tag/v2.50.0) · [PaiGramMetadata 固定源码](https://github.com/PaiGramTeam/PaiGramMetadata/tree/ab121a60330f3c2724e54b8af62ca14836771aa2)
