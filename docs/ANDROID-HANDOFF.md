# 新会话交接提示词：把「强提醒」移植到 Android

> 用法：新建一个聊天，把下面 ``` 之间的整段内容作为第一条消息发出去。

```
我要把已有的「强提醒」App 做成 Android 版，请你接手开发。

【项目背景】
「强提醒」是一个「设定日期 → 到点闹钟级响铃 → 没确认就自动升级到微信/企业微信 → 点确认链接停止」的个人工具。
iOS 端已经完成并稳定使用，现在要出 Android 端。

【项目位置】
- 仓库：C:\Users\LEGION\Documents\deepseek-harness\default-workspace\strong-reminder
- 分支：main，远程 ssh://git@ssh.github.com:443/1804328/apple-.git
- 先读这些文件，再动手：
  - PLAN.md（产品设计：强制度分档、升级链、里程碑）
  - README.md（部署与安装流程）
  - docs/TECH-ROUTE.md（技术路线与踩坑总结）
  - app/App.tsx（状态与主流程）
  - app/src/（screens / services / store / lib / components）
  - server/src/（Cloudflare Worker：路由 + Cron 升级引擎 + 通道适配器）

【现状】
- 客户端：Expo SDK 58 + React Native 0.88 + TypeScript，iOS 已上线（免费签名侧载）
- 后端：Cloudflare Worker + D1，已部署；每分钟 Cron 扫描到期提醒并按升级链推送
- 通道：企业微信群机器人（已接通）；WxPusher 适配器已写好未启用
- 已有功能：提醒 CRUD / 编辑 / 每周每月每年重复 / 强制模式（数学题解锁 + 连环闹钟）/ 纪念日生成（里程碑、公历每年、农历每年）/ 日历选择器 / 云端同步与重装恢复 / 推送统计 / 系统体检

【本次目标】
新增 Android 端，功能与 iOS 对齐，并利用 Android 更强的系统能力把「强制」做好。

【关键功能映射（iOS → Android）】
1. 到点闹钟
   - iOS 用 AlarmKit（react-native-ios-alarmkit，Android 上是安全 no-op）
   - Android 需要：AlarmManager.setAlarmClock 精确闹钟 + 全屏 Intent（USE_FULL_SCREEN_INTENT）+ 前台服务 + 亮屏解锁
   - 候选方案自行评估：Notifee（fullScreenAction / TimestampTrigger）、react-native-alarm-notification、或本地 Expo config plugin + 原生模块
   - 现有 app/src/services/alarms.ts 已把 iOS 逻辑封装，Android 分支目前是「退回时间敏感通知」，需要替换为真正的全屏闹钟
2. 权限向导（Android 特有，必须做）
   - 精确闹钟（SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM）
   - 全屏通知（USE_FULL_SCREEN_INTENT）
   - 悬浮窗（SYSTEM_ALERT_WINDOW，可选）
   - 电池优化白名单（免杀）
   - 自启动（国产 ROM）
   - 勿扰访问（ACCESS_NOTIFICATION_POLICY，用于绕过 DND）
   - app.json 里 android.permissions 已预置，需补 manifest receiver/service 与运行时引导页
3. 强制模式
   - 连环闹钟（+2/+4/+6 分钟）逻辑可复用
   - 数学题解锁页（app/src/screens/MathChallengeScreen.tsx）可直接复用
4. 云同步 / 恢复 / 升级链：完全复用后端，不需要改（除必要时加字段需写 migration）
5. 7 天重签问题在 Android 不存在（APK 无签名过期），但调试期每次构建仍需重装

【硬性约束】
- 不要改动 iOS 端行为；新增 Android 能力要放在平台分支或独立 service 里
- 不要轻易新增原生依赖：每加一个都可能带来构建失败/运行时崩溃，必须单独验证后再继续
- 后端如需加字段，用 server/migrations/00N_*.sql，并在 schema.sql 同步
- 每次改动必须：npx tsc --noEmit 通过（在 app/ 下），server 单测 20 项全过（在 server/ 下）
- 提交粒度：一个可验证的小功能一次 commit，消息写清楚做了什么
- 不要用 PowerShell 5.1 的 -replace + Set-Content 改写含中文的文件（会乱码），用 Node 脚本或直接编辑

【开发环境】
- Windows 电脑，没有 Mac
- Android 构建两种路径：
  A. 本地：安装 JDK 17 + Android SDK，npx expo prebuild --platform android，然后 gradlew assembleRelease
  B. 云端：EAS Build（免费额度每月 15 次 Android 构建），eas build -p android --profile preview
  - 优先尝试 A（迭代快），失败再退 B
- 安装：手机开启「允许安装未知来源」，adb install 或直接传 APK

【第一步（先别写业务代码）】
1. 读上面列的文件，用 3 句话向我复述你对这个项目的理解
2. 在 app/ 下跑 npx tsc --noEmit，在 server/ 下跑一次单测，确认现状是绿的
3. 检查 app/app.json 的 Android 配置与 app/src/services/alarms.ts 的 Android 分支
4. 给出 Android 端的技术方案：闹钟用什么库/原生模块、权限怎么引导、全屏怎么实现、构建走哪条路
5. 列出你最担心的 3 个风险点，等我确认后再开始改代码

【验收标准】
必须逐条在真机上验证：
- 静音模式下，到点全屏闹钟响并能点亮屏幕
- 勿扰模式下仍然响
- 锁屏状态下全屏弹出
- App 被划掉后仍然触发
- 手机关机 2 小时后开机，漏掉的提醒会补发
- 重启手机后未来的闹钟仍然有效（BOOT_COMPLETED 重排）
- 到点不确认，5–15 分钟内企业微信收到推送
- 点推送里的确认链接后，升级停止
- 删除 App 重装后，能从云端恢复提醒
- 强制模式下连环闹钟有效，数学题做对才能确认

【工作方式】
- 每个阶段结束汇报：做了什么、验证结果、下一步
- 遇到不确定的取舍先问我，不要自己拍板改产品设计
- 不要一次性大改多个文件；先小步验证再扩展
```

---

## 使用说明

这块提示词的作用是让新会话**不重复问已知信息**，并且直接进入"先方案、后动手"的节奏。

如果新会话上下文有限，可以删掉「关键功能映射」的细节，只保留：项目位置 + 现状 + 目标 + 硬性约束 + 第一步 + 验收标准。
