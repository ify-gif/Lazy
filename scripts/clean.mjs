import { rmSync, existsSync } from "fs";
import { resolve } from "path";

const targets = [".next", "out", "dist-electron", "release"];

for (const target of targets) {
  const fullPath = resolve(process.cwd(), target);
  if (!existsSync(fullPath)) {
    console.log(`skip: ${target} (not found)`);
    continue;
  }

  rmSync(fullPath, { recursive: true, force: true });
  console.log(`removed: ${target}`);
}

