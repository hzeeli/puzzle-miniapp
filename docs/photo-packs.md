# 照片分包

生成器调用 `require('./game/src/photo-path').photoPath(id)` 即可得到分包名和相对 `game/` 的 JPEG 路径。照片编号永久对应同一幅作品，旧存档会用编号恢复画册。

| 照片 ID | 运行时路径范围 | 所在包 |
| --- | --- | --- |
| `photo-01` 至 `photo-12` | `assets/photos/photo-01.jpg` 至 `assets/photos/photo-12.jpg` | 主包 |
| `photo-13` 至 `photo-24` | `packs/album-02/photo-13.jpg` 至 `packs/album-02/photo-24.jpg` | `album-02` |
| `photo-97` 至 `photo-108` | `packs/album-09/photo-97.jpg` 至 `packs/album-09/photo-108.jpg` | `album-09` |

每十二张照片一包。将新原画导出为 2:3 的 JPEG，按上表写入目录，并在照片目录表及对应关卡中使用同一个 ID。运行 `npm run build` 将根据实际照片目录更新 `game/game.json` 的普通分包声明，写入目录入口 `game.js`，再将 JPEG 按原路径复制到 `artifacts/web/packs/`。微信开发者工具继续导入项目根目录。

场景使用 `app.assets.loadAll(本次可见照片ID)`。微信端先下载对应分包，再解码所需图片。下载失败后再次调用即可重试。网页直接请求相同路径。全尺寸照片的内存缓存保留最近访问的 24 张；相册滚动、切换关卡及返回旧局时按画面所需编号重新请求。

微信官方当前规定主包上限 4M、所有包合计上限 30M。这里使用普通分包，由 `wx.loadSubpackage` 的成功回调确认内容可读。平台以开发者工具的打包结果核算大小。[微信小游戏分包指南](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/subPackage/useSubPackage.html) [加载分包接口](https://developers.weixin.qq.com/minigame/dev/api/base/subpackage/wx.loadSubpackage.html)
