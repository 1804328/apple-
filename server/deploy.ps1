# 一键部署：Cloudflare Worker + D1 + 企业微信通道
# 用法（在 server 目录）：
#   1) npx --yes wrangler@4 login
#   2) powershell -ExecutionPolicy Bypass -File .\deploy.ps1

# 注意：不要用全局 Stop。wrangler 会往 stderr 打 warning，
# 在 Stop 模式下会被 PowerShell 当成致命错误而中断脚本。
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

Set-Location $PSScriptRoot

$TOML = Join-Path $PSScriptRoot 'wrangler.toml'
$D1_NAME = 'strong-reminder'
$DEFAULT_API_KEY = '829393b8066a414c909e31d611613fad5da083c158e346ccada619c50b788965'

function Step($text) {
  Write-Host ""
  Write-Host "== $text ==" -ForegroundColor Cyan
}

function Run($cmd, [switch]$AllowFail) {
  Write-Host "> $cmd" -ForegroundColor DarkGray
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $out = Invoke-Expression "$cmd 2>&1" | Out-String
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  Write-Host $out
  if (-not $AllowFail -and $code -ne 0) {
    throw "命令失败（exit $code）：$cmd"
  }
  return $out
}

function Write-Utf8NoBom($path, $text) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $text, $enc)
}

# ---------------------------------------------------------------- 0. 环境
Step "0/5 检查 wrangler 与登录状态"
if (-not (Test-Path $TOML)) {
  throw "找不到 wrangler.toml，请把本脚本放在 server 目录下运行"
}

$who = Run "npx --yes wrangler@4 whoami" -AllowFail
if ($who -match 'not authenticated' -or $who -match 'not logged in' -or $who -match 'You are not') {
  Write-Host "尚未登录 Cloudflare。先执行： npx --yes wrangler@4 login" -ForegroundColor Yellow
  exit 1
}

# ---------------------------------------------------------------- 1. D1
Step "1/5 准备 D1 数据库"
$tomlText = Get-Content $TOML -Raw -Encoding UTF8

if ($tomlText -match 'REPLACE_ME') {
  $create = Run "npx --yes wrangler@4 d1 create $D1_NAME" -AllowFail
  if ($create -match '"database_id"\s*:\s*"([0-9a-fA-F-]{36})"') {
    $dbId = $Matches[1]
  } elseif ($create -match 'database_id\s*=\s*"([0-9a-fA-F-]{36})"') {
    $dbId = $Matches[1]
  } else {
    throw "没能从 d1 create 输出解析出 database_id。请打开 Cloudflare 控制台 D1 页面复制 id，填进 wrangler.toml 的 database_id 后重跑"
  }
  Write-Host "database_id = $dbId" -ForegroundColor Green
  $tomlText = $tomlText -replace 'database_id\s*=\s*"[^"]*"', ('database_id = "' + $dbId + '"')
  Write-Utf8NoBom $TOML $tomlText
} else {
  Write-Host "wrangler.toml 里已有 database_id，跳过创建" -ForegroundColor Green
}

# ---------------------------------------------------------------- 2. 建表
Step "2/5 建表（D1 建表期间数据库会短暂不可用，正常）"
Run "npx --yes wrangler@4 d1 execute $D1_NAME --remote --file=./schema.sql --yes" | Out-Null

# ---------------------------------------------------------------- 3. 首次部署
Step "3/5 首次部署（先让 Worker 存在，才能写 secret）"
$deployOut = Run "npx --yes wrangler@4 deploy"

$workerUrl = $null
if ($deployOut -match '(https://[a-z0-9.-]+\.workers\.dev)') {
  $workerUrl = $Matches[1]
}
if (-not $workerUrl) {
  throw "没能从 deploy 输出解析出 workers.dev 地址，请看上面日志"
}
Write-Host "Worker 地址：$workerUrl" -ForegroundColor Green

# ---------------------------------------------------------------- 4. 密钥
Step "4/5 配置密钥"
Write-Host "API_KEY 直接回车用默认生成值即可（App 里也要填同一个）。"
$apiKey = Read-Host "API_KEY（回车用默认）"
if ([string]::IsNullOrWhiteSpace($apiKey)) { $apiKey = $DEFAULT_API_KEY }

Write-Host ""
Write-Host "企业微信里：群 -> ... -> 群机器人 -> 复制 Webhook 地址"
Write-Host "格式：https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
$webhook = (Read-Host "粘贴企业微信 Webhook").Trim()
if ($webhook -notmatch '^https://qyapi\.weixin\.qq\.com/cgi-bin/webhook/send\?key=') {
  Write-Host "看起来不像企业微信 Webhook，仍继续写入，稍后用日志排查" -ForegroundColor Yellow
}

$tmpSecrets = Join-Path $PSScriptRoot '.secrets.tmp.json'
Write-Utf8NoBom $tmpSecrets ((@{ API_KEY = $apiKey; WECOM_WEBHOOK = $webhook } | ConvertTo-Json))
Run "npx --yes wrangler@4 secret bulk $tmpSecrets" | Out-Null
Remove-Item $tmpSecrets -Force

# ---------------------------------------------------------------- 5. 回填域名再部署
Step "5/5 回填 PUBLIC_BASE_URL 并重新部署"
$tomlText = Get-Content $TOML -Raw -Encoding UTF8
$tomlText = $tomlText -replace 'PUBLIC_BASE_URL\s*=\s*"[^"]*"', ('PUBLIC_BASE_URL = "' + $workerUrl + '"')
Write-Utf8NoBom $TOML $tomlText

Run "npx --yes wrangler@4 deploy" | Out-Null

Step "验证"
try {
  $health = Invoke-RestMethod -Uri "$workerUrl/health" -TimeoutSec 15
  Write-Host ("/health => " + ($health | ConvertTo-Json -Compress)) -ForegroundColor Green
} catch {
  Write-Host "健康检查失败：$($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "完成。把下面两项填进 App 设置页：" -ForegroundColor Cyan
Write-Host "  服务器地址：$workerUrl"
Write-Host "  API Key ：$apiKey"
