$files = @(
  'c:\SHT-DATA\sht-platform\apps\mobile\app\reservation-edit\sht\page.tsx',
  'c:\SHT-DATA\sht-platform\apps\mobile\app\reservation-edit\airport\page.tsx',
  'c:\SHT-DATA\sht-platform\apps\mobile\app\reservation-edit\tour\page.tsx'
)
foreach ($f in $files) {
  Write-Host "=== $f ==="
  $b = [System.IO.File]::ReadAllBytes($f)
  $first = $b[0..([Math]::Min(5,$b.Length-1))]
  Write-Host ("FirstBytes: " + ([BitConverter]::ToString($first)))
  $t = [System.IO.File]::ReadAllText($f)
  $m = [regex]::Matches($t, "[\uFEFF\u200B\u200C\u200D\u2028\u2029]")
  Write-Host ("HiddenCount: " + $m.Count)
  foreach ($x in $m) {
    $idx = $x.Index
    $line = ($t.Substring(0,$idx) -split "`n").Count
    Write-Host ("  U+" + ('{0:X4}' -f [int][char]$x.Value) + " idx=$idx line=$line")
  }
}
