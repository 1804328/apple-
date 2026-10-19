# 免费签名路线（不买 Apple 开发者账号）

目标：**Windows 电脑 + iPhone**，0 元把 App 装到手机上。

原理：iPhone 上装 App 必须签名。免费 Apple ID 也能签，但证书只有 **7 天**有效期。
所以流程是「云端 macOS 编译出未签名包 → Windows 上用免费 Apple ID 签名安装 → 每 7 天重签一次」。

```
GitHub Actions (macos-26, Xcode 26)
        │  npm ci → expo prebuild → xcodebuild → unsigned.ipa
        ▼
   Artifacts 下载 IPA
        │
        ▼
Sideloadly (Windows) + 免费 Apple ID 签名
        │
        ▼
   iPhone 安装（有效期 7 天）
        │
        └─ 每 7 天：同一个 IPA 重新签一次（不用重新构建）
```

---

## 0. 一次性准备（约 20 分钟）

| 工具 | 地址 | 说明 |
|---|---|---|
| GitHub 账号 | <https://github.com> | 存放代码 + 提供免费 macOS 构建机 |
| Sideloadly | <https://sideloadly.io> | Windows 上给 IPA 签名安装 |
| iTunes（官网 exe 版） | <https://www.apple.com/itunes/> | 提供 iPhone 驱动；**不要用 Microsoft Store 版** |
| Apple ID | 你现有的即可 | 免费账号，不用付费 |

> 免费账号限制：同时最多 3 个自签 App、每 7 天最多 10 个 App ID、证书 7 天有效。

---

## 1. 把代码推到 GitHub

在项目根目录（`strong-reminder/`，不是 `app/`）执行：

```powershell
git init -b main
git add .
git commit -m "strong reminder: app + worker"
```

然后去 GitHub 新建一个仓库（**不要**勾选 README/gitignore），再执行：

```powershell
git remote add origin https://github.com/<你的用户名>/strong-reminder.git
git push -u origin main
```

**Public 还是 Private？**
- Public：Actions 的 macOS 构建**不计额度**，想构建多少次都行
- Private：每月 2000 分钟额度，macOS 按 10 倍扣，约 200 分钟 ≈ **5–8 次构建/月**

个人项目建议先 Public。

---

## 2. 跑构建（约 25–35 分钟）

推到 `main` 后会自动触发，也可以在仓库页面 **Actions → Build unsigned IPA → Run workflow** 手动跑。

跑完在本次运行页面底部 **Artifacts → strong-reminder-unsigned-ipa** 下载，解压得到 `unsigned.ipa`。

---

## 3. 签名并安装到 iPhone

1. 装好 iTunes 和 Sideloadly；iPhone 用数据线连电脑，手机上点「信任此电脑」
2. 打开 Sideloadly，等它识别出设备
3. 把 `unsigned.ipa` 拖进窗口的 **IPA** 区域
4. **Apple ID** 填你的 Apple ID（可以单独建一个小号，避免主号风险）
5. 点 **Start**，输入 Apple ID 密码 + 手机收到的二次验证码
6. 等待 1–3 分钟，成功后手机会多一个「强提醒」图标
7. 第一次打开前：**设置 → 通用 → VPN 与设备管理 → 开发者 App → 信任**
8. 打开 App，允许通知、允许闹钟

> Sideloadly 会自动给 bundle id 加 Team 前缀、注册设备 UDID，不用手动处理。

---

## 4. 每 7 天重签（关键）

**不需要重新构建。** 拿同一个 `unsigned.ipa` 再走一遍第 3 步即可，约 2 分钟。

建议做法：

- 每周固定一天（比如周日晚）重签
- 在系统日历里建一个**每周重复**的提醒：「重签强提醒」
- 过期表现：图标变灰 / 点开闪退。此时本地闹钟是否还会响**不确定**，所以：

> **重签期间，云端微信升级一定要开着。** 这就是为什么升级链不是可选项。

---

## 5. 这条路线的取舍

✅ 0 元、不需要 Mac、不需要开发者账号、能用到 AlarmKit 闹钟级响铃

❌ 7 天有效期，一年约 52 次重签（每次 2 分钟）
❌ 免费证书偶尔会被苹果批量吊销，需要重签恢复
❌ 不能做远程推送（APNs）——但我们只用**本地通知 + 服务端微信推送**，正好绕开
❌ 不能上架、不能用 App Groups / iCloud

**什么时候该升级到 ¥688/年**：确认自己会长期用（比如连续用满一个月），或者开始把「绝对不能漏」的事交给它。

---

## 6. 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| Actions 里 pod install 超时 | 重跑一次；workflow 已内置 `--repo-update` 重试 |
| 编译报 Nitrogen / NitroAlarmkit 相关错误 | Nitro 版本不匹配。在 `app/` 下执行 `npm i react-native-nitro-modules@0.33.2`（该库发布时用的就是这个版本），提交后重跑 |
| `Unable to install` | 手机没信任电脑、锁屏了、或 USB 线只供电 |
| 签名报 entitlement 错误 | 已规避：`app.json` 里移除了 `expo-notifications` 的 config plugin（它会写入 `aps-environment`，免费证书不支持）。只用本地通知不受影响 |
| App 装上但打不开 | 先「信任开发者」；仍不行就重签一次 |
| 重签后提醒没了 | 重签 = 重新安装，本地数据会被清空。云端登记过的提醒仍在服务器，重新建一遍即可（后续可加"从云端恢复"） |
| iOS 26 以下装不了 | AlarmKit 需 iOS 26+；低于此版本只能退回通知 |

> 第一次构建失败 1–2 次很常见（CocoaPods 网络、Xcode SDK、依赖版本），把红色报错段落发出来就能定位。

---

## 7. 备选工具

- **AltStore / SideStore**：免费 Apple ID + AltServer（Windows），支持局域网自动续签，比手动重签省事，但配置更复杂
- **不推荐**：各种"企业证书/共享签名"服务，证书被吊销概率高，且可能把你的 Apple ID 和 IPA 交给第三方
