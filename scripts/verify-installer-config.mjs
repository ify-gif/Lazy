import pkg from "../package.json" with { type: "json" };

function fail(message) {
  console.error(`Installer config check failed: ${message}`);
  process.exit(1);
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label} expected ${expected}, got ${actual}`);
  }
}

function expectIncludes(arr, value, label) {
  if (!Array.isArray(arr) || !arr.includes(value)) {
    fail(`${label} must include '${value}'`);
  }
}

const build = pkg.build ?? {};
const nsis = build.nsis ?? {};
const win = build.win ?? {};

expectEqual(nsis.oneClick, false, "nsis.oneClick");
expectEqual(nsis.perMachine, true, "nsis.perMachine");
expectEqual(nsis.allowElevation, true, "nsis.allowElevation");
expectEqual(nsis.allowToChangeInstallationDirectory, false, "nsis.allowToChangeInstallationDirectory");
expectEqual(nsis.runAfterFinish, true, "nsis.runAfterFinish");
expectEqual(nsis.createDesktopShortcut, true, "nsis.createDesktopShortcut");
expectEqual(nsis.createStartMenuShortcut, true, "nsis.createStartMenuShortcut");
expectEqual(nsis.installerIcon, "public/app_icon_new.ico", "nsis.installerIcon");
expectEqual(nsis.installerHeaderIcon, "public/app_icon_new.ico", "nsis.installerHeaderIcon");
expectEqual(nsis.uninstallerIcon, "public/app_icon_new.ico", "nsis.uninstallerIcon");
expectEqual(nsis.license, "LICENSE.txt", "nsis.license");
expectIncludes(win.target, "nsis", "win.target");

console.log("Installer config checks passed.");
