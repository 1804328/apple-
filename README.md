# 强提醒（Strong Reminder）

自己设定日期 → 到点闹钟级响铃 → 没确认就自动升级到微信/短信 → 点链接即确认。

完整设计见 [PLAN.md](PLAN.md)。

## 项目结构

```
strong-reminder/
├─ PLAN.md              产品与技术规划（平台边界、强制度分档、里程碑）
├─ app/                 Expo (React Native) 客户端，iOS 优先
│  ├─ App.tsx           列表 / 新建 / 设置 三屏
│  ├─ src/services/     AlarmKit 闹钟 + 本地通知 + 云端同步
│  ├─ src/screens/      UI
│  └─ src/store/        本地存储（AsyncStorage，离线优先）
└─ server/              Cloudflare Worker 升级引擎
   ├─ src/lib/          escalation 纯函数（已单测）
   ├─ src/channels/     PushPlus 微信通道
   ├─ schema.sql        D1 表结构
   └─ test/             12 项升级链单测
```

## 一、部署云端（约 15 分钟）

```powershell
cd server
npm install

npx wrangler login
npx wrangler d1 create strong-reminder      # 把返回的 database_id 填进 wrangler.toml
npm run db:init                             # 建表（--remote）

npx wrangler secret put API_KEY             # 自己编一个长随机串，App 里要填一样的
npx wrangler secret put PUSHPLUS_TOKEN      # 见下面 PushPlus 部分
npx wrangler deploy
```

部署后拿到 `https://strong-reminder.<你的子域>.workers.dev`：

1. 把 `wrangler.toml` 里的 `PUBLIC_BASE_URL` 改成这个域名，重新 deploy 一次（确认链接要用）。
2. Cron 已配置为每分钟触发，无需额外操作。

**PushPlus token**：打开 <https://www.pushplus.plus>，微信扫码登录 → 实名认证 → 首页复制 token。
免费额度为微信渠道 < 200 次/天。想先验证通道：

```powershell
$env:PUSHPLUS_TOKEN = "你的token"
node scripts/dev-send.mjs "强提醒 · 通道测试"
```

## 二、运行 App

```powershell
cd app
npm install
npx expo start --dev-client        # 需要 dev build，不能用 Expo Go
```

设置页填入 Worker 域名 + API_KEY，打开"启用云端升级"，点"测试连接"。

## 三、出 iOS 包（Windows 无 Mac，0 元）

走**免费签名路线**：GitHub Actions 的 macOS runner 编译未签名 IPA → Windows 上用 Sideloadly + 免费 Apple ID 签名安装 → 每 7 天重签。

完整步骤见 **[docs/FREE-SIDELOAD.md](docs/FREE-SIDELOAD.md)**。

```powershell
git init -b main
git add .
git commit -m "strong reminder"
git remote add origin https://github.com/<你>/strong-reminder.git
git push -u origin main
```

推送后自动触发构建，Artifacts 里下载 `unsigned.ipa`。

> 如果之后买了 Apple Developer 账号（¥688/年），改用 EAS 更省事：
> ```powershell
> npm i -g eas-cli && eas login
> cd app && eas build --profile preview --platform ios
> ```

## 四、验证清单（M1）

| # | 验证 | 怎么验 |
|---|---|---|
| 1 | GitHub Actions 云构建 → 免费签名装机 | 记录首次构建耗时、pod install 是否超时 |
| 2 | AlarmKit 静音/勿扰/锁屏下响 | 设 3 分钟后提醒，开静音 + 勿扰，锁屏等待 |
| 3 | AlarmKit 闹钟数量上限 | 连续建 10 条未来提醒，看是否抛 `MAXIMUM_LIMIT_REACHED` |
| 4 | 杀进程后仍响 | 划掉 App 再等触发 |
| 5 | 微信升级 + 一键确认 | 设 2 分钟后提醒，不确认；5 分钟内应收到微信，点链接后停止升级 |
| 6 | 补发窗口 | 关网/关机跨越到点时间，恢复后按策略补发 |
| 7 | 7 天重签后提醒是否还在 | 重签 = 重装，本地数据会清空；确认云端登记与升级是否仍正常 |

## 五、当前状态

- ✅ 升级引擎（`server/src/lib/escalation.js`）+ 12 项单测通过
- ✅ D1 schema、幂等投递、确认链接、PushPlus 通道、调度入口；路由层 8 项冒烟测试通过
- ✅ App 三屏、本地调度（AlarmKit fixed schedule + 通知兜底）、云端同步；`tsc` 严格模式通过
- ✅ 免费签名构建链（`.github/workflows/ios-unsigned.yml`）
- ⏳ 未验证：真机行为、Cloudflare 首次部署、Actions 首次构建、AlarmKit 实际铃声与额度
- ⏳ 未实现：短信/语音通道（M4）、Android 全屏闹钟（后续）、提醒编辑（当前只能删了重建）
