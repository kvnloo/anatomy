import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execute = promisify(execFile);

for (const theme of ["", "-light"]) {
  test(`dial indicator ${theme || "dark"} updates accessible values on selection, not animation frames`, async () => {
    const page = fileURLToPath(new URL(`../examples/dial-indicator/dial-indicator${theme}.html`, import.meta.url));
    const observe = `(()=>{const stage=document.querySelector(".iso-stage");window.ariaWrites=[];window.readoutWrites=0;new MutationObserver(records=>{for(const record of records)window.ariaWrites.push(record.attributeName)}).observe(stage,{attributes:true,attributeFilter:["aria-valuenow","aria-valuetext"]});new MutationObserver(()=>window.readoutWrites++).observe(document.querySelector("[data-readout]"),{childList:true});return stage.getAttribute("aria-valuetext")})()`;
    const inspect = `(()=>{const stage=document.querySelector(".iso-stage");return {value:stage.getAttribute("aria-valuenow"),text:stage.getAttribute("aria-valuetext"),writes:window.ariaWrites,visual:document.querySelector("[data-readout]").textContent,readoutWrites:window.readoutWrites}})()`;
    const actions = [["eval", observe], ["key", "ArrowLeft", ".iso-stage"], ["wait", 600], ["eval", inspect], ["wait", 4200], ["eval", inspect]];
    const result = await execute(process.execPath, ["scripts/drive.mjs", page, JSON.stringify(actions)], { timeout: 30000 });
    const evaluations = [...result.stdout.matchAll(/^eval: (.*)$/gm)];
    assert.equal(evaluations.length, 3, result.stdout);
    const observed = JSON.parse(evaluations[1][1]);
    assert.equal(observed.value, "14");
    assert.equal(observed.text, "block 2 selected · target height 14.0 px");
    assert.deepEqual(observed.writes.sort(), ["aria-valuenow", "aria-valuetext"]);
    assert.match(observed.visual, /block 2 · reads/);
    assert.ok(observed.readoutWrites > 1, `visual readout should animate: ${result.stdout}`);
    const afterIdle = JSON.parse(evaluations[2][1]);
    assert.equal(afterIdle.value, observed.value);
    assert.equal(afterIdle.text, observed.text);
    assert.deepEqual(afterIdle.writes.sort(), ["aria-valuenow", "aria-valuetext"]);
    assert.match(afterIdle.visual, /block 2 · reads 14\.0 px/);
    assert.match(result.stdout, /console: clean/);
  });
}
