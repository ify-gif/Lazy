import { execSync, spawn } from "child_process";

function killPort3000Listener() {
  if (process.platform === "win32") {
    try {
      execSync(
        'powershell -NoProfile -Command "$p=(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess); if($p){ Stop-Process -Id $p -Force; Write-Host \\"Freed port 3000 (PID $p)\\" }"',
        { stdio: "inherit" }
      );
    } catch {
      // Best effort only.
    }
    return;
  }

  try {
    execSync("lsof -ti tcp:3000 | xargs -r kill -9", { stdio: "inherit" });
    console.log("Freed port 3000");
  } catch {
    // Best effort only.
  }
}

function runElectronDev() {
  const command =
    'npx concurrently -k "cross-env BROWSER=none next dev -p 3000" "wait-on tcp:127.0.0.1:3000 && npx tsc --build tsconfig.server.json --force && node scripts/run-electron.mjs"';

  const child = spawn(command, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env },
  });

  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", (err) => {
    console.error("Failed to start electron-dev:", err);
    process.exit(1);
  });
}

killPort3000Listener();
runElectronDev();

