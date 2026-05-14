$dst="c:\SHT-DATA\sht-platform\apps\mobile\app\reservation-edit"
$root = "$dst\page.tsx"
$subs = Get-ChildItem $dst -Directory | Where-Object { $_.Name -ne "_components" } | ForEach-Object { "$($_.FullName)\page.tsx" }
$all = @($root) + $subs
foreach ($f in $all) {
    if (-not (Test-Path $f)) { continue }
    $isRoot = ($f -eq $root)
    $importPath = if ($isRoot) { "./_components/MobileReservationLayout" } else { "../_components/MobileReservationLayout" }
    $c = Get-Content $f -Raw -Encoding UTF8
    $c = $c -replace "import ManagerLayout from '@/components/ManagerLayout';", "import ManagerLayout from '$importPath';"
    $c = $c -replace "/manager/reservation-edit", "/reservation-edit"
    $c = $c -replace "/manager/reservations", "/reservations"
    if ($isRoot) {
        $c = $c -replace "from '\.\./\.\./\.\./lib/fetchInBatches'", "from '../../lib/fetchInBatches'"
    }
    Set-Content -Path $f -Value $c -Encoding UTF8 -NoNewline
    Write-Host "OK $f"
}
