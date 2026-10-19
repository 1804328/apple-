# 云端部署清单（Cloudflare Worker + D1 + PushPlus）

目标：让「到点没确认 → 微信催你」这条链跑起来。约 15 分钟。

前置：Cloudflare 账号（免费）、PushPlus token、Node 20+。

---

## 0. 先拿 PushPlus token

1. 手机微信扫码登录 <https://www.pushplus.plus>
2. 完成**实名认证**（2024 年 8 月起未实名不能调发送接口）
3. 首页复制 **token**

> 微信渠道实名用户每天 200 次以内免费，个人用足够了。

---

## 1. 登录 Cloudflare

```powershell
cd C:\Users\LEGION\Documents\deepseek-harness\default-workspace\strong-reminder\server
npx wrangler login
```

会打开浏览器，点 Allow。没装依赖也没关系，`npx` 会临时拉取。

---

## 2. 创建 D1 数据库

```powershell
npx wrangler d1 create strong-reminder
```

输出里有一行：

```
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

把这个 id 填进 `server/wrangler.toml`，替换掉 `REPLACE_ME`。

---

## 3. 建表

```powershell
npx wrangler d1 execute strong-reminder --remote --file=./schema.sql
```

---

## 4. 设置两个密钥

```powershell
npx wrangler secret put API_KEY
```

粘贴我给你的 API_KEY（不是 PushPlus 的），回车。

```powershell
npx wrangler secret put PUSHPLUS_TOKEN
```

粘贴 PushPlus token，回车。

> 密钥不会写进仓库，也不会显示在 Cloudflare 控制台。

---

## 5. 部署

```powershell
npx wrangler deploy
```

输出会给你一个地址，类似：

```
https://strong-reminder.xxxx.workers.dev
```

---

## 6. 回填确认链接的域名

编辑 `server/wrangler.toml`：

```toml
PUBLIC_BASE_URL = "https://strong-reminder.xxxx.workers.dev"
```

保存后**再部署一次**：

```powershell
npx wrangler deploy
```

（微信推送里的「我知道了」按钮要用这个地址。）

---

## 7. 验活

```powershell
curl.exe https://strong-reminder.xxxx.workers.dev/health
```

返回 `{"ok": true, ...}` 就算通了。

---

## 8. App 里填配置

打开「强提醒」→ 右上角齿轮：

| 字段 | 填什么 |
|---|---|
| 服务器地址 | `https://strong-reminder.xxxx.workers.dev` |
| API Key | 第 4 步设置的 API_KEY |
| 启用云端升级 | 打开 |

点「测试连接」→ 应该提示「连接成功」。

---

## 9. 端到端测试

1. 新建一条 **2 分钟后** 的提醒（强制度选「标准」）
2. 到点后**别管它**，也不要点 App
3. 到点后约 5 分钟，微信应该收到一条「⏰ 标题」的推送
4. 点推送里的「**我知道了，已确认**」
5. 应该看到「✅ 已确认」页面，之后不会再有升级消息

如果微信没来：

- App 里确认「启用云端升级」是开的、测试连接成功
- Cloudflare 控制台 → Workers → strong-reminder → Logs，看有没有报错
- `wrangler secret list` 确认两个 secret 都在
- 检查 PushPlus 是否实名、token 是否正确（可直接跑 `node scripts/dev-send.mjs "测试"` 验证）

---

## 常见问题

| 现象 | 处理 |
|---|---|
| `npx wrangler login` 浏览器打不开 | 复制终端里的链接手动粘贴到浏览器 |
| `d1 create` 报重名 | 说明已建过，去控制台查 database_id 填进 toml 即可 |
| deploy 报 `database_id` 无效 | 检查 toml 里有没有残留的 `REPLACE_ME` |
| 微信收不到 | 90% 是 PushPlus 没实名或 token 贴错 |
| 到点后没有任何升级 | 检查提醒是否在 App 里成功同步（设置页测试连接） |
