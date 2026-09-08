$ErrorActionPreference = 'Stop'
function Assert-Step([string]$Step) { if ($LASTEXITCODE -ne 0) { throw "$Step failed ($LASTEXITCODE)" } }
$Root = Split-Path -Parent $PSScriptRoot
$Sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$Java = 'C:\Program Files\Android\openjdk\jdk-21.0.8'
$env:JAVA_HOME = $Java
$env:PATH = "$Java\bin;$env:PATH"
$BuildTools = Get-ChildItem (Join-Path $Sdk 'build-tools') -Directory | Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName
$Platform = Get-ChildItem (Join-Path $Sdk 'platforms') -Filter android.jar -Recurse | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $env:PANITAS_KEYSTORE_PASSWORD) { throw 'Define the existing signing password only in the process environment.' }
$Key = Join-Path $Root 'android-elo-kiosk\signing\los-panitas-pos.keystore'
if (-not (Test-Path -LiteralPath $Key)) { throw 'Restore the existing signing key; do not generate a replacement.' }
$Project = Join-Path $Root 'android-management'
$Work = Join-Path $Project ('build\' + [guid]::NewGuid().ToString('N'))
$Res = Join-Path $Work 'res\drawable'
$Classes = Join-Path $Work 'classes'
$Gen = Join-Path $Work 'gen'
$Icons = Join-Path $Root 'public\icons'
New-Item -ItemType Directory -Force -Path $Work, $Res, $Classes, $Gen, $Icons | Out-Null
Copy-Item -LiteralPath (Join-Path $Root 'public\logo.png') -Destination (Join-Path $Res 'app_icon.png')

# Deterministic build assets: scale the existing official logo, no redesign.
Add-Type -AssemblyName System.Drawing
$Logo = [System.Drawing.Image]::FromFile((Join-Path $Root 'public\logo.png'))
try {
    foreach ($Size in @(180, 192, 512)) {
        $Image = New-Object System.Drawing.Bitmap($Size, $Size)
        $Canvas = [System.Drawing.Graphics]::FromImage($Image)
        try {
            $Canvas.Clear([System.Drawing.Color]::Black)
            $Canvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $Scale = [Math]::Min($Size / $Logo.Width, $Size / $Logo.Height)
            $Width = [int]($Logo.Width * $Scale)
            $Height = [int]($Logo.Height * $Scale)
            $Canvas.DrawImage($Logo, [int](($Size - $Width) / 2), [int](($Size - $Height) / 2), $Width, $Height)
            $Name = if ($Size -eq 180) { 'apple-touch-icon.png' } else { "app-$Size.png" }
            $Image.Save((Join-Path $Icons $Name), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $Canvas.Dispose(); $Image.Dispose() }
    }
} finally { $Logo.Dispose() }

& "$BuildTools\aapt2.exe" compile --dir (Join-Path $Work 'res') -o (Join-Path $Work 'res.zip')
Assert-Step 'Resources'
& "$BuildTools\aapt2.exe" link -I $Platform --manifest (Join-Path $Project 'AndroidManifest.xml') (Join-Path $Work 'res.zip') -o (Join-Path $Work 'base.apk') --java $Gen --min-sdk-version 23 --target-sdk-version 35 --version-code 1 --version-name '1.0.0'
Assert-Step 'Manifest'
$Sources = @(Get-ChildItem (Join-Path $Project 'src') -Recurse -Filter '*.java' | Select-Object -ExpandProperty FullName)
$Sources += @(Get-ChildItem $Gen -Recurse -Filter '*.java' | Select-Object -ExpandProperty FullName)
& "$Java\bin\javac.exe" -encoding UTF-8 -source 8 -target 8 -cp $Platform -d $Classes $Sources
Assert-Step 'Java'
$ClassFiles = @(Get-ChildItem $Classes -Recurse -Filter '*.class' | Select-Object -ExpandProperty FullName)
& "$BuildTools\d8.bat" --min-api 23 --lib $Platform --output $Work $ClassFiles
Assert-Step 'DEX'
& "$Java\bin\jar.exe" uf (Join-Path $Work 'base.apk') -C $Work classes.dex
Assert-Step 'Package'
& "$BuildTools\zipalign.exe" -f -p 4 (Join-Path $Work 'base.apk') (Join-Path $Work 'aligned.apk')
Assert-Step 'Alignment'
$OutputDirectory = Join-Path $Project 'build\release'
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$Output = Join-Path $OutputDirectory 'LosPanitas-Gestion-Android.apk'
& "$BuildTools\apksigner.bat" sign --ks $Key --ks-pass env:PANITAS_KEYSTORE_PASSWORD --key-pass env:PANITAS_KEYSTORE_PASSWORD --ks-key-alias androiddebugkey --out $Output (Join-Path $Work 'aligned.apk')
Assert-Step 'Signature'
& "$BuildTools\apksigner.bat" verify --verbose $Output
Assert-Step 'Verification'
$Metadata = [ordered]@{
    packageName = 'com.panitas.management'
    versionCode = 1
    versionName = '1.0.0'
    tag = 'gestion-v1.0.0'
    filename = 'LosPanitas-Gestion-Android.apk'
    url = 'https://github.com/Solecitos333/panitas/releases/download/gestion-v1.0.0/LosPanitas-Gestion-Android.apk'
    size = [long](Get-Item -LiteralPath $Output).Length
    sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $Output).Hash.ToLowerInvariant()
}
$MetadataPath = Join-Path $Root 'public\downloads\management.json'
[IO.File]::WriteAllText($MetadataPath, (($Metadata | ConvertTo-Json) -replace "`r`n", "`n") + "`n", [Text.UTF8Encoding]::new($false))
Write-Host 'Management APK built. Browser-based dashboard; no terminal, USB or device-admin permissions.'
