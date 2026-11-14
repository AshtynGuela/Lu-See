import "dotenv/config";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = Number(process.env.PORT) || 5175;
const url = `http://127.0.0.1:${port}`;

async function isRunning() {
  try {
    const response = await fetch(url + "/api/health", { signal: AbortSignal.timeout(750) });
    return response.ok && (await response.json()).app === "Lu-See";
  } catch {
    return false;
  }
}

function openBrowser() {
  console.log(`Open ${url} in your browser.`);
  if (process.env.LUSEE_NO_BROWSER === "1") return;
  const browser = spawn("explorer.exe", [url], { detached: true, stdio: "ignore" });
  browser.on("error", () => {});
  browser.unref();
}

if (await isRunning()) {
  console.log("Lu-See is already running.");
  openBrowser();
} else {
  const server = spawn(process.execPath, ["server/index.mjs"], {
    stdio: "inherit",
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
  });
  const finished = new AbortController();
  const forwardInterrupt = () => server.kill();
  process.once("SIGINT", forwardInterrupt);
  process.once("SIGTERM", forwardInterrupt);
  const exit = new Promise(resolve => {
    server.once("error", error => { console.error(error.message); resolve(1); });
    server.once("exit", (code, signal) => resolve(code ?? (signal ? 0 : 1)));
  }).then(code => {
    finished.abort();
    process.removeListener("SIGINT", forwardInterrupt);
    process.removeListener("SIGTERM", forwardInterrupt);
    return code;
  });
  for (let attempt = 0; attempt < 40 && !finished.signal.aborted; attempt++) {
    if (await isRunning()) {
      openBrowser();
      break;
    }
    await delay(250, undefined, { signal: finished.signal }).catch(() => {});
  }
  process.exitCode = await exit;
}
