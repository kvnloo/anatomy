import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { publish } from "./publish.mjs";

const SKILL = resolve(import.meta.dirname, "..");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "anatomy-submit-"));
  const repo = join(root, "gallery");
  const upstream = join(root, "upstream.git");
  const fork = join(root, "fork.git");
  mkdirSync(join(repo, "figures"), { recursive: true });
  mkdirSync(join(repo, "scripts"));
  writeFileSync(join(repo, "figures", ".gitkeep"), "");
  writeFileSync(join(repo, "scripts", "validate.mjs"), "");
  writeFileSync(join(repo, ".gitignore"), ".skill\nshots/\n");
  const env = { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(root, "no-global-config") };
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: repo, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "-b", "main");
  git("add", ".");
  git("commit", "-m", "gallery fixture");
  git("clone", "--bare", repo, upstream);
  git("init", "--bare", fork);
  const options = { source: join(SKILL, "examples", "dial-indicator"), into: repo, id: "dial-indicator", title: "Dial indicator", prompt: "/anatomy a dial indicator", author: "Octo-Cat", agent: "Codex", license: "MIT", build: "build.mjs", tags: [], noPreview: true, noSession: true };
  const entry = new URL("./publish.mjs", import.meta.url);
  const submit = (extra = []) => {
    const argv = [fileURLToPath(entry), options.source, "--into", repo, "--id", options.id, "--title", options.title, "--prompt", options.prompt, "--author", options.author, "--agent", options.agent, "--no-preview", "--no-session", "--submit", "--yes", ...extra];
    const bootstrap = `
      import childProcess from "node:child_process";
      import { syncBuiltinESMExports } from "node:module";
      const realSpawnSync = childProcess.spawnSync;
      childProcess.spawnSync = (tool, args, options) => {
        if (tool === "gh") {
          let stdout = "";
          if (args[0] === "api") stdout = args[1] === "user" ? "Octo-Cat\\n" : "false\\n";
          if (args[0] === "pr" && args[1] === "create") stdout = "https://example.invalid/fixture/pull/1\\n";
          return { status: 0, stdout, stderr: "" };
        }
        if (tool === "git" && (args[0] === "fetch" || args[0] === "push")) {
          args = args.map(arg => arg.startsWith("https://github.com/") ? (args[0] === "fetch" ? ${JSON.stringify(upstream)} : ${JSON.stringify(fork)}) : arg);
        }
        return realSpawnSync(tool, args, options);
      };
      syncBuiltinESMExports();
      process.argv = [process.execPath, ...${JSON.stringify(argv)}];
      await import(${JSON.stringify(entry.href)});
    `;
    return spawnSync(process.execPath, ["--input-type=module", "--eval", bootstrap], { cwd: repo, env, encoding: "utf8", timeout: 30000 });
  };
  return { root, repo, fork, options, git, submit };
}

for (const force of [false, true]) {
  test(`--submit ${force ? "--force replaces" : "preserves"} a committed figure on an off-checkout submission branch`, () => {
    const f = fixture();
    try {
      const { dest } = publish(f.options);
      const sentinel = "figures/octo-cat/dial-indicator/local-note.txt";
      writeFileSync(join(f.repo, sentinel), "committed local work must not disappear without consent\n");
      f.git("switch", "-c", "figure/dial-indicator");
      f.git("add", "figures");
      f.git("commit", "-m", "local work on submission branch");
      const oldBranch = f.git("rev-parse", "refs/heads/figure/dial-indicator");
      const oldBytes = f.git("show", `${oldBranch}:${sentinel}`);
      f.git("switch", "main");
      const oldHead = f.git("rev-parse", "HEAD");
      const result = f.submit(force ? ["--force"] : []);
      if (force) {
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.equal(existsSync(join(dest, "local-note.txt")), false);
        assert.notEqual(f.git("rev-parse", "refs/heads/figure/dial-indicator"), oldBranch);
        assert.equal(f.git("--git-dir", f.fork, "rev-parse", "refs/heads/figure/dial-indicator"), f.git("rev-parse", "HEAD"));
      } else {
        assert.equal(f.git("rev-parse", "refs/heads/figure/dial-indicator"), oldBranch, "without --force the pre-existing submission branch must not be reset from another checkout");
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stderr, /local files were kept/);
        assert.equal(f.git("branch", "--show-current"), "main");
        assert.equal(f.git("rev-parse", "HEAD"), oldHead);
        assert.equal(f.git("show", `refs/heads/figure/dial-indicator:${sentinel}`), oldBytes);
        assert.equal(f.git("status", "--porcelain"), "");
        assert.equal(f.git("--git-dir", f.fork, "for-each-ref", "refs/heads"), "");
      }
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });
}

