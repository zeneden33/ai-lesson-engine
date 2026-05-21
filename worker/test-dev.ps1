$workerDir = "D:\Educational Encyclopedia\Arabic\Ai\Laptop\تحدث\template\Template\English version\lesson v0.2\ai-lesson-engine\worker"
$outLog = Join-Path $workerDir "wrangler-out.log"
$errLog = Join-Path $workerDir "wrangler-err.log"

# Kill any previous wrangler on port 8790
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "8790" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start wrangler dev
Write-Host "Starting wrangler dev..."
$proc = Start-Process -FilePath "npx.cmd" -ArgumentList "wrangler", "dev", "--env", "dev", "--port", "8790" -WorkingDirectory $workerDir -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
Write-Host "PID: $($proc.Id)"

# Wait for startup
Write-Host "Waiting 30s for startup..."
Start-Sleep -Seconds 30

# Show logs
Write-Host "=== STDERR (last 50 lines) ==="
Get-Content -LiteralPath $errLog -Tail 50 -ErrorAction SilentlyContinue
Write-Host "=== STDOUT (last 30 lines) ==="
Get-Content -LiteralPath $outLog -Tail 30 -ErrorAction SilentlyContinue

# Try the test
Write-Host "`n=== TESTING GENERATE ==="
try {
  $body = '{"topic":"Shopping for clothes","level":"beginner"}'
  Write-Host "Request body: $body"
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:8790/api/generate" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 120 -UseBasicParsing
  Write-Host "STATUS: $($r.StatusCode)"
  $content = $r.Content
  if ($content.Length -gt 2000) {
    Write-Host "BODY (first 2000 chars):"
    Write-Host $content.Substring(0, 2000)
    Write-Host "... [truncated, total $($content.Length) chars]"
  } else {
    Write-Host "BODY:"
    Write-Host $content
  }
} catch {
  Write-Host "REQUEST ERROR: $_"
  if ($_.Exception.Response) {
    try {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $errBody = $reader.ReadToEnd()
      $reader.Close()
      Write-Host "Response body: $errBody"
    } catch {}
  }
}

# Show log lines since request
Write-Host "`n=== STDERR (last 20 lines after request) ==="
Get-Content -LiteralPath $errLog -Tail 20 -ErrorAction SilentlyContinue

# Try debug endpoint
Write-Host "`n=== DEBUG TRACE ==="
try {
  $r2 = Invoke-WebRequest -Uri "http://127.0.0.1:8790/api/debug" -UseBasicParsing
  Write-Host $r2.Content
} catch {
  Write-Host "DEBUG ERROR: $_"
}
