# SDK 项目初始化脚本
# 使用方法: .\init-repo.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Element Selector SDK 项目初始化" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否在正确的目录
if (-not (Test-Path "package.json")) {
    Write-Host "错误: 请在 element-selector-sdk 根目录运行此脚本" -ForegroundColor Red
    exit 1
}

Write-Host "步骤 1: 初始化 Git 仓库..." -ForegroundColor Yellow
git init
if ($LASTEXITCODE -ne 0) {
    Write-Host "Git 初始化失败" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Git 仓库初始化成功" -ForegroundColor Green
Write-Host ""

Write-Host "步骤 2: 添加所有文件..." -ForegroundColor Yellow
git add .
Write-Host "✓ 文件已添加到暂存区" -ForegroundColor Green
Write-Host ""

Write-Host "步骤 3: 创建初始提交..." -ForegroundColor Yellow
git commit -m "Initial commit: Migrate SDK from win-element-selector-rs

- Complete imperative API with Element and Flow classes
- Full TypeScript support
- Enterprise-grade features (logging, error handling)
- Comprehensive documentation
- CI/CD configuration
- Examples and migration guide"
if ($LASTEXITCODE -ne 0) {
    Write-Host "提交失败" -ForegroundColor Red
    exit 1
}
Write-Host "✓ 初始提交创建成功" -ForegroundColor Green
Write-Host ""

Write-Host "步骤 4: 重命名分支为 main..." -ForegroundColor Yellow
git branch -M main
Write-Host "✓ 分支已重命名为 main" -ForegroundColor Green
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "本地 Git 仓库初始化完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "下一步操作：" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. 在 GitHub 上创建新仓库:" -ForegroundColor White
Write-Host "   - 访问: https://github.com/new" -ForegroundColor Gray
Write-Host "   - 仓库名: element-selector-sdk" -ForegroundColor Gray
Write-Host "   - 组织: element-selector（或你的组织）" -ForegroundColor Gray
Write-Host "   - 描述: Enterprise-grade UI Automation SDK for Windows" -ForegroundColor Gray
Write-Host "   - 选择: Public repository" -ForegroundColor Gray
Write-Host ""
Write-Host "2. 添加远程仓库并推送:" -ForegroundColor White
Write-Host "   git remote add origin https://github.com/YOUR_ORG/element-selector-sdk.git" -ForegroundColor Gray
Write-Host "   git push -u origin main" -ForegroundColor Gray
Write-Host ""
Write-Host "3. 发布到 npm:" -ForegroundColor White
Write-Host "   npm login" -ForegroundColor Gray
Write-Host "   npm publish --access public" -ForegroundColor Gray
Write-Host ""
Write-Host "详细文档请查看: MIGRATION_COMPLETE.md" -ForegroundColor Cyan
Write-Host ""
