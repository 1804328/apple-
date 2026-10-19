/**
 * 用 PushPlus 发一条测试消息，验证 token 和通道是否可用。
 *
 * 用法（PowerShell）：
 *   $env:PUSHPLUS_TOKEN = "你的token"
 *   node scripts/dev-send.mjs "测试标题" "测试内容"
 *
 * 用法（CMD）：
 *   set PUSHPLUS_TOKEN=你的token && node scripts/dev-send.mjs "测试标题"
 */

const token = process.env.PUSHPLUS_TOKEN;
if (!token) {
  console.error('缺少 PUSHPLUS_TOKEN 环境变量');
  process.exit(1);
}

const title = process.argv[2] ?? '强提醒 · 通道测试';
const content =
  process.argv[3] ??
  `<p>这是一条测试消息，收到说明微信通道已打通。</p><p>${new Date().toLocaleString('zh-CN')}</p>`;

const res = await fetch('https://www.pushplus.plus/send', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token, title, content, template: 'html' }),
});

const data = await res.json().catch(() => null);
console.log('HTTP', res.status);
console.log(JSON.stringify(data, null, 2));

if (!res.ok || Number(data?.code) !== 200) {
  console.error('\n发送失败。常见原因：token 错误、未实名认证、当日额度用完。');
  process.exit(1);
}
console.log('\n✅ 已发送，去微信里看看是否收到。');
