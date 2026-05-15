param(
  [Parameter(Mandatory = $true)]
  [string]$PublicKey,

  [Parameter(Mandatory = $true)]
  [string]$PrivateKey,

  [string]$Email = 'mailto:admin@stayhalong.com',

  [string]$PreviewBranch = '',

  [switch]$IncludeDevelopment
)

$ErrorActionPreference = 'Stop'

function Add-Env {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$Value,

    [Parameter(Mandatory = $true)]
    [ValidateSet('production', 'preview', 'development')]
    [string]$Target,

    [string]$Branch = ''
  )

  Write-Host "[vercel-env] $Name -> $Target" -ForegroundColor Cyan
  $valueArg = "--value=$Value"

  if ($Target -eq 'preview') {
    if (-not $Branch) {
      throw 'Preview target requires -PreviewBranch (example: feat/push-noti).'
    }
    vercel env add $Name preview $Branch $valueArg --yes --force --non-interactive
    return
  }

  if ($Target -eq 'development') {
    # Development does not support sensitive variables. Use --no-sensitive.
    vercel env add $Name development $valueArg --no-sensitive --yes --force --non-interactive
    return
  }

  vercel env add $Name production $valueArg --yes --force --non-interactive
}

Write-Host '[vercel-env] Upserting VAPID variables to Vercel...' -ForegroundColor Green

Add-Env -Name 'NEXT_PUBLIC_VAPID_PUBLIC_KEY' -Value $PublicKey -Target 'production'
Add-Env -Name 'VAPID_PRIVATE_KEY' -Value $PrivateKey -Target 'production'
Add-Env -Name 'VAPID_EMAIL' -Value $Email -Target 'production'

if ($PreviewBranch) {
  Add-Env -Name 'NEXT_PUBLIC_VAPID_PUBLIC_KEY' -Value $PublicKey -Target 'preview' -Branch $PreviewBranch
  Add-Env -Name 'VAPID_PRIVATE_KEY' -Value $PrivateKey -Target 'preview' -Branch $PreviewBranch
  Add-Env -Name 'VAPID_EMAIL' -Value $Email -Target 'preview' -Branch $PreviewBranch
}
else {
  Write-Warning '[vercel-env] Preview variables were skipped. Re-run with -PreviewBranch to apply Preview env vars.'
}

if ($IncludeDevelopment) {
  Add-Env -Name 'NEXT_PUBLIC_VAPID_PUBLIC_KEY' -Value $PublicKey -Target 'development'
  Add-Env -Name 'VAPID_PRIVATE_KEY' -Value $PrivateKey -Target 'development'
  Add-Env -Name 'VAPID_EMAIL' -Value $Email -Target 'development'
}

Write-Host '[vercel-env] Done.' -ForegroundColor Green
