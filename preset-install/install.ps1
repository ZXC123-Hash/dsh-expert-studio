# dsh-expert-studio 安装脚本 v2
# 安装两个预设（专家创造模式 + 专家协作模式）+ 渠道配置 + 种子专家数据
# 用法：在 PowerShell 中运行
#   iwr -useb "https://raw.githubusercontent.com/ZXC123-Hash/dsh-expert-studio/main/preset-install/install.ps1" | iex

$ErrorActionPreference = "Stop"
$DSH_HOME = "D:\deepdeek\App\data"
$REPO = "ZXC123-Hash/dsh-expert-studio"
$BRANCH = "main"
$BASE_URL = "https://raw.githubusercontent.com/$REPO/$BRANCH"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  dsh-expert-studio 安装脚本 v2" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 dsh 数据目录
if (-not (Test-Path $DSH_HOME)) {
    Write-Host "[错误] 未找到 dsh 数据目录: $DSH_HOME" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] dsh 数据目录: $DSH_HOME" -ForegroundColor Green

# 预设目录
$presetsDir = "$DSH_HOME\.agent-presets"
$createPresetDir = "$presetsDir\expert-create-mode"
$collabPresetDir = "$presetsDir\expert-collab-mode"

# 数据目录
$dataDir = "$DSH_HOME\expert-studio"
$poolDir = "$dataDir\pool"
$squadsDir = "$dataDir\squads"
$channelsDir = "$dataDir\channels"
$memoryDir = "$dataDir\memory-bus"

# 创建所有目录
$dirs = @($createPresetDir, $collabPresetDir, $poolDir, $squadsDir, $channelsDir, $memoryDir)
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
Write-Host ">>> 安装预设：专家创造模式..." -ForegroundColor Cyan
Download-File "$BASE_URL/preset-install/expert-create-mode/preset.yml" "$createPresetDir\preset.yml"
Download-File "$BASE_URL/preset-install/expert-create-mode/agent.cordis.yml" "$createPresetDir\agent.cordis.yml"

Write-Host ""
Write-Host ">>> 安装预设：专家协作模式..." -ForegroundColor Cyan
Download-File "$BASE_URL/preset-install/expert-collab-mode/preset.yml" "$collabPresetDir\preset.yml"
Download-File "$BASE_URL/preset-install/expert-collab-mode/agent.cordis.yml" "$collabPresetDir\agent.cordis.yml"

Write-Host ""
Write-Host ">>> 安装种子专家数据..." -ForegroundColor Cyan
Download-File "$BASE_URL/preset-install/expert-studio-data/pool/index.json" "$poolDir\index.json"
Download-File "$BASE_URL/preset-install/expert-studio-data/pool/expert-product-manager.yml" "$poolDir\expert-product-manager.yml"
Download-File "$BASE_URL/preset-install/expert-studio-data/pool/expert-architect.yml" "$poolDir\expert-architect.yml"
Download-File "$BASE_URL/preset-install/expert-studio-data/pool/expert-developer.yml" "$poolDir\expert-developer.yml"
Download-File "$BASE_URL/preset-install/expert-studio-data/pool/expert-security.yml" "$poolDir\expert-security.yml"
Download-File "$BASE_URL/preset-install/expert-studio-data/pool/expert-writer.yml" "$poolDir\expert-writer.yml"

Write-Host ""
Write-Host ">>> 安装专家团数据..." -ForegroundColor Cyan
Download-File "$BASE_URL/preset-install/expert-studio-data/squads/index.json" "$squadsDir\index.json"

Write-Host ""
Write-Host ">>> 安装模型渠道配置..." -ForegroundColor Cyan
Download-File "$BASE_URL/preset-install/expert-studio-data/channels/channels.yml" "$channelsDir\channels.yml"
Download-File "$BASE_URL/preset-install/expert-studio-data/channels/index.json" "$channelsDir\index.json"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  安装完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "已安装内容：" -ForegroundColor White
Write-Host "  预设：" -ForegroundColor White
Write-Host "    - expert-create-mode（专家创造模式）" -ForegroundColor White
Write-Host "    - expert-collab-mode（专家协作模式）" -ForegroundColor White
Write-Host "  种子专家：产品专家、架构师、开发专家、安全专家、文案专家" -ForegroundColor White
Write-Host "  模型渠道：6个渠道（SenseNova Flash/Pro、OpenCode Flash/Pro、AILZD、魔力范）" -ForegroundColor White
Write-Host ""
Write-Host "使用方法：" -ForegroundColor White
Write-Host "  1. 重启 dsh" -ForegroundColor White
Write-Host "  2. 在预设列表中选择「专家创造模式」→ 管理专家 & 测试渠道" -ForegroundColor White
Write-Host "  3. 在预设列表中选择「专家协作模式」→ 组建团队 & 协作执行" -ForegroundColor White
Write-Host ""
