$projectDir = "e:\production\meetwave-ai"
Set-Location $projectDir

$status = git status --porcelain
if (-not $status) {
    Write-Output '{"systemMessage": "Auto-push: nothing to commit"}'
    exit 0
}

git add -- . ":(exclude).env" ":(exclude).env.*" 2>$null
if (-not $?) {
    git add .
    git reset HEAD .env 2>$null
    git reset HEAD .env.local 2>$null
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$count = ($status -split "`n" | Where-Object { $_ -ne "" } | Measure-Object).Count
$msg = "Auto-save: $count file(s) updated [$timestamp]"

git commit -m $msg
git push origin master

$escaped = $msg -replace '"', '\"'
Write-Output "{`"systemMessage`": `"Auto-pushed to GitHub: $escaped`"}"
