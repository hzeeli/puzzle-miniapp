# 客户端启动兼容性

1.0.0在一台Xiaomi 24129PN74C真机上未能启动：微信8.0.80、基础库3.18.0的真机Console报告`SyntaxError: Invalid regular expression: /\p{Mark}/u: Invalid property name`。此错误发生在游戏脚本解析阶段，早于首页、素材加载和云连接；不能用开发工具模拟器运行成功推断真机已通过。

1.0.1将昵称分段统一交给锁定版本的`unicode-segmenter/grapheme`，使用Unicode数据表处理组合字符，保留emoji、国旗、组合附加符和非拉丁文字的完整字形。客户端不依赖`Intl.Segmenter`或Unicode属性转义；许可证随运行包提供于`game/licenses/unicode-segmenter.txt`。[组件官方说明](https://github.com/cometkim/unicode-segmenter)

`tests/client-startup.test.cjs`检查打包代码不包含Unicode属性转义，并在没有Intl、拒绝属性转义RegExp的测试环境中启动客户端至首页及验证字形边界。新增两项测试在旧代码失败、修复后通过。该测试模拟能力缺失，不等同于完整模拟手机JavaScript引擎；同机冷启动和实际操作仍是发布验收项。

微信官方说明不同运行环境的JavaScript支持存在差异，Polyfill不能消除语法解析差异。未找到官方针对`\p{Mark}`的具体版本表，本次结论仅依据实际真机错误，不推断所有Android或所有3.18.0基础库均不支持。[运行环境](https://developers.weixin.qq.com/minigame/dev/guide/runtime/env.html)、[JavaScript支持情况](https://developers.weixin.qq.com/minigame/dev/guide/runtime/js-support.html)

- [x] 真机Console定位到具体启动错误。
- [x] 兼容回归先复现失败，再验证修复。
- [x] 161项自动测试通过；最终包检查通过。
- [x] 生成1.0.1手机预览二维码。
- [x] 用户退出旧小游戏并扫码1.0.1，在同一真机确认进入首页并开始第1关。
- [ ] 真实微信头像昵称授权与资料展示。

## 隐私接口准入

模拟器原生getUserInfo实测返回errno1026，明确要求到后台声明隐私用途；会话有效且scope.userInfo尚未出现。needAuthorization为false也可能代表未声明任何类型，不能作为配置完成的证明。昵称头像需要先按小游戏规范在后台声明。[官方小游戏隐私指南](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/privacy.html)

1.0.3将112、1025、1026归为隐私接入配置错误，保留errno并显示服务暂未就绪，不再通过auth deny文字把这些错误归为用户未授权；不会输出原始诊断内容或继续读取资料。两个新增回归先在旧代码失败，修复后通过，完整测试为166项。该修改不替代后台声明。
