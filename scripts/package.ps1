# Smart Bookmarks 打包脚本（PowerShell）
# 适用于 Windows

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$OutputDir = Join-Path $ProjectRoot "dist"
$PackageName = "smart-bookmarks.zip"
$PackagePath = Join-Path $OutputDir $PackageName

Write-Host "🚀 Smart Bookmarks 打包脚本" -ForegroundColor Cyan
Write-Host ""

# 步骤 1: 构建项目
Write-Host "1. 构建项目..." -ForegroundColor Cyan
Set-Location $ProjectRoot
npm run build
Write-Host "✓ 构建完成" -ForegroundColor Green
Write-Host ""

# 步骤 2: 创建输出目录
Write-Host "2. 创建输出目录..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Write-Host "✓ 输出目录: $OutputDir" -ForegroundColor Green
Write-Host ""

# 步骤 3: 创建临时目录
Write-Host "3. 准备打包文件..." -ForegroundColor Cyan
$TempDir = Join-Path $OutputDir "temp"
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

# 复制需要的文件
Copy-Item -Path "manifest.json" -Destination $TempDir -Force
Copy-Item -Path "icons" -Destination $TempDir -Recurse -Force
Copy-Item -Path "src" -Destination $TempDir -Recurse -Force
Copy-Item -Path "assets" -Destination $TempDir -Recurse -Force
if (Test-Path "LICENSE") {
    Copy-Item -Path "LICENSE" -Destination $TempDir -Force
}

Write-Host "✓ 文件准备完成" -ForegroundColor Green
Write-Host ""

# 步骤 4: 打包成 ZIP
Write-Host "4. 正在打包..." -ForegroundColor Cyan
Compress-Archive -Path "$TempDir\*" -DestinationPath $PackagePath -Force

# 清理临时目录
Remove-Item -Path $TempDir -Recurse -Force

Write-Host "✓ 打包完成: $PackagePath" -ForegroundColor Green

# 显示文件大小
$Size = (Get-Item $PackagePath).Length / 1MB
Write-Host "   文件大小: $($Size.ToString('0.00')) MB" -ForegroundColor Cyan
Write-Host ""

# 验证
Write-Host "5. 验证包文件..." -ForegroundColor Cyan
if ($Size -gt 128) {
    Write-Host "⚠️  警告：包大小超过 128MB，Chrome Web Store 可能拒绝上传" -ForegroundColor Red
} elseif ($Size -gt 64) {
    Write-Host "⚠️  提示：包大小超过 64MB，建议优化" -ForegroundColor Yellow
} else {
    Write-Host "✓ 包大小符合 Chrome Web Store 要求" -ForegroundColor Green
}

Write-Host ""
Write-Host "✅ 打包完成！" -ForegroundColor Green
Write-Host ""
Write-Host "📦 包文件: $PackagePath" -ForegroundColor Cyan
Write-Host ""
Write-Host "下一步:" -ForegroundColor Yellow
Write-Host "1. 在浏览器中测试加载（解压后）"
Write-Host "2. 上传到 Chrome Web Store Developer Dashboard"
Write-Host "3. 填写商店信息并提交审核"
