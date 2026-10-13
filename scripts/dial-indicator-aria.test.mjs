import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execute = promisify(execFile);

for (const theme of ["", "-light"]) {
  for (const reduced of [false, true]) {
    test(`dial indicator ${theme || "dark"} keyboard selections avoid duplicate announcements${reduced ? " with reduced motion" : ""}`, async () => {
      const page = fileURLToPath(new URL(`../examples/dial-indicator/dial-indicator${theme}.html`, import.meta.url));
      const observe = `(()=>{const stage=document.querySelector(".iso-stage");window.ariaWrites=[];new MutationObserver(records=>window.ariaWrites.push(...records.map(record=>record.attributeName))).observe(stage,{attributes:true,attributeFilter:["aria-valuenow","aria-valuetext"]});return true})()`;
      const inspect = `(()=>{const stage=document.querySelector(".iso-stage");const writes=window.ariaWrites.splice(0);return {value:stage.getAttribute("aria-valuenow"),min:stage.getAttribute("aria-valuemin"),max:stage.getAttribute("aria-valuemax"),writes,focused:document.activeElement===stage}})()`;
      const choices = [["ArrowDown", "14", 2], ["ArrowLeft", "10", 2], ["ArrowDown", "10", 0], ["ArrowUp", "14", 2], ["ArrowRight", "18", 2], ["ArrowUp", "18", 0], ["Home", "10", 2], ["End", "18", 2], ["End", "18", 0]];
      const actions = [["key", "ArrowRight", ".iso-stage"], ["eval", observe]];
      for (const [key] of choices) actions.push(["key", key, ".iso-stage"], ["eval", inspect]);
      const result = await execute(process.execPath, ["scripts/drive.mjs", page, JSON.stringify(actions), ...(reduced ? ["--reduced"] : [])], { timeout: 30000 });
      const evaluations = [...result.stdout.matchAll(/^eval: (.*)$/gm)].slice(1).map(match => JSON.parse(match[1]));
      assert.equal(evaluations.length, choices.length, result.stdout);
      choices.forEach(([key, value, writes], index) => {
        assert.equal(evaluations[index].value, value, key);
        assert.equal(evaluations[index].min, "10");
        assert.equal(evaluations[index].max, "18");
        assert.equal(evaluations[index].focused, true, key);
        assert.deepEqual(evaluations[index].writes.sort(), writes ? ["aria-valuenow", "aria-valuetext"] : [], key);
      });
      assert.match(result.stdout, /console: clean/);
    });
  }
}

for (const theme of ["", "-light"]) {
  test(`dial indicator ${theme || "dark"} selects a height on touch press without pointer movement`, async () => {
    const page = fileURLToPath(new URL(`../examples/dial-indicator/dial-indicator${theme}.html`, import.meta.url));
    const press = `(()=>{const stage=document.querySelector(".iso-stage");stage.focus();window.ariaWrites=[];new MutationObserver(records=>window.ariaWrites.push(...records.map(record=>record.attributeName))).observe(stage,{attributes:true,attributeFilter:["aria-valuenow","aria-valuetext"]});const box=stage.querySelector("svg").getBoundingClientRect();stage.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,pointerType:"touch",pointerId:2,clientX:box.left+box.width/2,clientY:box.top+box.height/2}));return true})()`;
    const inspect = `(()=>{const stage=document.querySelector(".iso-stage");return {value:stage.getAttribute("aria-valuenow"),text:stage.getAttribute("aria-valuetext"),writes:window.ariaWrites,visual:document.querySelector("[data-readout]").textContent,touchAction:getComputedStyle(stage).touchAction}})()`;
    const actions = [["eval", press], ["until", 'document.querySelector("[data-readout]").textContent === "block 2 · reads 14.0 px"', 10000], ["eval", inspect], ["wait", 4200], ["eval", inspect]];
    const result = await execute(process.execPath, ["scripts/drive.mjs", page, JSON.stringify(actions), "--width", "390", "--reduced"], { timeout: 30000 });
    const evaluations = [...result.stdout.matchAll(/^eval: (.*)$/gm)];
    assert.equal(evaluations.length, 3, result.stdout);
    const observed = JSON.parse(evaluations[1][1]);
    assert.equal(observed.value, "14");
    assert.equal(observed.text, "block 2 selected · target height 14.0 px");
    assert.deepEqual(observed.writes.sort(), ["aria-valuenow", "aria-valuetext"]);
    assert.equal(observed.visual, "block 2 · reads 14.0 px");
    assert.equal(observed.touchAction, "pan-y");
    assert.deepEqual(JSON.parse(evaluations[2][1]), observed);
    assert.match(result.stdout, /console: clean/);
  });
}

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
