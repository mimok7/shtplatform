$ErrorActionPreference = 'Stop'

function Get-Text([string]$path) { Get-Content $path -Raw -Encoding UTF8 }
function Save-Text([string]$path, [string]$text) { Set-Content -Path $path -Value $text -Encoding UTF8 -NoNewline }

$base = 'c:\SHT-DATA\sht-platform\apps\mobile\app\reservation-edit'
$targets = @(
    "$base\airport\page.tsx",
    "$base\hotel\page.tsx",
    "$base\rentcar\page.tsx",
    "$base\tour\page.tsx",
    "$base\sht\page.tsx",
    "$base\vehicle\page.tsx",
    "$base\cruise\page.tsx",
    "$base\package\page.tsx"
)

foreach ($f in $targets) {
    if (-not (Test-Path $f)) { continue }
    $c = Get-Text $f

    # Remove customer info card: card with <User ...> in h3
    $c = [regex]::Replace(
        $c,
        '<div className="bg-white rounded-lg shadow-sm p-6">\s*<h3[^>]*>\s*<User className="w-5 h-5(?: [^"]+)?"\s*/>[\s\S]*?</h3>[\s\S]*?</div>\s*(?=<div className="bg-white rounded-lg shadow-sm p-6">|\{\/\*|\{packageDetail)',
        '',
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )

    # Remove status/date/title segment before additional-fee section
    $c = [regex]::Replace(
        $c,
        '<div className="space-y-3">[\s\S]*?(<div className="(?:pt-4 mt-4|mt-4 pt-4) border-t border-gray-100 space-y-4">)',
        '<div className="space-y-3">`n                                $1',
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )

    # Remove package status select row (value=formData.re_status)
    $c = [regex]::Replace(
        $c,
        '<div>\s*<label[^>]*>[^<]*</label>\s*<select\s*value=\{formData\.re_status\}[\s\S]*?</select>\s*</div>',
        '',
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )

    Save-Text $f $c
    Write-Host "Updated: $f"
}

Write-Host 'Done'
