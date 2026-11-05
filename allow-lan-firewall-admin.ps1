# Run this script from an Administrator PowerShell window.
New-NetFirewallRule -DisplayName "ChitraGuess API 3001" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow -Profile Private -ErrorAction SilentlyContinue
Write-Host "Allowed ChitraGuess backend TCP port 3001 on Private networks."
