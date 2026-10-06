import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import assert from "node:assert/strict";
mkdirSync(".artifacts", { recursive: true });
const driver = spawn(
  "tauri-driver",
  process.env.NATIVE_DRIVER
    ? ["--native-driver", process.env.NATIVE_DRIVER]
    : [],
  { windowsHide: true, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
);
const log = createWriteStream(".artifacts/desktop-driver.log");
driver.stdout.pipe(log);
driver.stderr.pipe(log);
let id;
async function request(path, body, method = "POST") {
  const res = await fetch("http://127.0.0.1:4444" + path, {
    method,
    signal: AbortSignal.timeout(path === "/session" ? 60000 : 15000),
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  if (json.value?.error) throw new Error(JSON.stringify(json.value));
  return json.value;
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(fn) {
  let last;
  for (let i = 0; i < 60; i++) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (e) {
      last = e;
    }
    await pause(500);
  }
  throw last || new Error("Timed out");
}
const execute = (fn, ...args) =>
  request("/session/" + id + "/execute/sync", {
    script: "return (" + fn.toString() + ").apply(null, arguments)",
    args,
  });
const inputValue = (label) =>
  execute(
    (label) =>
      [...document.querySelectorAll("input")].find(
        (i) => i.getAttribute("aria-label") === label,
      )?.value,
    label,
  );
const click = (label) =>
  execute((label) => {
    const b = [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === label,
    );
    if (!b) throw new Error("Missing button: " + label);
    b.click();
    return true;
  }, label);
try {
  const application = resolve(process.argv[2]);
  const started = performance.now();
  await wait(() => request("/status", null, "GET"));
  console.log("Creating native session");
  const session = await request("/session", {
    capabilities: {
      alwaysMatch: {
        "tauri:options": {
          application,
          ...(process.platform === "win32"
            ? {
                webviewOptions: {
                  additionalBrowserArguments: ["--remote-debugging-port=0"],
                },
              }
            : {}),
        },
      },
    },
  });
  id = session.sessionId;
  console.log("Native session created");
  await wait(() => execute(() => !!document.querySelector("h1")));
  const startupMs = Math.round(performance.now() - started);
  await execute(() => {
    localStorage.setItem("i18nextLng", "en-US");
    location.reload();
    return true;
  });
  await wait(() =>
    execute(() => document.body.textContent.includes("Open folder")),
  );
  await click("Open folder");
  await wait(() =>
    execute(
      () => document.querySelectorAll("[data-testid=book-row]").length === 3,
    ),
  );
  console.log("Scanned real EPUB files");
  await execute(() => {
    document
      .querySelector('input[aria-label="Select all visible books"]')
      .click();
    return true;
  });
  await execute(() => {
    const i = document.querySelector("#series-name");
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(i, "Desktop test & 系列");
    i.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  });
  await click("Apply series name");
  await wait(
    async () => (await inputValue("Series 01.epub")) === "Desktop test & 系列",
  );
  await execute(() => {
    document.querySelector("button[aria-label=Undo]").click();
    return true;
  });
  await wait(async () => (await inputValue("Series 01.epub")) === "Original");
  await click("Apply series name");
  await click("Number from 1");
  await execute(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.startsWith("Save changes"))
      .click();
    return true;
  });
  await wait(() =>
    execute(
      () =>
        document.querySelector("footer [role=status]").textContent ===
        "Changes saved",
    ),
  );
  await execute(() => {
    document.querySelector("button[aria-label=Refresh]").click();
    return true;
  });
  await wait(
    async () => (await inputValue("Series 01.epub")) === "Desktop test & 系列",
  );
  const refused = await request("/session/" + id + "/execute/async", {
    script:
      'const done=arguments[0];window.__TAURI_INTERNALS__.invoke("save_epub",{request:{filePath:"/outside.epub",fingerprint:"x",series:"x",seriesIndex:"1",backup:false,writeEpub3:true,writeCalibre:true}}).then(()=>done(false),()=>done(true))',
    args: [],
  });
  assert.equal(refused, true);
  const screenshot = await request(
    "/session/" + id + "/screenshot",
    null,
    "GET",
  );
  writeFileSync(".artifacts/desktop.png", Buffer.from(screenshot, "base64"));
  writeFileSync(
    ".artifacts/desktop-test.json",
    JSON.stringify(
      {
        platform: process.platform,
        startupMs,
        checks: [
          "real scan",
          "batch edit",
          "undo",
          "numbering",
          "save",
          "rescan",
          "path rejection",
        ],
      },
      null,
      2,
    ),
  );
  console.log("Desktop integration passed; startup " + startupMs + " ms");
} catch (error) {
  if (id) {
    console.error(await execute(() => document.body.innerText).catch(() => ""));
    const shot = await request(
      "/session/" + id + "/screenshot",
      null,
      "GET",
    ).catch(() => null);
    if (shot)
      writeFileSync(
        ".artifacts/desktop-failure.png",
        Buffer.from(shot, "base64"),
      );
  }
  throw error;
} finally {
  if (id) await request("/session/" + id, null, "DELETE").catch(() => {});
  driver.kill();
  log.end();
}
