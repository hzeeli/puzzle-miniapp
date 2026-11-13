# 云函数依赖审计

审计日期：2026-11-14。适用运行时为当前云环境的 Nodejs16.13。

## 锁定结果

两个函数采用相同依赖图，lockfileVersion均为2。

| 组件 | 版本 |
|---|---|
| wx-server-sdk | 4.0.2 |
| @cloudbase/node-sdk | 3.17.2 |
| @cloudbase/database | 1.4.3 |
| axios | 0.34.0 |
| lodash.unset | 4.18.0 |
| lodash.set | 4.3.2 |

Axios与lodash.unset通过精确作用域overrides更新；完整锁文件必须随部署上传。已使用官方Node16.13.0及其npm8.1.0，在干净目录分别执行带engine-strict的install/ci，实际安装版本符合上表。SDK加载、查询/事务接口、HTTP成功/错误/超时及unset正常路径兼容检查通过。

## 审计结果与剩余限制

两个函数均为0 critical、4 high、0 moderate。四条high来自同一个lodash.set原型污染问题，分别计入其依赖链；并非四个独立漏洞。原始结果见 [gameApi](audit/gameApi-npm-audit.json) 和 [maintenance](audit/maintenance-npm-audit.json)。不能将npm audit描述为全部通过。

当前database1.4.3的lodash.set调用位于实时监听增量合并。两个函数均不使用watch，也不接受客户端控制的数据库字段路径；保存字段来自固定业务结构。本次源码检查未发现该残留在当前处理器中的可达利用路径。这不表示上游组件已修复，也不适用于未来新增实时监听的代码。[上游公告](https://github.com/advisories/GHSA-p6mc-m468-83gw)

当前官方SDK稳定版本仍包含此依赖。database1.5.1所需bson6要求Node≥16.20.1，超出当前运行时；未绕过引擎要求强升。后续更换SDK、运行时或加入watch时需要重新审计。[BSON运行时要求](https://github.com/mongodb/js-bson/blob/v6.10.4/package.json)

已采用的修复来自 [Axios 0.34.0](https://github.com/axios/axios/releases/tag/v0.34.0) 和 [Lodash 4.18.0](https://github.com/lodash/lodash/releases/tag/4.18.0)。本地安装和兼容检查不能代替云环境实际部署与业务烟测，交付状态记录在开发计划中。
