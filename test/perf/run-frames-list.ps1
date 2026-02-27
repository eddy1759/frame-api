param(
  [int]$Port = 8000,
  [string]$ScriptPath = 'test/perf/frames-list.k6.js',
  [string]$HealthBaseUrl = ''
)

$dockerBaseUrl = "http://host.docker.internal:$Port"
$hostBaseUrl = if ($HealthBaseUrl) { $HealthBaseUrl } else { "http://localhost:$Port" }
$healthUrl = "$hostBaseUrl/api/v1/health"

Write-Host "Checking API health at $healthUrl"
$healthy = $false

for ($i = 1; $i -le 30; $i++) {
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 3
    if ($resp.StatusCode -eq 200) {
      $healthy = $true
      break
    }
  }
  catch {
    Start-Sleep -Seconds 1
  }
}

if (-not $healthy) {
  throw "API not reachable at $healthUrl. Start the API first and retry."
}

Write-Host "Starting k6 against $dockerBaseUrl"
docker run --rm `
  --add-host=host.docker.internal:host-gateway `
  -v "${PWD}:/work" `
  -w /work `
  -e RUNTIME=docker `
  -e PORT=$Port `
  -e BASE_URL=$dockerBaseUrl `
  grafana/k6 run $ScriptPath
