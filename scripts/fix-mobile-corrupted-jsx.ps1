$files = @(
  'c:\SHT-DATA\sht-platform\apps\mobile\app\reservation-edit\airport\page.tsx',
  'c:\SHT-DATA\sht-platform\apps\mobile\app\reservation-edit\hotel\page.tsx',
  'c:\SHT-DATA\sht-platform\apps\mobile\app\reservation-edit\rentcar\page.tsx',
  'c:\SHT-DATA\sht-platform\apps\mobile\app\reservation-edit\tour\page.tsx',
  'c:\SHT-DATA\sht-platform\apps\mobile\app\reservation-edit\sht\page.tsx',
  'c:\SHT-DATA\sht-platform\apps\mobile\app\reservation-edit\vehicle\page.tsx',
  'c:\SHT-DATA\sht-platform\apps\mobile\app\reservation-edit\cruise\page.tsx'
)

$badComment1 = '{/* 우측: 추가요금을 조정하면 최종 합계를 바로 확인할 수 있습니다'
$goodComment1 = '{/* 우측: 요금/추가내역 */}'

$badComment2 = '{/* 추가요금을 조정하면 최종 합계를 바로 확인할 수 있습니다'
$goodComment2 = '{/* 요금/추가내역 */}'

$badH3 = '<h3 className="text-lg font-medium text-gray-900 mb-4">추가요금을 조정하면 최종 합계를 바로 확인할 수 있습니다'
$goodH3 = '<h3 className="text-lg font-medium text-gray-900 mb-4">요금/추가내역</h3>'

$badBacktickN = '<div className="space-y-3">`n                                <div'
$goodBacktickN = "<div className=`"space-y-3`">`r`n                                <div"

foreach ($f in $files) {
  if (-not (Test-Path $f)) { Write-Host "SKIP missing $f"; continue }
  $orig = [System.IO.File]::ReadAllText($f)
  $t = $orig
  $t = $t.Replace($badComment1, $goodComment1)
  $t = $t.Replace($badComment2, $goodComment2)
  $t = $t.Replace($badH3, $goodH3)
  $t = $t.Replace($badBacktickN, $goodBacktickN)
  if ($t -ne $orig) {
    [System.IO.File]::WriteAllText($f, $t, [System.Text.UTF8Encoding]::new($false))
    Write-Host "FIXED $f"
  } else {
    Write-Host "no-change $f"
  }
}
