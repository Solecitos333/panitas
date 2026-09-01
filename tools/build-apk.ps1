# Script para compilar LosPanitas-Elo-POS.apk usando Android SDK
$ErrorActionPreference = "Stop"

function Assert-NativeCommand([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Step falló con código $LASTEXITCODE. No se generará ni publicará una APK incompleta."
    }
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$JavaHome = if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME "bin\javac.exe"))) {
    $env:JAVA_HOME
} else {
    "C:\Program Files\Android\openjdk\jdk-21.0.8"
}
if (-not (Test-Path (Join-Path $JavaHome "bin\javac.exe"))) {
    throw "No se encontró Java. Define JAVA_HOME con un JDK compatible."
}
$env:JAVA_HOME = $JavaHome
$env:PATH = "$JavaHome\bin;$env:PATH"

Add-Type -AssemblyName System.IO.Compression.FileSystem

$SdkDir = if ($env:ANDROID_SDK_ROOT) {
    $env:ANDROID_SDK_ROOT
} elseif ($env:ANDROID_HOME) {
    $env:ANDROID_HOME
} else {
    Join-Path $env:LOCALAPPDATA "Android\Sdk"
}
if (-not (Test-Path $SdkDir)) {
    throw "No se encontró Android SDK. Define ANDROID_SDK_ROOT."
}
$BuildTools = Get-ChildItem (Join-Path $SdkDir "build-tools") -Directory |
    Sort-Object { [version]($_.Name -replace '[^0-9.]', '') } -Descending |
    Where-Object { Test-Path (Join-Path $_.FullName "aapt2.exe") } |
    Select-Object -First 1 -ExpandProperty FullName
$PlatformJar = Get-ChildItem (Join-Path $SdkDir "platforms") -Filter "android.jar" -Recurse |
    Sort-Object { [version](($_.Directory.Name -replace '^android-', '') -replace '[^0-9.]', '') } -Descending |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $BuildTools -or -not $PlatformJar) {
    throw "Faltan Build Tools o una plataforma Android instalados en $SdkDir."
}
$VersionCode = 10
$VersionName = "1.4.0-rc.3"
$Javac = "$JavaHome\bin\javac.exe"

$ProjectDir = Join-Path $RepoRoot "android-elo-kiosk"
$AppDir = "$ProjectDir\app"
$WorkDir = "$ProjectDir\build_temp"
$SigningDir = "$ProjectDir\signing"
$Keystore = "$SigningDir\los-panitas-pos.keystore"
$OutDir = Join-Path $RepoRoot "public\downloads"
$KeyAlias = if ($env:PANITAS_KEY_ALIAS) { $env:PANITAS_KEY_ALIAS } else { "androiddebugkey" }

if ([string]::IsNullOrWhiteSpace($env:PANITAS_KEYSTORE_PASSWORD)) {
    throw "Define PANITAS_KEYSTORE_PASSWORD antes de compilar. La clave nunca debe guardarse en Git."
}
if ([string]::IsNullOrWhiteSpace($env:PANITAS_KEY_PASSWORD)) {
    $env:PANITAS_KEY_PASSWORD = $env:PANITAS_KEYSTORE_PASSWORD
}

New-Item -ItemType Directory -Force -Path $SigningDir | Out-Null
if (-not (Test-Path $Keystore)) {
    throw "Falta la llave de firma $Keystore. Restaura la llave original; no generes otra o Android rechazará las actualizaciones."
}
if (Test-Path $WorkDir) { Remove-Item -Recurse -Force $WorkDir }
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host "1. Compilando recursos con aapt2..."
$ResDir = "$AppDir\src\main\res"
& "$BuildTools\aapt2.exe" compile --dir $ResDir -o "$WorkDir\res.zip"
Assert-NativeCommand "La compilación de recursos"

Write-Host "2. Enlazando paquete APK..."
$Manifest = "$AppDir\src\main\AndroidManifest.xml"
& "$BuildTools\aapt2.exe" link -I $PlatformJar --manifest $Manifest "$WorkDir\res.zip" -o "$WorkDir\app-unaligned.apk" --java "$WorkDir\gen" --min-sdk-version 21 --target-sdk-version 27 --version-code $VersionCode --version-name $VersionName
Assert-NativeCommand "El enlace del APK"

