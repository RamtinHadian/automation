/**
 * Printing the invoice on a label / receipt printer WITHOUT the print window. A web page cannot do that by itself; Chrome can when it is started with
 * --kiosk-printing (every print goes straight to the default printer). So the application hands the person a small Windows file («نصب چاپ مستقیم»):
 * it asks which printer, reads the paper width from the driver, makes that printer the default and puts an icon on the desktop that starts Chrome the
 * right way, in a profile of its own (the flag only works for a Chrome that is not running yet). The icon opens Hoormand with
 * ?thermal=<width>&direct=1, which this file turns into the remembered settings of that browser.
 */
const SIZES = ['auto', '58', '72', '76', '80', '110', 'label100x150', 'label100x100', 'label75x50', 'custom'];

/** Called once when the application starts: reads ?thermal= ?mm= ?direct= from the address (the icon of the installer sets them) and clears them. */
export function applyDirectPrintParams() {
  try {
    const q = new URLSearchParams(window.location.search);
    const t = q.get('thermal');
    const had = q.has('thermal') || q.has('mm') || q.has('direct');
    if (!had) return;
    if (t && SIZES.includes(t)) localStorage.setItem('invoice-thermal-size', t);
    const mm = Number(q.get('mm'));
    if (mm >= 30 && mm <= 200) localStorage.setItem('invoice-thermal-mm', String(mm));
    if (q.get('direct') === '1') localStorage.setItem('invoice-direct-print', '1');
    q.delete('thermal');
    q.delete('mm');
    q.delete('direct');
    const rest = q.toString();
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
  } catch {
    /* the settings are optional */
  }
}

export const directPrintOn = (): boolean => {
  try {
    return localStorage.getItem('invoice-direct-print') === '1';
  } catch {
    return false;
  }
};

export const setDirectPrint = (on: boolean) => {
  try {
    if (on) localStorage.setItem('invoice-direct-print', '1');
    else localStorage.removeItem('invoice-direct-print');
  } catch {
    /* optional */
  }
};

/** The installer: a .cmd that runs the PowerShell text after the marker (only plain English letters, so every Windows shows it right). */
export function directPrintInstallerText(siteUrl: string): string {
  const ps = `$ErrorActionPreference = 'Stop'
$base = '${siteUrl.replace(/'/g, '')}'
Write-Host ''
Write-Host '=== Hoormand: direct printing (no print window) ===' -ForegroundColor Cyan
$list = @(Get-CimInstance Win32_Printer | Where-Object { $_.Name -notmatch 'PDF|XPS|OneNote|Fax' })
if ($list.Count -eq 0) { Write-Host 'No printer found. Install the label printer driver first, then run this file again.' -ForegroundColor Red; return }
Write-Host 'Printers on this computer:'
for ($i = 0; $i -lt $list.Count; $i++) { $d = ''; if ($list[$i].Default) { $d = '   (current default)' }; Write-Host ('  [{0}] {1}{2}' -f ($i + 1), $list[$i].Name, $d) }
$pick = 0
while ($pick -lt 1 -or $pick -gt $list.Count) { $r = Read-Host 'Type the number of the label / receipt printer'; [void][int]::TryParse($r, [ref]$pick) }
$name = $list[$pick - 1].Name
Add-Type -AssemblyName System.Drawing
$ps = New-Object System.Drawing.Printing.PrinterSettings
$ps.PrinterName = $name
$mm = [math]::Round($ps.DefaultPageSettings.PaperSize.Width * 25.4 / 100)
Write-Host ('Paper of this printer: {0} ({1} mm wide)' -f $ps.DefaultPageSettings.PaperSize.PaperName, $mm)
if ($mm -lt 40 -or $mm -gt 120) { $r = Read-Host 'The paper width could not be read. Type it in millimetres (for example 58 or 80)'; $mm = [int]$r }
$known = @(58, 72, 76, 80, 110)
if ($known -contains $mm) { $q = 'thermal=' + $mm } else { $q = 'thermal=custom&mm=' + $mm }
(New-Object -ComObject WScript.Network).SetDefaultPrinter($name)
Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows' -Name LegacyDefaultPrinterMode -Value 1 -ErrorAction SilentlyContinue
$cands = @(
  ($env:ProgramFiles + '\\Google\\Chrome\\Application\\chrome.exe'),
  (\${env:ProgramFiles(x86)} + '\\Google\\Chrome\\Application\\chrome.exe'),
  ($env:LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'),
  (\${env:ProgramFiles(x86)} + '\\Microsoft\\Edge\\Application\\msedge.exe'),
  ($env:ProgramFiles + '\\Microsoft\\Edge\\Application\\msedge.exe'))
$exe = $cands | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) { Write-Host 'Chrome or Edge was not found on this computer.' -ForegroundColor Red; return }
$profileDir = Join-Path $env:LOCALAPPDATA 'HoormandPrint'
$url = $base.TrimEnd('/') + '/?' + $q + '&direct=1'
$desk = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desk 'Hoormand (direct print).lnk'
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($lnk)
$s.TargetPath = $exe
$s.Arguments = '--kiosk-printing --user-data-dir="' + $profileDir + '" --app="' + $url + '"'
$s.IconLocation = $exe
$s.Save()
Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
Write-Host ('Printer: ' + $name + '    Paper: ' + $mm + ' mm')
Write-Host 'From now on open Hoormand with the new desktop icon  "Hoormand (direct print)"  (sign in once). The invoice prints at once, with no print window.'
`;
  return `@echo off\r\ntitle Hoormand direct print setup\r\npowershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText('%~f0'); $i=$t.IndexOf('#PS'+'START'); Invoke-Expression $t.Substring($i)"\r\necho.\r\npause\r\nexit /b\r\n#PSSTART\r\n${ps.replace(/\n/g, '\r\n')}`;
}

export function downloadDirectPrintInstaller() {
  const blob = new Blob([directPrintInstallerText(window.location.origin)], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Hoormand-Direct-Print-Setup.cmd';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
