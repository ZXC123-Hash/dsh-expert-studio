# dsh-expert-studio 安装脚本
# 从 GitHub 下载预设文件并安装到 dsh 数据目录
# 用法：在 PowerShell 中运行此脚本

$ErrorActionPreference = "Stop"
$DSH_HOME = "D:\deepdeek\App\data"
$REPO = "ZXC123-Hash/dsh-expert-studio"
$BRANCH = "main"
$BASE_URL = "https://raw.githubusercontent.com/$REPO/$BRANCH"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  dsh-expert-studio 安装脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 dsh 数据目录
if (-not (Test-Path $DSH_HOME)) {
    Write-Host "[错误] 未找到 dsh 数据目录: $DSH_HOME" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] dsh 数据目录: $DSH_HOME" -ForegroundColor Green

# 创建预设目录
$presetDir = "$DSH_HOME\.agent-presets\expert-studio"
$dataDir = "$DSH_HOME\expert-studio"
$poolDir = "$dataDir\pool"
$squadsDir = "$dataDir\squads"

$dirs = @($presetDir, $poolDir, $squadsDir)
foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        Write-Host "[创建] $dir" -ForegroundColor Yellow
    } else {
        Write-Host "[已存在] $dir" -ForegroundColor DarkGray
    }
}

# 下载文件函数
function Download-File {
    param([string]$Url, [string]$Dest)
    try {
        Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing
        Write-Host "[下载] $Dest" -ForegroundColor Green
    } catch {
        Write-Host "[错误] 下载失败: $Url" -ForegroundColor Red
        Write-Host "  $_" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "正在下载预设文件..." -ForegroundColor Cyan

# 下载预设文件
Download-File "$BASE_URL/preset-install/expert-studio/preset.yml" "$presetDir\preset.yml"
Download-File "$BASE_URL/preset-install/expert-studio/agent.cordis.yml" "$presetDir\agent.cordis.yml"

Write-Host ""
Write-Host "正在下载种子专家数据..." -ForegroundColor Cyan

# 下载专家池数据
Download-File "$BASE_URL/preset-install/expert-studio-data/pool/index.json" "$poolDir\index.json"
Download-File "$BASE_URL/preset-install/expert-studio-data/pool/expert-product-manager.yml" "$poolDir\expert-product-manager.yml"
Download-File "$BASE_URL/preset-install/expert-studio-data/pool/expert-architect.yml" "$poolDir\expert-architect.yml"
Download-File "$BASE_URL/preset-install/expert-studio-data/pool/expert-developer.yml" "$poolDir\expert-developer.yml"
Download-File "$BASE_URL/preset-install/expert-studio-data/pool/expert-security.yml" "$poolDir\expert-security.yml"
Download-File "$BASE_URL/preset-install/expert-studio-data/pool/expert-writer.yml" "$poolDir\expert-writer.yml"

# 下载专家团索引
Download-File "$BASE_URL/preset-install/expert-studio-data/squads/index.json" "$squadsDir\index.json"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  安装完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "已安装内容：" -ForegroundColor White
Write-Host "  - 预设: expert-studio（专家工作室）" -ForegroundColor White
Write-Host "  - 种子专家: 产品专家、架构师、开发专家、安全专家、文案专家" -ForegroundColor White
Write-Host ""
Write-Host "使用方法：" -ForegroundColor White
Write-Host "  1. 重启 dsh" -ForegroundColor White
Write-Host "  2. 在预设列表中选择「专家工作室」" -ForegroundColor White
Write-Host "  3. 开始对话，说「列出所有专家」或「帮我创建一个专家」" -ForegroundColor White
Write-Host ""
