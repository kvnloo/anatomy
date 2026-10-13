import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

for (const name of ["capture", "drive", "turn-check"]) {
  for (const [platform, uid, override, sandbox] of [
    ["linux", 1000, "", true],
    ["linux", 0, "", false],
    ["linux", 1000, "1", false],
    ["linux", 1000, "true", true],
    ["darwin", 0, "1", true],
    ["win32", 0, "1", true],
  ]) {
    test(`${name} launch policy: ${platform}, uid ${uid}, override ${JSON.stringify(override)}`, () => {
      const entry = new URL(`./${name}.mjs`, import.meta.url).href;
      const bootstrap = `
        import childProcess from "node:child_process";
        import { rmSync } from "node:fs";
        import { syncBuiltinESMExports } from "node:module";
        Object.defineProperty(process, "platform", { value: ${JSON.stringify(platform)} });
        process.getuid = () => ${uid};
        process.env.ANATOMY_NO_SANDBOX = ${JSON.stringify(override)};
        process.env.CHROME_PATH = process.execPath;
        globalThis.WebSocket ??= class {};
        process.argv = [process.execPath, ${JSON.stringify(entry)}, "figure.html", ${JSON.stringify(name === "drive" ? "[]" : "--lines")}];
        childProcess.spawn = (binary, args) => {
          const profile = args.find(arg => arg.startsWith("--user-data-dir="));
          if (profile) rmSync(profile.slice("--user-data-dir=".length), { recursive: true, force: true });
          console.log(JSON.stringify({ binary, args }));
          process.exit(0);
        };
        syncBuiltinESMExports();
        await import(${JSON.stringify(entry)});
      `;
      const result = spawnSync(process.execPath, ["--input-type=module", "--eval", bootstrap], { encoding: "utf8", timeout: 15000 });
      assert.equal(result.status, 0, result.stderr);
      const { binary, args } = JSON.parse(result.stdout);
      assert.equal(binary, process.execPath);
      assert.ok(args.includes("--headless=new"));
      assert.equal(args.includes("--no-sandbox"), !sandbox);
      assert.equal(args.includes("--do-not-de-elevate"), platform === "win32");
      assert.equal(args.filter(arg => arg === "--no-sandbox").length, sandbox ? 0 : 1);
    });
  }
}
