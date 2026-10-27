[CmdletBinding()]
param(
  [ValidatePattern('^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]+$')]
  [string]$Repository = 'TheBabyKingdom/velvet-music'
)

$ErrorActionPreference = 'Stop'
$sourceDirectory = Split-Path -Parent $PSScriptRoot
$previousDirectory = Get-Location

function Invoke-CheckedGit {
  param([string[]]$GitArguments)
  & git @GitArguments
  if ($LASTEXITCODE -ne 0) { throw ('Git failed: ' + ($GitArguments -join ' ')) }
}

try {
  Set-Location -LiteralPath $sourceDirectory
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI is required. Install it from https://cli.github.com, sign in with gh auth login, then run this helper again.'
  }
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'Git is required. Install Git for Windows from https://git-scm.com/download/win, then run this helper again.'
  }
  & gh auth status --hostname github.com *> $null
  if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not signed in. Run gh auth login in your own terminal, then run this helper again.' }
  $profileText = & gh api user
  if ($LASTEXITCODE -ne 0) { throw 'Could not verify the signed-in GitHub account.' }
  $profile = $profileText | ConvertFrom-Json
  $owner, $repositoryName = $Repository.Split('/', 2)
  if ($profile.login -ine $owner) {
    throw "The requested owner is $owner, but GitHub CLI is signed in as $($profile.login). This helper only creates a repository in the signed-in personal account."
  }
  & gh repo view $Repository --json nameWithOwner --jq .nameWithOwner *> $null
  if ($LASTEXITCODE -eq 0) { throw "The repository $Repository already exists. No files were changed. This helper will not overwrite an existing repository." }
  if (Test-Path -LiteralPath (Join-Path $sourceDirectory '.git')) {
    throw 'This folder already has Git history. Use a fresh extracted Velvet source archive, or publish the existing checkout manually. No history will be overwritten.'
  }
  $manifestPath = Join-Path $sourceDirectory 'package.json'
  if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'Run this helper from the original Velvet source folder.' }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $version = [string]$manifest.version
  if ($version -notmatch '^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$') { throw 'The package version is not a supported release version.' }
  $tag = 'v' + $version
  $executable = Join-Path $sourceDirectory "release\Velvet-$version-Windows-x64.exe"
  $notesFile = Join-Path $sourceDirectory 'docs\release-notes.md'
  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "The Windows build is missing. Build it with pnpm run dist, or copy the supplied Velvet-$version-Windows-x64.exe into this source folder's release directory, then try again."
  }
  if (-not (Test-Path -LiteralPath $notesFile -PathType Leaf)) { throw 'The release-notes file is missing.' }
  $checksumFile = Join-Path $sourceDirectory 'release\SHA256SUMS.txt'
  $digest = (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content -LiteralPath $checksumFile -Value ($digest + '  ' + (Split-Path -Leaf $executable)) -Encoding utf8

  # Prepare a reviewable local source commit before creating anything on GitHub.
  Invoke-CheckedGit -GitArguments @('init', '-b', 'main')
  $configuredName = & git config user.name
  if (-not $configuredName) { Invoke-CheckedGit -GitArguments @('config', 'user.name', [string]$profile.login) }
  $configuredEmail = & git config user.email
  if (-not $configuredEmail) {
    $noReply = [string]$profile.id + '+' + [string]$profile.login + '@users.noreply.github.com'
    Invoke-CheckedGit -GitArguments @('config', 'user.email', $noReply)
  }
  $sourcePaths = @('src', 'electron', 'assets', 'scripts', 'tests', 'docs', '.github', 'README.md', 'LICENSE', '.env.example', '.gitignore', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml') | Where-Object { Test-Path -LiteralPath (Join-Path $sourceDirectory $_) }
  Invoke-CheckedGit -GitArguments (@('add', '--') + $sourcePaths)
  Invoke-CheckedGit -GitArguments @('commit', '-m', "Release Velvet $version")
  Write-Host "Creating private GitHub repository $Repository and publishing its source..."
  & gh repo create $Repository --private --source . --remote origin --push
  if ($LASTEXITCODE -ne 0) { throw 'GitHub repository creation or source push failed. The local commit is preserved; inspect it before retrying manually.' }
  Invoke-CheckedGit -GitArguments @('tag', $tag)
  Invoke-CheckedGit -GitArguments @('push', 'origin', $tag)
  & gh release create $tag $executable $checksumFile --repo $Repository --verify-tag --title "Velvet $version" --notes-file $notesFile
  if ($LASTEXITCODE -ne 0) { throw 'The source was published, but release upload failed. Use gh release view to inspect the current release before retrying the upload.' }
  Write-Host "Published: https://github.com/$Repository"
  Write-Host "Download: https://github.com/$Repository/releases/tag/$tag"
  Write-Host 'The repository is private. Only people with repository access can view the source or release.'
} finally {
  Set-Location -LiteralPath $previousDirectory
}
