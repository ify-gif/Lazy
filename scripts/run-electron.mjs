import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";
import electronPath from "electron";

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const mainEntry = resolve(process.cwd(), "dist-electron", "main.js");
if (!existsSync(mainEntry)) {
  console.error(`Missing Electron entrypoint: ${mainEntry}`);
  console.error("Run: npx tsc --build tsconfig.server.json --force");
  process.exit(1);
}

const child = spawn(electronPath, ["."], {
  stdio: "inherit",
  env,
  shell: false,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

child.on("error", (err) => {
  console.error("Failed to launch Electron:", err);
  process.exit(1);
});
