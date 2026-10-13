import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { lineOnTop, translateAlong } from "../kit/iso-kit.mjs";

const execute = promisify(execFile);

for (const theme of ["", "-light"]) {
  for (const reduced of [true, false]) {
    test(`dial ${theme || "dark"} ${reduced ? "jumps to the complete target in its first reduced-motion frame" : "retains its animated spring"}`, async () => {
      const page = fileURLToPath(new URL(`../examples/dial-indicator/dial-indicator${theme}.html`, import.meta.url));
      const html = readFileSync(page, "utf8");
      const projection = JSON.parse(html.match(/const P = (\{[^\n]+\});/)[1]);
      const stops = JSON.parse(html.match(/const stops = (\[[^\n]+\]);/)[1]);
      const directory = mkdtempSync(join(tmpdir(), "dial-motion-"));
      const preload = join(directory, "observe.js");
      writeFileSync(preload, `${reduced ? "" : `const nativeMedia = matchMedia.bind(window);
window.matchMedia = query => {
  const media = nativeMedia(query);
  if (query === "(prefers-reduced-motion: reduce)") Object.defineProperty(media, "matches", { value: false });
  return media;
};`}
const nativeFrame = requestAnimationFrame.bind(window);
window.motionFrames = [];
window.requestAnimationFrame = callback => nativeFrame(now => {
  callback(now);
  if (window.recordMotion) window.motionFrames.push({
    carriage: document.querySelector('[data-part="carriage"]').getAttribute("transform"),
    plunger: document.querySelector('[data-part="plunger"]').getAttribute("transform"),
    needle: document.querySelector('[data-part="needle"]').getAttribute("d"),
    readout: document.querySelector("[data-readout]").textContent,
    value: document.querySelector(".iso-stage").getAttribute("aria-valuenow")
  });
});
window.addEventListener("keydown", () => { window.motionFrames = []; window.recordMotion = true; });`);
      try {
        const actions = [["key", "Home", ".iso-stage"], ["until", "window.motionFrames.length > 0", 10000], ["eval", "window.motionFrames[0]"], ["wait", 1000], ["eval", "window.motionFrames.map(frame => frame.readout)"], ["until", "new Promise(resolve => { const count = window.motionFrames.length; setTimeout(() => resolve(window.motionFrames.length === count), 200); })", 10000], ["eval", "window.beforeBlur = window.motionFrames.length"], ["eval", '(document.querySelector(".iso-stage").blur(), true)'], ["until", "window.motionFrames.length > window.beforeBlur", 10000], ["wait", 2400], ["eval", "window.motionFrames.length"]];
        const result = await execute(process.execPath, ["scripts/drive.mjs", page, JSON.stringify(actions), "--preload", preload, ...(reduced ? ["--reduced"] : [])], { timeout: 45000 });
        const values = [...result.stdout.matchAll(/^eval: (.*)$/gm)].map(match => JSON.parse(match[1]));
        const expected = {
          carriage: translateAlong(projection, [stops[2], 0, 0]),
          plunger: translateAlong(projection, [0, 0, 18]),
          needle: lineOnTop([58 - Math.sin(Math.PI) * 3.4, Math.cos(Math.PI) * 3.4], [58 + Math.sin(Math.PI) * 16, -Math.cos(Math.PI) * 16], 92.2, projection),
          readout: "block 3 · reads 10.0 px",
          value: "10",
        };
        if (reduced) {
          assert.deepEqual(values[0], expected, "first frame must agree with the selected model height");
          assert.equal(values[1].length, 1, "no spring animation after the target frame");
          assert.equal(values[2], 1, "selection remains settled before blur");
          assert.equal(values[4], 2, "blur may draw once but must not tour");
        } else {
          assert.equal(values[0].value, "10");
          assert.notEqual(values[0].plunger, expected.plunger);
          assert.ok(values[1].some(text => !["10.0", "14.0", "18.0"].includes(text.match(/reads ([\d.]+) px/)[1])), "normal plunger must spring between block heights");
          assert.ok(values[4] > values[2] + 1, "normal tour must resume after settling and blur");
        }
        assert.match(result.stdout, /console: clean/);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
}
