$p = ConvertTo-SecureString 'LazyDev123!' -AsPlainText -Force
Import-PfxCertificate -FilePath 'c:\Users\Ify Gaaga\Lazy\certs\dev-cert.pfx' -CertStoreLocation 'Cert:\CurrentUser\Root' -Password $p
Import-PfxCertificate -FilePath 'c:\Users\Ify Gaaga\Lazy\certs\dev-cert.pfx' -CertStoreLocation 'Cert:\CurrentUser\TrustedPublisher' -Password $p

Write-Host "Checking Authenticode Signature..."
Get-AuthenticodeSignature 'c:\Users\Ify Gaaga\Lazy\release\LAZY-Setup-1.2.12.exe'
