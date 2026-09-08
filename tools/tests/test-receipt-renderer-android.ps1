param(
    [string]$Serial = '10.0.0.105:5555',
    [switch]$ProbeOnly
)

# Runs Android's real Canvas renderer in an isolated shell process. This does not
# install/launch apps, touch business data, send printer bytes or open the drawer.
$ErrorActionPreference = 'Stop'
function Assert-Command([string]$Step) {
    if ($LASTEXITCODE -ne 0) { throw "$Step failed with exit code $LASTEXITCODE" }
}
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Sdk = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } elseif ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$JavaHome = if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\javac.exe'))) { $env:JAVA_HOME } else { 'C:\Program Files\Android\openjdk\jdk-21.0.8' }
$Adb = Join-Path $Sdk 'platform-tools\adb.exe'
$BuildTools = Get-ChildItem (Join-Path $Sdk 'build-tools') -Directory |
    Where-Object { Test-Path (Join-Path $_.FullName 'd8.bat') } |
    Sort-Object { [version]($_.Name -replace '[^0-9.]', '') } -Descending |
    Select-Object -First 1 -ExpandProperty FullName
$PlatformJar = Get-ChildItem (Join-Path $Sdk 'platforms') -Filter 'android.jar' -Recurse |
    Sort-Object { [version](($_.Directory.Name -replace '^android-', '') -replace '[^0-9.]', '') } -Descending |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $BuildTools -or -not $PlatformJar -or -not (Test-Path $Adb)) { throw 'Android SDK is incomplete' }
if ($Serial -notmatch '^[A-Za-z0-9_.:-]+$') { throw 'Unexpected ADB serial format' }
& $Adb -s $Serial get-state
Assert-Command 'ADB connection (connect the explicitly selected terminal first)'

$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$RunDir = Join-Path $RepoRoot "test-results\receipt-review\$RunId"
$Classes = Join-Path $RunDir 'classes'
$DexDir = Join-Path $RunDir 'dex'
New-Item -ItemType Directory -Force -Path $RunDir, $Classes, $DexDir | Out-Null
$Sources = @(Join-Path $PSScriptRoot 'ReceiptRendererHarness.java')
if (-not $ProbeOnly) {
    $Renderer = Join-Path $RepoRoot 'android-elo-kiosk\app\src\main\java\com\panitas\pos\ReceiptRenderer.java'
    if (-not (Test-Path $Renderer)) { throw "Renderer not yet available: $Renderer" }
    $Sources += $Renderer
    $Sources += Join-Path $RepoRoot 'android-elo-kiosk\app\src\main\java\com\panitas\pos\UsbPrinterManager.java'
    $Sources += Join-Path $RepoRoot 'android-elo-kiosk\app\src\main\java\com\panitas\pos\BundledWebApp.java'
    $Sources += Join-Path $PSScriptRoot 'BundledWebAppHarness.java'
    $Sources += Join-Path $PSScriptRoot 'stubs\R.java'
    $Fixtures = Join-Path $RunDir 'fixtures'
    & node (Join-Path $PSScriptRoot 'generate-receipt-fixtures.mjs') $Fixtures
    Assert-Command 'Generate synthetic fixtures from production receipt builders'
}
$PreviousJavaHome = $env:JAVA_HOME
$PreviousPath = $env:PATH
try {
    $env:JAVA_HOME = $JavaHome
    $env:PATH = "$JavaHome\bin;$PreviousPath"
    & (Join-Path $JavaHome 'bin\javac.exe') -encoding UTF-8 -source 8 -target 8 -cp $PlatformJar -d $Classes $Sources
    Assert-Command 'Java compilation'
    $ClassFiles = Get-ChildItem $Classes -Filter '*.class' -Recurse | Select-Object -ExpandProperty FullName
    & (Join-Path $BuildTools 'd8.bat') --min-api 26 --lib $PlatformJar --output $DexDir $ClassFiles
    Assert-Command 'DEX conversion'
    $Jar = Join-Path $RunDir 'receipt-renderer-tests.jar'
    & (Join-Path $JavaHome 'bin\jar.exe') cf $Jar -C $DexDir classes.dex
    Assert-Command 'Harness packaging'
} finally {
    $env:JAVA_HOME = $PreviousJavaHome
    $env:PATH = $PreviousPath
}

$RemoteDir = "/data/local/tmp/panitas-receipt-review/$RunId"
& $Adb -s $Serial shell mkdir -p "$RemoteDir/output"
Assert-Command 'Create isolated remote test directory'
& $Adb -s $Serial push $Jar "$RemoteDir/harness.jar"
Assert-Command 'Transfer harness'
& $Adb -s $Serial push (Join-Path $RepoRoot 'public\receipt_logo.png') "$RemoteDir/receipt_logo.png"
Assert-Command 'Transfer print logo'
$Mode = if ($ProbeOnly) { ' --probe' } else { '' }
if (-not $ProbeOnly) {
    & $Adb -s $Serial push $Fixtures "$RemoteDir/fixtures"
    Assert-Command 'Transfer generated fixtures'
    $Mode = " --fixtures $RemoteDir/fixtures"
    $LocalApk = Join-Path $RepoRoot 'android-elo-kiosk\build_temp\LosPanitas-Elo-POS.apk'
    if (Test-Path $LocalApk) {
        & $Adb -s $Serial push $LocalApk "$RemoteDir/shell.apk"
        Assert-Command 'Transfer signed shell for read-only asset tests'
        $Mode += " --apk $RemoteDir/shell.apk"
    }
}
& $Adb -s $Serial shell "CLASSPATH=$RemoteDir/harness.jar app_process /system/bin com.panitas.pos.tests.ReceiptRendererHarness $RemoteDir/output $RemoteDir/receipt_logo.png$Mode"
$RenderExitCode = $LASTEXITCODE
& $Adb -s $Serial pull "$RemoteDir/output/." $RunDir
Assert-Command 'Retrieve rendered evidence'
Write-Host "Local evidence: $RunDir"
Write-Host "Isolated remote evidence: $RemoteDir"
if ($RenderExitCode -ne 0) { throw "Android renderer tests failed with exit code $RenderExitCode; inspect the saved report" }
