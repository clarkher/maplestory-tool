# Windows built-in OCR (zh-Hant-TW) for the MapleBook auction price tool (tools/price/ocr.mjs).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File ocr.ps1 -In <png> -Out <json> [-Scale 2]
# Output JSON (UTF-8, no BOM): { width, height, meanLuma, stdLuma, lines: [{ text, words: [{ text, x, y, w, h }] }] }
# On failure: exit code 1 and the JSON is { "error": "<message>" } (written as UTF-8 so non-English messages survive).
# Coordinates are in the ORIGINAL image pixels even when -Scale is used.
# The enlarged copy is written next to -Out (<Out>.scaled.png) and always removed, so the caller can also sweep it.
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less files as ANSI.
param([Parameter(Mandatory = $true)][string]$In, [Parameter(Mandatory = $true)][string]$Out, [double]$Scale = 1)
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
$src = $null; $big = $null; $stream = $null; $bmp = $null
$path = $In
$code = 0

function Free($o) { if ($null -ne $o) { try { $o.Dispose() } catch { } } }

try {
    Add-Type -AssemblyName System.Drawing
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
    [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime] | Out-Null
    [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
    [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime] | Out-Null
    $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
    function Await($op, [Type]$type) { $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $task.Wait(); $task.Result }

    if (-not (Test-Path -LiteralPath $In -PathType Leaf)) { throw ('image file not found: ' + $In) }

    # Brightness on a 64x64 grid: a black capture (exclusive fullscreen) is dark and flat.
    try { $src = [System.Drawing.Bitmap]::FromFile($In) }
    catch {
        # GDI+ reports a corrupt / not-an-image file as OutOfMemoryException ("not enough memory"), which is misleading.
        $ie = $_.Exception
        while ($null -ne $ie.InnerException) { $ie = $ie.InnerException }
        if ($ie -is [System.OutOfMemoryException]) { throw ('not a readable image: ' + $In) }
        throw
    }
    $w0 = $src.Width; $h0 = $src.Height
    $vals = New-Object 'System.Collections.Generic.List[double]'
    for ($gy = 0; $gy -lt 64; $gy++) {
        for ($gx = 0; $gx -lt 64; $gx++) {
            $p = $src.GetPixel([int][Math]::Floor(($gx + 0.5) * $w0 / 64), [int][Math]::Floor(($gy + 0.5) * $h0 / 64))
            $vals.Add(0.299 * $p.R + 0.587 * $p.G + 0.114 * $p.B)
        }
    }
    $mean = ($vals | Measure-Object -Average).Average
    $var = ($vals | ForEach-Object { ($_ - $mean) * ($_ - $mean) } | Measure-Object -Average).Average
    $std = [Math]::Sqrt($var)

    if ($Scale -ne 1) {
        $bw = [int]($w0 * $Scale); $bh = [int]($h0 * $Scale)
        $path = $Out + '.scaled.png'
        $big = New-Object System.Drawing.Bitmap $bw, $bh
        $g = [System.Drawing.Graphics]::FromImage($big)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.DrawImage($src, 0, 0, $bw, $bh); $g.Dispose()
        $big.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
        Free $big; $big = $null
    }
    Free $src; $src = $null

    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bmp = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $eng = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language 'zh-Hant-TW'))
    if ($null -eq $eng) { throw 'zh-Hant-TW OCR language is not installed' }
    $res = Await ($eng.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])

    $lines = @($res.Lines | ForEach-Object {
            $words = @($_.Words | ForEach-Object {
                    $r = $_.BoundingRect
                    [ordered]@{ text = $_.Text; x = $r.X / $Scale; y = $r.Y / $Scale; w = $r.Width / $Scale; h = $r.Height / $Scale }
                })
            [ordered]@{ text = $_.Text; words = $words }
        })
    $json = [ordered]@{ width = $w0; height = $h0; meanLuma = $mean; stdLuma = $std; lines = $lines } | ConvertTo-Json -Depth 6 -Compress
    [System.IO.File]::WriteAllText($Out, $json, $utf8)
}
catch {
    # Unwrap AggregateException / MethodInvocationException down to the real reason.
    $e = $_.Exception
    while ($null -ne $e.InnerException) { $e = $e.InnerException }
    try {
        $errJson = [ordered]@{ error = [string]$e.Message } | ConvertTo-Json -Compress
        [System.IO.File]::WriteAllText($Out, $errJson, $utf8)
    }
    catch { }
    $code = 1
}
finally {
    Free $stream; Free $bmp; Free $big; Free $src
    if ($path -ne $In) { Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue }
}
exit $code
