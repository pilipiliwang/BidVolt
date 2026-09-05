param([switch]$VerifyOnly)

# Download unchanged, pinned upstream fonts. This script never touches Docker or DOCX files.
$ErrorActionPreference = 'Stop'
$fontRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$manifest = Get-Content -LiteralPath (Join-Path $fontRoot 'manifest.json') -Raw | ConvertFrom-Json
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Assert-SafeName([string]$Name) {
    if ($Name -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]+$') { throw "Unsafe manifest filename: $Name" }
}

function Assert-Hash([string]$Path, [string]$Expected) {
    if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing file: $Path" }
    $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    if ($actual -ine $Expected) { throw "SHA256 mismatch; not overwriting existing file: $Path" }
}

function Get-VerifiedDownload([string]$Url, [string]$Path, [string]$Hash) {
    if (Test-Path -LiteralPath $Path) { Assert-Hash $Path $Hash; return }
    if ($VerifyOnly) { throw "Missing file: $Path. Run without -VerifyOnly to download." }
    $uri = [Uri]$Url
    if ($uri.Scheme -ne 'https' -or $uri.Host -notin @('github.com', 'raw.githubusercontent.com')) {
        throw "Unexpected upstream: $Url"
    }
    $staging = "$Path.part"
    if (Test-Path -LiteralPath $staging) { throw "Staging file already exists; inspect it before retrying: $staging" }
    Write-Host "Downloading $([IO.Path]::GetFileName($Path))"
    Invoke-WebRequest -Uri $uri -OutFile $staging
    Assert-Hash $staging $Hash
    Move-Item -LiteralPath $staging -Destination $Path
}

foreach ($license in $manifest.licenses) {
    Assert-SafeName $license.file
    $licenseDirectory = Join-Path $fontRoot 'licenses'
    if (!$VerifyOnly) { New-Item -ItemType Directory -Force -Path $licenseDirectory | Out-Null }
    Get-VerifiedDownload $license.url (Join-Path $licenseDirectory $license.file) $license.sha256
}
foreach ($font in $manifest.fonts) {
    Assert-SafeName $font.file
    $target = Join-Path $fontRoot $font.file
    if (Test-Path -LiteralPath $target) { Assert-Hash $target $font.sha256; continue }
    if ($VerifyOnly) { throw "Missing font: $target" }
    if ($font.archive) {
        Assert-SafeName $font.archive.file
        Assert-SafeName $font.archive.entry
        $archivePath = Join-Path $fontRoot $font.archive.file
        Get-VerifiedDownload $font.url $archivePath $font.archive.sha256
        $archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
        try {
            # Exact entry extraction only: no archive paths are trusted as destinations.
            $entry = $archive.GetEntry($font.archive.entry)
            if (!$entry -or $entry.Length -gt 100MB) { throw 'Missing or oversized font archive entry' }
            $staging = "$target.part"
            if (Test-Path -LiteralPath $staging) { throw "Staging file already exists: $staging" }
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $staging)
            Assert-Hash $staging $font.sha256
            Move-Item -LiteralPath $staging -Destination $target
        } finally { $archive.Dispose() }
    } else {
        Get-VerifiedDownload $font.url $target $font.sha256
    }
}
Write-Host "Verified $($manifest.fonts.Count) fonts and $($manifest.licenses.Count) licenses. No services changed."
