# 云开发部署与接口

## 环境与构建

小游戏 AppID：`wxc2add44d840ca728`。

配置环境：名称 `cloud1`，环境 ID `cloud1-d7gu7tyfpdb64e613`。部署前使用当前登录账号查询该环境并确认关联的 AppID。环境 ID 不是密钥。客户端通过 `wx.cloud.init({ env: 'cloud1-d7gu7tyfpdb64e613' })` 统一初始化；云函数使用 `cloud.DYNAMIC_CURRENT_ENV`。

`gameApi` 使用 `wx-server-sdk` **4.0.2**（npm 官方注册表核实并锁定）。小游戏与云函数共用仓库根目录的 `shared/`。构建将当前规则与 v3、v4 两册固定关卡复制进 `cloudfunctions/gameApi/shared/`。所有规则和关卡变更均在源目录进行。

### 部署顺序

1. 在项目根目录运行下列命令。目录比较应无差异，云函数包须包含 `shared/journey.js`、`shared/story-replay.js`、模板和固定关卡数据、共享规则与资料策略。

   ```sh
   npm run check:levels
   npm test
   npm run build
   diff -qr shared cloudfunctions/gameApi/shared
   ```

2. 先将本次构建的 `gameApi` 部署至对应云环境，保留三集合中的现有数据、索引、权限与维护定时器。现有 v3/v4 客户端保留原接口，新主线使用下面三项动作。
3. 在微信模拟器调用 `storyBootstrap`、`submitStoryClear` 和 `storyLeaderboard`，核对同一微信账号提交、重复提交、读回名次。使用现有 v3/v4 入口作兼容性复验。

开发者工具应开启 CLI / HTTP 服务端口。以下 `cli` 代表 macOS 上 `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`：

```sh
cli cloud env list --appid wxc2add44d840ca728
cli cloud functions list --env cloud1-d7gu7tyfpdb64e613 --project PROJECT_PATH
cli cloud functions deploy --env cloud1-d7gu7tyfpdb64e613 --names gameApi --remote-npm-install --project PROJECT_PATH
```

