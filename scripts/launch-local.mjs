import "dotenv/config";
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

let port = Number(process.env.PORT) || 5175;
const localUrl = () => `http://127.0.0.1:${port}`;

async function isRunning() {
  try {
    const response = await fetch(localUrl() + "/api/health", { signal: AbortSignal.timeout(750) });
    return response.ok && (await response.json()).app === "AMAZE-X";
  } catch {
    return false;
  }
}

function openBrowser() {
  const url = localUrl();
  console.log(`Open ${url} in your browser.`);
  if (process.env.LUSEE_NO_BROWSER === "1") return;
  const browser = spawn("explorer.exe", [url], { detached: true, stdio: "ignore" });
  browser.on("error", () => {});
  browser.unref();
}

function portInUse() {
  return new Promise(resolve => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}

const preferredPort = port;
while (port < preferredPort + 10 && await portInUse() && !await isRunning()) port++;
if (port !== preferredPort) console.log(`Using port ${port} because port ${preferredPort} is busy.`);

if (await isRunning()) {
  console.log("AMAZE-X is already running.");
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
