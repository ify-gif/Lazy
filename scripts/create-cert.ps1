$ErrorActionPreference = "Stop"

$certDir = Join-Path $PSScriptRoot "..\certs"
if (!(Test-Path $certDir)) {
    New-Item -ItemType Directory -Path $certDir | Out-Null
}

$pfxPath = Join-Path $certDir "dev-cert.pfx"
$password = ConvertTo-SecureString -String "LazyDev2026!" -Force -AsPlainText

Write-Host "Creating self-signed code signing certificate..."
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=LAZY Development, O=Ify Gaaga" -CertStoreLocation "Cert:\CurrentUser\My" -NotAfter (Get-Date).AddYears(5)

Write-Host "Exporting PFX certificate to $pfxPath..."
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $password | Out-Null

Write-Host "Installing certificate into CurrentUser Root and TrustedPublisher stores..."
$storeRoot = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "CurrentUser")
$storeRoot.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
$storeRoot.Add($cert)
$storeRoot.Close()

$storePub = New-Object System.Security.Cryptography.X509Certificates.X509Store("TrustedPublisher", "CurrentUser")
$storePub.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
$storePub.Add($cert)
$storePub.Close()

Write-Host "Certificate generated and trusted successfully!"
Write-Host "Thumbprint: $($cert.Thumbprint)"