部署使用云端安装依赖。本地构建、规则重放和模拟器离线测试的结果应与部署后的云端实测分别记录。[微信 CLI 文档](https://developers.weixin.qq.com/miniprogram/dev/devtools/cli.html)

## 数据库初始化与权限

建立文档集合 `players`、`runs`、`bestScores`。**三个集合的客户端读写全部拒绝**：

```json
{"read": false, "write": false}
```

所有读写通过 `gameApi`。云函数是管理端，数据库安全规则不能代替云函数中的身份和所有权校验。[微信数据库权限](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/database/permission.html)

需要的索引：

| 集合 | 名称建议 | 字段顺序 | 用途 |
|---|---|---|---|
| `runs` | `owner_player` | `owner ASC, playerId ASC` | 清理指定档案的历史会话 |
| `runs` | `started_at` | `startedAt ASC` | 按创建时间清理过期会话 |
| `bestScores` | `owner_player` | `owner ASC, playerId ASC` | 清理指定档案的历史成绩 |
| `bestScores` | `owner_level` | `owner ASC, levelId ASC, levelVersion ASC` | 我的当前版本最好成绩与删除 |
| `bestScores` | `level_ranking` | `levelId ASC, levelVersion ASC, durationMs ASC, achievedAt ASC, playerId ASC` | 每关当前版本前10名及个人名次 |

玩家、会话、个人最佳均以确定文档 ID 或随机公开 ID 定位；`_id` 自带唯一性。个人最佳文档 ID 由私有身份、关卡、关卡版本生成散列，因此同一玩家在同一关卡版本只占一行。

仓库提供 `cloudfunctions/gameApi/database/permissions.json`、`runs-indexes.json`、`bestScores-indexes.json`。索引 JSON 使用腾讯云 `UpdateTable` 的 `CreateIndexes` 结构：`IndexName`、`MgoKeySchema.MgoIndexKeys` 与 `MgoIsUnique`。[官方索引 API](https://cloud.tencent.com.cn/document/product/876/127964)

本机官方开发者工具的 `wechatide` 入口支持集合和索引管理；使用前按工具随附 `wechatide-skill` 完成登录与版本检查。下面命令在项目根目录执行，仅对缺失的集合和索引执行写操作，已有同名索引先核对字段；不要删除已有数据或索引：

```sh
PUZZLE_APPID=wxc2add44d840ca728
PUZZLE_ENV=cloud1-d7gu7tyfpdb64e613
PUZZLE_ROOT="$PWD"
wechatide -c Codex cloud_env_list --appid "$PUZZLE_APPID"
wechatide -c Codex cloud_db_read_struct --appid "$PUZZLE_APPID" --env "$PUZZLE_ENV" --action listCollections
```

确认缺失的集合后，分别执行对应命令：

```sh
wechatide -c Codex cloud_db_write_struct --appid "$PUZZLE_APPID" --env "$PUZZLE_ENV" --action createCollection --collection-name players
wechatide -c Codex cloud_db_write_struct --appid "$PUZZLE_APPID" --env "$PUZZLE_ENV" --action createCollection --collection-name runs
wechatide -c Codex cloud_db_write_struct --appid "$PUZZLE_APPID" --env "$PUZZLE_ENV" --action createCollection --collection-name bestScores
```

检查索引并补全缺失项：

```sh
wechatide -c Codex cloud_db_read_struct --appid "$PUZZLE_APPID" --env "$PUZZLE_ENV" --action listIndexes --collection-name runs
wechatide -c Codex cloud_db_read_struct --appid "$PUZZLE_APPID" --env "$PUZZLE_ENV" --action listIndexes --collection-name bestScores
wechatide -c Codex cloud_db_write_struct --appid "$PUZZLE_APPID" --env "$PUZZLE_ENV" --action updateCollection --collection-name runs --update-options-file "$PUZZLE_ROOT/cloudfunctions/gameApi/database/runs-indexes.json"
wechatide -c Codex cloud_db_write_struct --appid "$PUZZLE_APPID" --env "$PUZZLE_ENV" --action updateCollection --collection-name bestScores --update-options-file "$PUZZLE_ROOT/cloudfunctions/gameApi/database/bestScores-indexes.json"
```

部分索引已存在时，先生成只包含缺失项的临时 JSON 再传入，避免重复创建报错。创建返回不代表已生效，使用 `listIndexes` 验证实际状态。数据库权限在云开发控制台逐集合设置为 `permissions.json` 的内容，并从小游戏端尝试直接读取/写入以确认被拒。上传 JSON 文件本身不会应用权限或建立索引。

## 接口契约

统一调用：

```js
wx.cloud.callFunction({ name: 'gameApi', data: { action, payload } })
```

统一业务返回：

```js
{ ok: true, data: { /* 对应动作的结果 */ } }
{ ok: false, error: { code: 'RUN_EXPIRED', message: '用户可读说明', retryable: false } }
```

网络层 `callFunction` 失败与业务 `ok:false` 需要分别处理；禁止展示假同步成功。按接口返回的业务错误 code 处理。匿名档案的默认昵称及头像标识由 bootstrap 从 `shared/profile-options.js` 生成。

### 连续闯关总榜

新版总榜展示每位玩家经云端重放的最高连续通关号。前十按关数降序，同关按云端首次确认时间升序，再按公开玩家 ID 字典序排列。离线成绩恢复联网时以首次确认的服务端时间参与同关排序。本地最佳用时独立保存。

| 动作 | 请求 | 响应 |
|---|---|---|
| `storyBootstrap` | `{consentVersion}` | `{rankingVersion:1, publicProfile, highestLevel}`。沿用既有微信身份及资料，首次进度为 0 |
| `submitStoryClear` | `{playerId, level, sessionVersion, moves, toolHistory?}` | `{highestLevel}`。登录档案 ID 取自最近一次 bootstrap |
| `storyLeaderboard` | `{}` | `{rankingVersion:1, entries, own}`。空榜为 `[]`，本人尚无云端成绩时 `own:null` |

`entries` 的行格式为 `{rank,id,nickname,nicknameId,avatarId,avatarUrl,profileSource,level,achievedAt,isSelf}`。`own` 为 `{rank,level,achievedAt}`，可以查询本人排在十名以外的名次。游客自动分配匿名昵称，玩家主动申请微信资料时继续使用 CloudID 的内容安全审核链路。

客户端完成每一关时在本机保存 `level`、编排版号、移动序列及道具使用位置，直到服务器确认。新编排为 `sessionVersion:3`；仍在进行的旧 60 站主线使用 1。服务端从可信关号与编排版号构造完整棋盘，只接受从第 1 关起无缺口的下一关。移动最多 2,000 步，道具历史最多 5 项，校验每种道具的单局次数、使用顺序及动作合法性。保存在旧版设备上的纯计时/星级摘要只能证明本地显示进度。服务器须取得可重放的完整操作才能增加榜单进度。

同一关的并发或迟到重传返回已提交的最高关，不刷新达成时间。`PREVIOUS_REQUIRED` 表示通关条目间存在缺口；客户端按 `highestLevel + 1` 对账。`PROFILE_CHANGED` 表示提交期间微信档案已重新建立。`INVALID_MOVES` 或 `UNSOLVED_RUN` 拒绝无效证据或未通关局面。服务端使用真实身份，不读取客户端传入的用时、棋盘、星数或排行榜名次。

**存储与兼容**　`players.storyScore` 保存本人的 `{level,achievedAt,key}`，`bestScores` 仅为该人保留一个主线榜行。榜行主键以大写 `S` 开头，后接定宽反序关号、服务端时间和玩家 ID，使用集合内置的唯一主键索引顺序读取前十或计数本人前序行。榜单升级、旧行清除和个人进度在同一事务中提交。v3/v4 竞速行继续使用十六进制散列主键和原索引。删号事务同步移除主线榜行，其他玩家的名次随即更新。

### 旧版固定关卡接口

### bootstrap

输入 `{ consentVersion, levelVersion? }`。`consentVersion` 来自 `shared/profile-options.js`，只在业务隐私说明与微信隐私授权通过后使用。下面三个请求（`bootstrap`、`startRun`、`leaderboard`）省略 `levelVersion` 时均采用 3；新版发数字 4。其他版号返回 `LEVEL_CHANGED`。

返回公开资料、`levelVersion`、`unlockedLevel`、`bestScores`、`activeRun` 和 `serverNow`。请求 v4 时另返回 `legacyBestScores`。

- `publicProfile` 为 `{ id, nickname, nicknameId, avatarId, avatarUrl, profileSource }`。两册共享微信身份与公开资料。`profileSource` 为 `wechat` 时使用已验证的微信昵称和头像，访客为 `guest`。
- `bestScores` 为所请求版本的 `{ levelId, levelVersion, durationMs, achievedAt }` 数组。`legacyBestScores` 单独列出 v3 旧成绩，供新版恢复经典相册照片。
- `activeRun` 为该版本的有效活跃挑战或 `null`。`unlockedLevel` 是该版本的建议下一关。经典册最大 10，新册最大 12，两册内所有关卡均可直接挑战。

旧云的 `bootstrap` 响应没有顶层 `levelVersion`。新版此时按 v3 云处理，微信资料与旧局同步仍可使用。开新册挑战时提供「本地游玩」与重试，收到版号不符的开局或榜单响应时会提示云版本问题。云函数升级后，开局重试会重新连接并确认版本。

公开结果不包含原始 OpenID、UnionID、IP 或私有身份键。重复 bootstrap 保持同一档案。

### startRun

输入 `{ levelId, requestId, levelVersion? }`。经典册的 `levelId` 为 1–10，新册为 1–12，均为整数，`requestId` 是8至96位字母、数字、下划线或短横线。每次**新挑战**创建新 requestId；重试**同一请求**继续使用原 requestId。

返回 `{ runId, levelId, levelVersion, startedAt, serverNow, status }`。

- 同一用户同一 requestId 始终定位同一会话。将它用于不同关卡或不同版本会返回 `REQUEST_CONFLICT`。
- 新 requestId 会在同一事务中废弃该版本的上一局活跃挑战。每个用户在每个版本最多保留一局活跃挑战，v3 与 v4 可以各续玩一局。
- 重试已经废弃或完成的 requestId 会返回其原始概要和真实 `status`，不会重新激活；客户端若要重玩需生成新 requestId。
- 两次不同开始请求间隔不足800ms会返回可重试的 `TOO_MANY_REQUESTS`。

### resumeRun

输入 `{ runId }`。返回与 startRun 相同的概要。

服务端依会话最初记录的 `levelVersion` 选择经典或新册规则，校验当前身份、会话归属、对应版本的活跃状态及 24 小时有效期。过期或被另一局替代时明确报错；前端可保留本地局面用于练习，但不能把它伪装成仍可排名的云端会话。

### finishRun

输入 `{ runId, moves: [{ from, to }] }`。只接受1至2000个操作；索引是整数，规则复放决定其合法性。

返回 `{ durationMs, isPersonalBest, rank, unlockedLevel, bestMs }`。

- 服务端取可信身份与服务器墙钟，忽略客户端身份、成功标记和耗时字段。
- 按会话保存的版号载入固定棋面，重放初始局面、交换、融合、消除、下落与补牌。新册还校验显影与定位钉，必须完成该版本关卡的全部目标。
- 会话和个人最好成绩在事务中同时更新，已结算会话只返回原始结算结果。
- `durationMs` / `isPersonalBest` / `bestMs` 保持该次结算时的幂等结果；`rank` 是查询时该用户**当前个人最佳**的名次，其他玩家刷新成绩后可以变化。
- 服务器计时从 startRun 接收开始，到 finishRun 接收结束，含途中切后台、暂停与网络传输。开始前应已加载本关素材。界面需明确“排名计时持续进行”，不能从服务端耗时中扣减无法验证的客户端暂停。
- 会话有效期24小时，超时可以继续本地练习，但不再入榜。

此方案阻止任意伪造毫秒数、未完成局面、非法操作和越权提交；合法动作重放不等于能证明真人操作，不能声称彻底防止自动求解器。

### leaderboard

输入 `{ levelId, levelVersion? }`。

返回 `{ levelVersion, entries, ownBest, serverNow }`。`entries` 最多10条；每条为 `{ rank, id, nickname, nicknameId, avatarId, avatarUrl, profileSource, durationMs, achievedAt, isSelf }`。`ownBest` 为当前版本个人成绩与名次，或 `null`。

按耗时升序、达成时间升序、公开 ID 升序稳定排序；同一玩家、同一关、同一版本仅一条。旧关卡版本的成绩不混入当前榜单。榜单中的头像昵称实时读取已审核的公开资料，微信资料同步后会反映到榜单。

### 旧版客户端的续玩与相册迁移

本机沿用 `yipin-chenghua-v2` 存储键。`schemaVersion: 2` 首次迁移保留微信同意状态、个人资料、原有音效设置和 `run` / `pendingResult` 操作日志。经典用时写入 `legacyBestV3` 并解锁对应照片，新册的用时与最高星级分别记录在 `best` 和 `stars`。

续玩按本地日志保存的版号载入原关卡。经典进行中局可以继续，经典待同步终局用原 `runId` 补交。每次移动都将已成图的照片记入本地相册。新册结算星级按实际步数计算并保留个人最高；金框归属于已完成的新册典藏照。离线冷启动仍可查看已完成云局的本地结算，联网后可重新提交原日志。换设备后可由云端最佳成绩恢复对应关卡的完整照片，本机步数星章和单张局中收录没有独立云端字段。

### syncWechatProfile

输入仅需 `{ cloudID }`，返回 `{ publicProfile }`。不接受客户端明文昵称、头像 URL 或身份作为微信资料依据。

客户端先使用官方按钮授权。回调成功且含CloudID时直接同步；成功但没有CloudID时，在核对微信登录态及已授权状态后，调用一次`wx.getUserInfo({ withCredentials:true })`补取凭证。拒绝授权不会补取，补取失败不会提交明文资料；页面保留具体错误并允许重新准备授权。[官方按钮回调](https://developers.weixin.qq.com/minigame/dev/api/open-api/user-info/UserInfoButton.onTap.html)、[已授权资料获取](https://developers.weixin.qq.com/minigame/dev/api/open-api/user-info/wx.getUserInfo.html)

云端通过 `cloud.getOpenData({ list: [cloudID] })` 获取微信开放数据，校验其中的 openId 与当前可信 OPENID 一致、水印 appid 一致、时间戳处于五分钟有效范围。只保存 nickName 与 avatarUrl 对应的公开资料，不保存 CloudID、性别、地区或解密后的完整原文。[官方开放数据获取](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/signature.html)

头像仅接受 `wx.qlogo.cn` / `thirdwx.qlogo.cn` 的 mmopen/mmhead 路径，统一为 HTTPS，拒绝用户信息段、非标准端口、伪子域及其他外链；没有头像的合法微信用户允许空头像。不会复制图片到云存储。微信用户修改头像后旧 URL 可能失效，重新获取微信资料会刷新 URL。[官方 UserInfo 说明](https://developers.weixin.qq.com/minigame/dev/api/open-api/user-info/UserInfo.html)

发布资料前使用小游戏专用同步内容安全接口，场景均为资料 `scene:1`、版本 `2`，openid 仅来自可信调用上下文：

- `cloud.openapi.wxa.game.contentSpam.msgSecCheck` 校验昵称，`content` 为已验证的昵称。[官方文本内容安全](https://developers.weixin.qq.com/minigame/dev/api-backend/wxa-sec-check/api_gamemsgseccheck.html)
- `cloud.openapi.wxa.game.contentSpam.mediaCheckSync` 校验非空头像，参数 `media_type:2`、`media_url` 为已验证的头像 URL。[官方图片内容安全](https://developers.weixin.qq.com/minigame/dev/api-backend/wxa-sec-check/api_gamesecurity.mediacheck.html)

仅 `result.suggest:pass` 才发布新资料。审核失败、接口未开通或返回不完整都保留旧资料并返回明确错误，不降级为相信客户端明文。同一份已通过资料在24小时内复用审核结果，但仍校验本次 CloudID；字段变化或超过24小时后的下次同步重新审核。

`config.json` 的 `permissions.openapi` 声明上面两个完整云调用名称。微信官方要求权限值使用调用接口名，且每次微信开发者工具上传函数会更新该白名单；更新后可能有10分钟缓存，不能将短时 `-604101` 误判为代码不支持。SDK 4.0.2 使用通用命名空间代理，以方法路径作为 apiName；没有本地静态接口列表限制。[官方云调用权限说明](https://developers.weixin.qq.com/minigame/dev/wxcloud/guide/openapi/openapi.html)

### 客户端微信资料流程

我的页面调用 `app.prepareWechatProfile()`：先检查本游戏数据说明和平台隐私授权，再初始化云开发、检查微信登录态并在需要时调用 `wx.login`。这里的登录仅为 `withCredentials:true` 的用户信息接口准备有效会话，不自建登录凭据，不保存或上传 session_key。

若已授权 scope.userInfo，调用 `wx.getUserInfo` 取得新的 CloudID 并同步；未授权时设置 `wechatProfileReady:true`，由界面创建官方 `wx.createUserInfoButton` 覆盖层。首次授权不能以 `wx.authorize({scope:'scope.userInfo'})` 代替按钮，也不使用小程序 WXML 的 chooseAvatar/nickname 组件。[官方小游戏用户信息指南](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/user-info.html)

UI 调用 `app.createWechatProfileButton({x,y,w,h})`，坐标为390逻辑坐标；方法按当前比例转换为屏幕像素，返回 show/hide/destroy/setRect 包装。按钮自身透明，点击仍来自官方原生组件；离开我的页面、出现弹窗或开始处理时应隐藏/销毁，避免跨页遮挡。授权回调只取 CloudID，调用后端验证成功后才更新我的页与本人榜单行。拒绝不影响本地玩法。

`app.avatarFor(profile)` 提供微信头像的内存缓存，最多32项；只加载可信微信 URL，失败显示中性占位，60秒后可重试。图片不写自建文件缓存；删号清空本机资料与内存缓存，迟到请求不能重新写入。界面通过 `wechatProfileLoading`、`wechatProfileReady`、`wechatProfileError` 展示真实状态。

### deleteAccount

输入 `{ confirm: true }`。必须由前端明确二次确认后调用。返回 `{ deleted: true }`。

先事务性标记用户为删除中并移除 v3 与 v4 两册的榜单成绩，阻止并发新写；再按私有身份与公开档案 ID 共同匹配，清理该档案的会话和所有历史成绩；最后检查删除令牌并移除档案，包括保存的微信昵称、头像 URL 与审核时间。条件删除在数据库中执行，不先取文档 ID 再无条件删除。中断后可安全重试；并发的旧删除请求不会清理同一微信身份随后新建的档案记录。删除过程中 bootstrap、startRun、finishRun 和 syncWechatProfile 均拒绝新写入。调用成功后客户端清理本地身份、会话、两册历史成绩、星级、相册、金框、两个隐私同意标记、微信头像内存缓存和原生授权按钮，不再自动重建云端档案。

## 安全与生产验证

`index.js` 只从 `cloud.getWXContext()` 获取身份，限定当前 AppID，不接受 event 内的身份声明。数据库保存的归属键是服务端散列，不向客户端返回。SDK管理凭据与AppSecret不进入前端或仓库。

事务使用 `wx-server-sdk` 的 `runTransaction`，自动处理写冲突；事务内以 doc 定位，不使用 where 查询。纯规则复放在事务前完成，缩短锁持有时间；提交事务中再次验证会话状态与所有权。[微信事务文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/database/transaction.html)

本地 `tests/cloud.test.cjs` 使用可注入时钟和具有事务提交/回滚语义的内存仓库，验证身份、参数、幂等、并发、非法操作、计时、稳定排名、关卡版本、受控资料及删除重试。真实共享规则与十二关参考解覆盖新册完整结算，经典与新册第八关使用各自的真实操作日志分别入榜，缺失末步和伪造终局均被拒；并发删除后重建档案、文档 ID 被新档案复用也有回归检查。运行 `node --test tests/cloud.test.cjs` 获取当前结果；内存测试不替代真实云服务验收。

部署后必须使用至少两个真实身份验证：能启动/恢复/完成挑战；云数据库可看到可信写入；重试不重复记分；另一个玩家不能代提交；前端直写被拒；索引就绪后前10排序正确；删除后仅该用户资料消失；切后台、弱网及重新进入按真实状态恢复。

## 历史会话清理

`maintenance` 是独立的定时维护函数。每天北京时间 03:20，按服务器当前时间查找创建超过 7 天的 `runs`，每批最多 100 条、单次最多 1000 条；达到上限的剩余数据留到下次执行。它不访问 `players`、`bestScores`，因此清理操作轨迹不会清空用户档案、进度或排行榜最佳成绩。挑战的 24 小时有效期仍由 `gameApi` 校验，与七天历史保留范围独立。

函数从 `cloud.getWXContext()` 获取调用来源，只允许 `SOURCE === 'wx_trigger'` 且事件中的定时器名称与配置一致的调用；客户端在 event 中伪造 SOURCE 无效。微信官方明确提供该来源值识别定时触发器。[官方触发器与来源说明](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/functions/triggers.html)

数据库查询先取有上限的文档 ID，随后删除语句同时匹配 ID 和创建时间，避免清理过程中同 ID 被新的挑战复用。数据库失败直接抛错，交给平台记录失败与重试；重复触发只会继续清理仍存在的过期会话。运行日志只包含截止时间、选择条数、删除条数与是否触达上限，不记录用户身份或操作轨迹。

部署清单：

1. 为 `runs` 建立 `started_at` 升序索引，配置已包含在 `gameApi/database/runs-indexes.json`。
2. 部署 `cloudfunctions/maintenance`，使用云端安装依赖；建议超时设为 60 秒。
3. 在函数权限控制中应用 `cloudfunctions/maintenance/function-permissions.json`。该文件面向本项目的两个函数，默认拒绝客户端调用，仅允许已登录用户调用 `gameApi`；如果环境中另有函数，先合并现有规则，不能覆盖其他业务。函数级权限不限制定时触发器。[CloudBase 函数访问控制](https://docs.cloudbase.net/cloud-function/security-rules)
4. 将 `maintenance/config.json` 中的触发器**部署并启用**。在微信开发者工具中对云函数执行「上传触发器」，并在控制台的「微信云开发触发器」区域核对。标准云函数触发器的来源上下文不同，不能直接替代本项目的微信触发器。仅上传函数代码不会证明触发器已安装。[官方触发器配置](https://docs.cloudbase.net/cloud-function/timer-trigger)
5. 核查触发器名称 `purgeExpiredRuns`、类型 `timer`、七字段表达式 `0 20 3 * * * *`，并确认状态启用。微信定时器使用 UTC+8，代表每天 03:20。
6. 验证真实定时触发日志返回 `ok:true`；从客户端调用应由平台拒绝，或返回 `FORBIDDEN`，且不改变数据库。使用专门测试会话验证过期删除和近期保留，不能拿真实玩家成绩做试删。

部署命令：

```sh
wechatide -c Codex cloud_fn_deploy --appid "$PUZZLE_APPID" --env "$PUZZLE_ENV" --path "$PUZZLE_ROOT/cloudfunctions/maintenance" --remote-npm-install
```

监控 `limitReached`；若连续出现 `true`，说明每日清理容量可能低于历史会话产生速度，应先核查积压量，再提高触发频率，每次执行的 1000 条上限保持不变。七天是进入清理队列的时间，不是精确删除时刻；正常每日执行存在至多一个调度周期的延迟，失败或积压会延长保留。相关说明应如实写入运营方隐私指引。

`tests/maintenance.test.cjs` 覆盖客户端伪造来源被拒、七天边界与活跃局保留、1000 条上限与继续执行、同 ID 复用竞态、数据库失败与重试。使用 `node --test tests/maintenance.test.cjs` 验证。上线状态必须另以实际触发器配置、权限和云端日志为准。
