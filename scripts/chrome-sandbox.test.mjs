import assert from "node:assert/strict";
import test from "node:test";
import { chromeSandboxArgs } from "./chrome-sandbox.mjs";

test("non-root Linux keeps Chromium's sandbox by default", () => {
  assert.deepEqual(chromeSandboxArgs({ platform: "linux", uid: 1000, override: undefined }), []);
});

test("root Linux keeps the existing Chromium startup workaround", () => {
  assert.deepEqual(chromeSandboxArgs({ platform: "linux", uid: 0, override: undefined }), ["--no-sandbox"]);
});

test("restricted non-root Linux can explicitly opt out", () => {
  assert.deepEqual(chromeSandboxArgs({ platform: "linux", uid: 1000, override: "1" }), ["--no-sandbox"]);
});

test("other override values do not silently disable the sandbox", () => {
  for (const override of ["", "0", "false", "true"]) {
    assert.deepEqual(chromeSandboxArgs({ platform: "linux", uid: 1000, override }), []);
  }
});

test("non-Linux launchers preserve their platform defaults", () => {
  for (const platform of ["darwin", "win32"]) {
    assert.deepEqual(chromeSandboxArgs({ platform, uid: 0, override: "1" }), []);
  }
});
