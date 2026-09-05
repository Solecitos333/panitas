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
$ReleaseFile = Join-Path $RepoRoot "release.json"
if (-not (Test-Path $ReleaseFile)) { throw "Falta release.json, la fuente única de versión." }
$ReleaseInfo = Get-Content -Raw $ReleaseFile | ConvertFrom-Json
$VersionCode = [int]$ReleaseInfo.versionCode
$VersionName = [string]$ReleaseInfo.versionName
$PackageVersion = [string](Get-Content -Raw (Join-Path $RepoRoot "package.json") | ConvertFrom-Json).version
if ($VersionCode -le 0 -or [string]::IsNullOrWhiteSpace($VersionName)) {
    throw "release.json contiene una versión inválida."
}
if ($PackageVersion -ne $VersionName) {
    throw "package.json ($PackageVersion) y release.json ($VersionName) no coinciden."
}
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
$ExpectedWorkDir = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot 'android-elo-kiosk\build_temp'))
$ResolvedWorkDir = [System.IO.Path]::GetFullPath($WorkDir)
if ($ResolvedWorkDir -ne $ExpectedWorkDir -or -not $ResolvedWorkDir.StartsWith([System.IO.Path]::GetFullPath($RepoRoot) + [System.IO.Path]::DirectorySeparatorChar)) {
    throw 'El directorio temporal de compilación no está dentro del repositorio esperado.'
}
if (Test-Path -LiteralPath $ResolvedWorkDir) {
    if ((Get-Item -LiteralPath $ResolvedWorkDir).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw 'El directorio temporal de compilación no puede ser un enlace.'
    }
    Remove-Item -LiteralPath $ResolvedWorkDir -Recurse -Force
}
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
& $Javac -encoding UTF-8 -source 8 -target 8 -cp $PlatformJar -d $ClassesDir $JavaSrc
Assert-NativeCommand "La compilación Java"

Write-Host "4. Convirtiendo a DEX con d8..."
$ClassFiles = Get-ChildItem $ClassesDir -Filter "*.class" -Recurse | Select-Object -ExpandProperty FullName
& "$BuildTools\d8.bat" --min-api 21 --lib $PlatformJar --output $WorkDir $ClassFiles
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
$SignerOutput = (& "$BuildTools\apksigner.bat" verify --print-certs $FinalApk) -join "`n"
Assert-NativeCommand "La lectura del certificado de firma"
if ($SignerOutput -notmatch 'certificate SHA-256 digest:\s*([0-9a-fA-F]{64})') {
    throw "No se pudo obtener la huella SHA-256 del certificado de la APK."
}
$SigningCertificateSha256 = $Matches[1].ToUpperInvariant()

Write-Host "8. Creando paquetes ZIP para descarga..."
# Limpiar ejecutables directos no permitidos en Firebase Spark
Get-ChildItem $OutDir -Filter "*.apk*" | Remove-Item -Force -ErrorAction SilentlyContinue

$ApkZip = "$OutDir\LosPanitas-Elo-POS-APK.zip"
$VersionSlug = ($VersionName -replace '[^0-9A-Za-z._-]', '-')
$VersionedApkZip = "$OutDir\LosPanitas-Elo-POS-v$VersionSlug-code$VersionCode.zip"
if (Test-Path $ApkZip) { Remove-Item -Force $ApkZip }
if (Test-Path $VersionedApkZip) { Remove-Item -Force $VersionedApkZip }
Compress-Archive -Path "$FinalApk", "$ProjectDir\README.md" -DestinationPath $VersionedApkZip
Copy-Item -LiteralPath $VersionedApkZip -Destination $ApkZip -Force

$ZipFile = "$OutDir\Paquete-Recursos-Terminal-ELO.zip"
if (Test-Path $ZipFile) { Remove-Item -Force $ZipFile }
Compress-Archive -Path "$FinalApk", "$ProjectDir\README.md", (Join-Path $RepoRoot "docs\TERMINAL-ELO.md") -DestinationPath $ZipFile

$ApkHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $FinalApk).Hash.ToUpperInvariant()
$ArchiveHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $VersionedApkZip).Hash.ToUpperInvariant()
$UpdateManifest = [ordered]@{
    schemaVersion = 1
    channel = [string]$ReleaseInfo.channel
    packageName = "com.panitas.pos"
    versionCode = $VersionCode
    versionName = $VersionName
    publishedAt = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
    minimumSupportedVersionCode = [int]$ReleaseInfo.minimumSupportedVersionCode
    mandatory = [bool]$ReleaseInfo.mandatory
    artifact = [ordered]@{
        url = "https://los-panitas-by-nechy.web.app/downloads/$([System.IO.Path]::GetFileName($VersionedApkZip))"
        filename = [System.IO.Path]::GetFileName($VersionedApkZip)
        size = [long](Get-Item -LiteralPath $VersionedApkZip).Length
        sha256 = $ArchiveHash
    }
    apk = [ordered]@{
        entry = "LosPanitas-Elo-POS.apk"
        size = [long](Get-Item -LiteralPath $FinalApk).Length
        sha256 = $ApkHash
        signingCertificateSha256 = $SigningCertificateSha256
    }
    releaseNotes = @($ReleaseInfo.releaseNotes)
}
$UpdateManifestFile = Join-Path $OutDir "update.json"
$UpdateManifestJson = $UpdateManifest | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($UpdateManifestFile, $UpdateManifestJson + "`n", [System.Text.UTF8Encoding]::new($false))

$ChecksumFile = Join-Path $OutDir "SHA256SUMS.txt"
@($FinalApk, $ApkZip, $VersionedApkZip, $ZipFile, $UpdateManifestFile) |
    Get-FileHash -Algorithm SHA256 |
    ForEach-Object { "$($_.Hash)  $([System.IO.Path]::GetFileName($_.Path))" } |
    Set-Content -LiteralPath $ChecksumFile -Encoding ascii

Write-Host "Paquetes generados exitosamente en: $OutDir"