Write-Host "3. Compilando clases Java..."
$JavaSrc = Get-ChildItem "$AppDir\src\main\java" -Filter "*.java" -Recurse | Select-Object -ExpandProperty FullName
if (Test-Path "$WorkDir\gen") {
    $GenSrc = Get-ChildItem "$WorkDir\gen" -Filter "*.java" -Recurse | Select-Object -ExpandProperty FullName
    if ($GenSrc) { $JavaSrc = @($JavaSrc) + @($GenSrc) }
}
$ClassesDir = "$WorkDir\classes"
New-Item -ItemType Directory -Force -Path $ClassesDir | Out-Null
& $Javac -cp $PlatformJar -d $ClassesDir $JavaSrc
Assert-NativeCommand "La compilación Java"

Write-Host "4. Convirtiendo a DEX con d8..."
$ClassFiles = Get-ChildItem $ClassesDir -Filter "*.class" -Recurse | Select-Object -ExpandProperty FullName
& "$BuildTools\d8.bat" --lib $PlatformJar --output $WorkDir $ClassFiles
Assert-NativeCommand "La conversión DEX"

Write-Host "5. Agregando classes.dex al APK con jar.exe..."
$JarExe = "$JavaHome\bin\jar.exe"
Push-Location $WorkDir
& $JarExe uf "app-unaligned.apk" "classes.dex"
Assert-NativeCommand "La inserción de classes.dex"
Pop-Location

Write-Host "6. Alineando APK con zipalign..."
$AlignedApk = "$WorkDir\app-aligned.apk"
& "$BuildTools\zipalign.exe" -f -v -p 4 "$WorkDir\app-unaligned.apk" $AlignedApk
Assert-NativeCommand "La alineación del APK"

Write-Host "7. Firmando APK..."
$FinalApk = "$WorkDir\LosPanitas-Elo-POS.apk"
& "$BuildTools\apksigner.bat" sign --ks $Keystore --ks-pass env:PANITAS_KEYSTORE_PASSWORD --ks-key-alias $KeyAlias --key-pass env:PANITAS_KEY_PASSWORD --out $FinalApk $AlignedApk
Assert-NativeCommand "La firma del APK"

$Badging = (& "$BuildTools\aapt2.exe" dump badging $FinalApk | Select-Object -First 1) -join ''
Assert-NativeCommand "La lectura de versión del APK"
if ($Badging -notmatch "versionCode='$VersionCode'" -or $Badging -notmatch "versionName='$([regex]::Escape($VersionName))'") {
    throw "La APK no contiene la versión esperada $VersionName ($VersionCode). Resultado: $Badging"
}
& "$BuildTools\apksigner.bat" verify --verbose $FinalApk | Out-Null
Assert-NativeCommand "La verificación de firma del APK"

Write-Host "8. Creando paquetes ZIP para descarga..."
# Limpiar ejecutables directos no permitidos en Firebase Spark
Get-ChildItem $OutDir -Filter "*.apk*" | Remove-Item -Force -ErrorAction SilentlyContinue

$ApkZip = "$OutDir\LosPanitas-Elo-POS-APK.zip"
if (Test-Path $ApkZip) { Remove-Item -Force $ApkZip }
Compress-Archive -Path "$FinalApk", "$ProjectDir\README.md" -DestinationPath $ApkZip

$ZipFile = "$OutDir\Paquete-Recursos-Terminal-ELO.zip"
if (Test-Path $ZipFile) { Remove-Item -Force $ZipFile }
Compress-Archive -Path "$FinalApk", "$ProjectDir\README.md", (Join-Path $RepoRoot "docs\TERMINAL-ELO.md") -DestinationPath $ZipFile

$ChecksumFile = Join-Path $OutDir "SHA256SUMS.txt"
@($FinalApk, $ApkZip, $ZipFile) |
    Get-FileHash -Algorithm SHA256 |
    ForEach-Object { "$($_.Hash)  $([System.IO.Path]::GetFileName($_.Path))" } |
    Set-Content -LiteralPath $ChecksumFile -Encoding ascii

Write-Host "Paquetes generados exitosamente en: $OutDir"
