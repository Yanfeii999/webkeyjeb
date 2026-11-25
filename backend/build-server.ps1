param(
    [string]$AdminPassword = "Jebtool@2026",
    [string]$GasUrl = "",
    [string]$GasSecret = ""
)

$ErrorActionPreference = 'Stop'

$rootDir  = 'c:\Users\ADMIN\Documents\AD-Tool\webkeyjeb'
$backDir  = Join-Path $rootDir 'backend'
$tmplPath = Join-Path $backDir 'ServerHost.tmpl.cs'
$icoPath  = 'c:\Users\ADMIN\Documents\AD-Tool\Jebtool.ico'
$csc      = "$env:windir\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

# Read GAS_WEBAPP_URL & GAS_API_SECRET from backend\.env.local if not passed as params
$envLocal = Join-Path $backDir '.env.local'
if (Test-Path -LiteralPath $envLocal) {
    foreach ($line in (Get-Content -LiteralPath $envLocal)) {
        if ($line -match '^\s*GAS_WEBAPP_URL\s*=\s*(.+)$' -and -not $GasUrl) { $GasUrl = $Matches[1].Trim() }
        if ($line -match '^\s*GAS_API_SECRET\s*=\s*(.+)$' -and -not $GasSecret) { $GasSecret = $Matches[1].Trim() }
    }
}
if (-not $GasUrl -or -not $GasSecret) {
    throw "Thiếu GAS_WEBAPP_URL hoặc GAS_API_SECRET! Hãy tạo file backend\.env.local hoặc truyền -GasUrl và -GasSecret."
}
$gasUrl    = $GasUrl
$gasSecret = $GasSecret

# Hash Admin Password (SHA-256)
$sha = [System.Security.Cryptography.SHA256]::Create()
$pwHash = ([BitConverter]::ToString($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($AdminPassword)))).Replace('-', '').ToLowerInvariant()
$sha.Dispose()

$rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
function Get-RandIdent([string]$prefix = '_0x') {
    $b = New-Object byte[] 4
    $rng.GetBytes($b)
    return $prefix + ([BitConverter]::ToString($b).Replace('-', '').ToLowerInvariant())
}

$nsName  = Get-RandIdent '_0x'
$clsName = Get-RandIdent '_0x'
$mDec    = Get-RandIdent '_0x'

function Make-EncStr([string]$s) {
    $utf8 = [System.Text.Encoding]::UTF8.GetBytes($s)
    $kb = New-Object byte[] 1; $rng.GetBytes($kb); $k = $kb[0] -bor 0x05
    $enc = for ($i = 0; $i -lt $utf8.Length; $i++) {
        "0x{0:X2}" -f ($utf8[$i] -bxor $k -bxor (($i * 23 + 7) -band 0xFF))
    }
    return "$mDec(new byte[]{$($enc -join ',')}, 0x$('{0:X2}' -f $k))"
}

$csCode = [System.IO.File]::ReadAllText($tmplPath, [System.Text.Encoding]::UTF8)
$csCode = $csCode.Replace('__NS__', $nsName)
$csCode = $csCode.Replace('__CLS__', $clsName)
$csCode = $csCode.Replace('__DEC__', $mDec)
$csCode = $csCode.Replace('__S_GASURL__', (Make-EncStr $gasUrl))
$csCode = $csCode.Replace('__S_GASSEC__', (Make-EncStr $gasSecret))
$csCode = $csCode.Replace('__S_ADMINHASH__', (Make-EncStr $pwHash))

$genCs = Join-Path $backDir 'ServerHost.generated.cs'
[System.IO.File]::WriteAllText($genCs, $csCode, (New-Object System.Text.UTF8Encoding($true)))

$exeOut = Join-Path $backDir 'JebtoolWebKeyServer.exe'
& $csc /nologo /target:exe /optimize+ /debug- /platform:anycpu `
    "/out:$exeOut" `
    "/win32icon:$icoPath" `
    $genCs
if ($LASTEXITCODE -ne 0) { throw "Failed to compile JebtoolWebKeyServer.exe" }
Remove-Item -LiteralPath $genCs -Force -ErrorAction SilentlyContinue
Write-Host "[OK] Compiled obfuscated C# Backend Server: $exeOut ($((Get-Item $exeOut).Length) bytes)"
