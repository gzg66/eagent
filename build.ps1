# 保存当前工作目录
$originPath = Get-Location

try {
    Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
    npm install --ignore-scripts
    npm run build

    Set-Location packages/web
    npm run build
}
finally {
    # 无论成功失败，切回最初目录
    Set-Location $originPath
}