test("--submit allows an existing submission branch with no figure differences from gallery main", () => {
  const f = fixture();
  try {
    f.git("branch", "figure/dial-indicator");
    const result = f.submit();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(f.git("--git-dir", f.fork, "rev-parse", "refs/heads/figure/dial-indicator"), f.git("rev-parse", "HEAD"));
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("--submit refuses to replace a figure already on gallery main", () => {
  const f = fixture();
  try {
    const { dest } = publish(f.options);
    const sentinel = join(dest, "local-note.txt");
    writeFileSync(sentinel, "already on gallery main\n");
    f.git("add", "figures");
    f.git("commit", "-m", "existing gallery figure");
    f.git("push", join(f.root, "upstream.git"), "main");
    const oldHead = f.git("rev-parse", "HEAD");
    const result = f.submit();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /already exists/);
    assert.equal(readFileSync(sentinel, "utf8"), "already on gallery main\n");
    assert.equal(f.git("rev-parse", "HEAD"), oldHead);
    assert.equal(f.git("status", "--porcelain"), "");
    assert.equal(f.git("--git-dir", f.fork, "for-each-ref", "refs/heads"), "");
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

for (const committed of [false, true]) {
  test(`--submit --force explicitly replaces a ${committed ? "committed" : "untracked"} local figure`, () => {
    const f = fixture();
    try {
      const { dest } = publish(f.options);
      const sentinel = join(dest, "local-note.txt");
      writeFileSync(sentinel, "intentionally replace this\n");
      if (committed) {
        f.git("switch", "-c", "figure/dial-indicator");
        f.git("add", "figures");
        f.git("commit", "-m", "previous local submission");
      }
      const result = f.submit(["--force"]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(existsSync(sentinel), false);
      assert.equal(f.git("--git-dir", f.fork, "rev-parse", "refs/heads/figure/dial-indicator"), f.git("rev-parse", "HEAD"));
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });
}

for (const committed of [false, true]) {
  test(`--submit preserves ${committed ? "committed" : "untracked"} local figure edits through the real git branch switch`, () => {
    const f = fixture();
    try {
      const { dest } = publish(f.options);
      const sentinel = join(dest, "local-note.txt");
      writeFileSync(sentinel, "keep this local work\n");
      const build = join(dest, "src", "build.mjs");
      writeFileSync(build, readFileSync(build, "utf8") + "\nvoid 'local customization';\n");
      const before = [readFileSync(sentinel), readFileSync(build), readFileSync(join(dest, "figure.json"))];
      if (committed) {
        f.git("switch", "-c", "figure/dial-indicator");
        f.git("add", "figures");
        f.git("commit", "-m", "previous local submission");
      }
      const oldHead = f.git("rev-parse", "HEAD");
      const result = f.submit();
      assert.ok(existsSync(sentinel), "submission must not remove the local sentinel");
      if (committed) {
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stderr, /local files were kept/);
        assert.equal(f.git("rev-parse", "HEAD"), oldHead);
      } else {
        assert.equal(result.status, 0, result.stderr);
        assert.equal(f.git("--git-dir", f.fork, "rev-parse", "refs/heads/figure/dial-indicator"), f.git("rev-parse", "HEAD"));
      }
      assert.deepEqual([readFileSync(sentinel), readFileSync(build), readFileSync(join(dest, "figure.json"))], before);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });
}
