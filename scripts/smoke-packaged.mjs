import { existsSync, statSync } from "fs";
import { resolve } from "path";
import pkg from "../package.json" with { type: "json" };

function assertFile(filePath, description) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${description}: ${filePath}`);
  }
  const stats = statSync(filePath);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error(`Invalid ${description} (empty or not file): ${filePath}`);
  }
  console.log(`OK: ${description}`);
}

function assertDir(dirPath, description) {
  if (!existsSync(dirPath)) {
    throw new Error(`Missing ${description}: ${dirPath}`);
  }
  const stats = statSync(dirPath);
  if (!stats.isDirectory()) {
    throw new Error(`Invalid ${description} (not directory): ${dirPath}`);
  }
  console.log(`OK: ${description}`);
}

function runSmoke() {
  const version = pkg.version;
  const productName = "LAZY";
  const releaseDir = resolve(process.cwd(), "release");

  assertDir(releaseDir, "release output directory");

  const setupExe = resolve(releaseDir, `${productName} Setup ${version}.exe`);
  const blockmap = resolve(releaseDir, `${productName} Setup ${version}.exe.blockmap`);
  const latestYml = resolve(releaseDir, "latest.yml");
  const unpackedDir = resolve(releaseDir, "win-unpacked");
  const appExe = resolve(unpackedDir, `${productName}.exe`);
  const appAsar = resolve(unpackedDir, "resources", "app.asar");

  assertFile(setupExe, "NSIS installer");
  assertFile(blockmap, "installer blockmap");
  assertFile(latestYml, "update metadata");
  assertDir(unpackedDir, "unpacked app directory");
  assertFile(appExe, "unpacked app executable");
  assertFile(appAsar, "app.asar bundle");

  console.log("Packaged smoke checks passed.");
}

try {
  runSmoke();
} catch (err) {
  console.error("Packaged smoke checks failed.");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

