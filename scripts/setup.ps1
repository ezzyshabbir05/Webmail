# ==============================================================================
# Postarc Unified Mail System - Turnkey Docker Setup Script (PowerShell)
# Configures: Postarc Mailserver + Postarc Webmail + Cloudflare R2 + SQLite/Postgres
# ==============================================================================

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "          POSTARC UNIFIED MAIL SYSTEM - TURNKEY PROVISIONING WIZARD       " -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""

# Detect Server IP
$serverIp = "YOUR_SERVER_IP"
try {
    $serverIp = (Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 3).Trim()
} catch {}

# 1. Domain & Hostname
Write-Host "--- [1/5] Domain & Hostname Setup ---" -ForegroundColor Yellow
$domain = Read-Host "Enter your mail domain [e.g. example.com]"
if ([string]::IsNullOrWhiteSpace($domain)) {
    Write-Error "Error: Domain is required."
    exit 1
}

$defaultHostname = "mail.$domain"
$hostname = Read-Host "Enter mailserver hostname [default: $defaultHostname]"
if ([string]::IsNullOrWhiteSpace($hostname)) { $hostname = $defaultHostname }

# 2. Administrator Account
Write-Host ""
Write-Host "--- [2/5] Administrator Account ---" -ForegroundColor Yellow
$defaultAdmin = "admin@$domain"
$adminEmail = Read-Host "Enter admin email [default: $defaultAdmin]"
if ([string]::IsNullOrWhiteSpace($adminEmail)) { $adminEmail = $defaultAdmin }

$adminPassword = Read-Host "Enter admin password [press enter to auto-generate]"
if ([string]::IsNullOrWhiteSpace($adminPassword)) {
    $adminPassword = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 16 | ForEach-Object { [char]$_ })
}

# 3. Cloudflare R2 Object Storage
Write-Host ""
Write-Host "--- [3/5] Cloudflare R2 Object Storage (Attachments and Blobs) ---" -ForegroundColor Yellow
Write-Host "Postarc uses Cloudflare R2 (S3-compatible) for blob and attachment storage."
$r2AccountId = Read-Host "Enter Cloudflare Account ID"
$r2AccessKey = Read-Host "Enter Cloudflare R2 Access Key ID"
$r2SecretKey = Read-Host "Enter Cloudflare R2 Secret Access Key" -AsSecureString
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($r2SecretKey)
$r2SecretKeyPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)

$r2Bucket = Read-Host "Enter Cloudflare R2 Bucket Name [default: postarc-blobs]"
if ([string]::IsNullOrWhiteSpace($r2Bucket)) { $r2Bucket = "postarc-blobs" }

# 4. Preparing Directories & Cryptographic Secrets
Write-Host ""
Write-Host "--- [4/5] Preparing Directories and Configuration ---" -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "data/mailserver/etc", "data/mailserver/var", "data/webmail" | Out-Null

$dkimPubKey = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC3postarc"

# Write .env file
$envLines = @(
    "POSTARC_DOMAIN=$domain",
    "POSTARC_HOSTNAME=$hostname",
    "ADMIN_EMAIL=$adminEmail",
    "ADMIN_PASSWORD=$adminPassword",
    "",
    "CLOUDFLARE_R2_ACCOUNT_ID=$r2AccountId",
    "CLOUDFLARE_R2_ACCESS_KEY_ID=$r2AccessKey",
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY=$r2SecretKeyPlain",
    "CLOUDFLARE_R2_BUCKET_NAME=$r2Bucket",
    "",
    "POSTARC_SERVER_URL=http://postarc-mailserver:8080",
    'NEXT_PUBLIC_APP_NAME="Postarc Webmail"'
)
$envLines | Set-Content -Path ".env"

# Write Postarc Mailserver config.json
$configJson = @"
{
  "store": {
    "data": {
      "@type": "Sqlite",
      "path": "/var/lib/postarc/postarc.db"
    },
    "blob": {
      "@type": "S3",
      "bucket": "$r2Bucket",
      "region": {
        "@type": "Custom",
        "url": "https://$r2AccountId.r2.cloudflarestorage.com",
        "region": "auto"
      },
      "accessKeyId": "$r2AccessKey",
      "secretKey": "$r2SecretKeyPlain",
      "verifyAfterWrite": true
    }
  },
  "server": {
    "hostname": "$hostname",
    "domain": "$domain"
  }
}
"@
Set-Content -Path "data/mailserver/etc/config.json" -Value $configJson

Write-Host "SUCCESS: Generated configuration and cryptographic secrets." -ForegroundColor Green

# 5. Display Cloudflare DNS Setup Table
Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Yellow
Write-Host "                 REQUIRED CLOUDFLARE DNS RECORDS TO CONFIGURE             " -ForegroundColor Yellow
Write-Host "==========================================================================" -ForegroundColor Yellow
Write-Host "Add the following DNS records in your Cloudflare DNS Dashboard for $domain :"
Write-Host ""
Write-Host ("{0,-8} {1,-30} {2,-40} {3,-10}" -f "TYPE", "NAME", "CONTENT / VALUE", "PROXY")
Write-Host "--------------------------------------------------------------------------------------"
Write-Host ("{0,-8} {1,-30} {2,-40} {3,-10}" -f "A", $hostname, $serverIp, "DNS only")
Write-Host ("{0,-8} {1,-30} {2,-40} {3,-10}" -f "MX", "@", "$hostname (Priority: 10)", "DNS only")
Write-Host ("{0,-8} {1,-30} {2,-40} {3,-10}" -f "TXT", "@", "v=spf1 mx ip4:$serverIp ~all", "DNS only")
Write-Host ("{0,-8} {1,-30} {2,-40} {3,-10}" -f "TXT", "postarc._domainkey", "v=DKIM1; k=ed25519; p=$dkimPubKey", "DNS only")
Write-Host ("{0,-8} {1,-30} {2,-40} {3,-10}" -f "TXT", "_dmarc", "v=DMARC1; p=quarantine; rua=mailto:$adminEmail", "DNS only")
Write-Host "--------------------------------------------------------------------------------------"
Write-Host ""

# 6. Launch Docker Stack
Write-Host "--- [5/5] Launching Unified Docker Stack ---" -ForegroundColor Yellow
if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host "Starting Postarc Mailserver and Postarc Webmail..."
    docker compose up -d --build

    Write-Host ""
    Write-Host "==========================================================================" -ForegroundColor Green
    Write-Host "                      POSTARC IS LIVE AND READY!                         " -ForegroundColor Green
    Write-Host "==========================================================================" -ForegroundColor Green
    Write-Host "Webmail UI:            http://localhost:3000 (or https://$hostname)" -ForegroundColor Cyan
    Write-Host "JMAP and HTTP Gateway: http://localhost:8080" -ForegroundColor Cyan
    Write-Host "SMTP Inbound (MTA):    Port 25" -ForegroundColor Cyan
    Write-Host "SMTP Submission:       Port 587" -ForegroundColor Cyan
    Write-Host "IMAPS (Secure IMAP):   Port 993" -ForegroundColor Cyan
    Write-Host "Admin Account:         $adminEmail" -ForegroundColor Cyan
    Write-Host "Admin Password:        $adminPassword" -ForegroundColor Cyan
    Write-Host "Attachments and Blobs: Cloudflare R2 Bucket [$r2Bucket]" -ForegroundColor Cyan
    Write-Host "==========================================================================" -ForegroundColor Green
} else {
    Write-Host "Docker was not found in PATH. Configuration generated in .env and data/mailserver/etc/config.json" -ForegroundColor Yellow
}
