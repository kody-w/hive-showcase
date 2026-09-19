import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserPath = process.env.HIVE_SHOWCASE_BROWSER ||
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function options(argv) {
  const result = { projects: [], output: "evidence/browser-smoke.json", all: false, width: 1440, height: 1000 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--all") result.all = true;
    else if (["--base-url", "--output", "--project", "--scenarios", "--width", "--height"].includes(flag)) {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Missing ${flag} value`);
      const value = argv[++i];
      if (flag === "--project") result.projects.push(value);
      else result[flag.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
    } else throw new Error(`Unknown option ${flag}`);
  }
  const url = new URL(result.baseUrl);
  const localPreview = url.protocol === "http:" && url.hostname === "127.0.0.1";
  const publicShowcase = url.protocol === "https:" && url.hostname === "kody-w.github.io" &&
    url.pathname === "/hive-showcase/" && !url.port;
  if ((!localPreview && !publicShowcase) || url.username || url.password ||
      !url.pathname.endsWith("/") || url.search || url.hash) {
    throw new Error("--base-url must be a loopback preview or the authorized public showcase, with a trailing slash.");
  }
  result.baseUrl = url.href;
  for (const dimension of ["width", "height"]) {
    result[dimension] = Number(result[dimension]);
    if (!Number.isInteger(result[dimension]) || result[dimension] < 300 || result[dimension] > 2500) {
      throw new Error(`--${dimension} must be an integer from 300 to 2500.`);
    }
  }
  return result;
}

function localPath(relative) {
  const resolved = path.resolve(root, relative);
  if (path.isAbsolute(relative) || !resolved.startsWith(root + path.sep) || relative.split("/").includes("..")) {
    throw new Error("Evidence path must stay inside this repository.");
  }
  return resolved;
}

class Protocol {
  constructor(socket) {
    this.socket = socket;
    this.counter = 0;
    this.pending = new Map();
    this.events = [];
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const waiter = this.pending.get(message.id);
        if (!waiter) return;
        this.pending.delete(message.id);
        clearTimeout(waiter.timer);
        if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
        else waiter.resolve(message.result);
      } else {
        this.events.push(message);
      }
    });
    socket.addEventListener("close", () => {
      for (const waiter of this.pending.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error("Isolated browser connection closed."));
      }
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Browser connection timed out.")), 10000);
      socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Browser connection failed.")); }, { once: true });
    });
    return new Protocol(socket);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.counter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Browser command timed out: ${method}`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  async evaluate(sessionId, expression) {
    const result = await this.send("Runtime.evaluate", {
      expression, returnByValue: true, awaitPromise: true,
    }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
}

async function launch(profile) {
  const child = spawn(browserPath, [
    "--headless=new", "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--disable-component-update", "--disable-sync",
    "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let diagnostics = "";
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Isolated Edge startup timed out: " + diagnostics.slice(-3000)));
    }, 20000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Isolated Edge exited (${code}): ${diagnostics.slice(-3000)}`));
    });
    child.stderr.on("data", (bytes) => {
      diagnostics = (diagnostics + bytes.toString()).slice(-16000);
      const match = diagnostics.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[a-zA-Z0-9-]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  return { child, endpoint };
}

async function waitFor(protocol, session, expression, description) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await protocol.evaluate(session, expression)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function performAction(protocol, session, action) {
  const encoded = JSON.stringify(action);
  const result = await protocol.evaluate(session, `(() => {
    const action = ${encoded};
    if (action.type === "game-api") {
      const methods = ["reset", "snapshot", "act", "run", "score", "view"];
      if (!location.pathname.endsWith("/projects/01-game-studio/index.html") ||
          !methods.includes(action.method) || !Array.isArray(action.args)) {
        throw new Error("Unsupported semantic game action");
      }
      if (!window.hiveGame) throw new Error("Documented bounded game API is unavailable");
      return window.hiveGame[action.method](...action.args);
    }
    const node = document.querySelector(action.selector);
    if (!node) throw new Error("Missing action target: " + action.selector);
    if (action.type === "click") {
      if (node.disabled) throw new Error("Action target is disabled");
      node.click();
    } else if (action.type === "input" || action.type === "select") {
      const prototype = node instanceof HTMLSelectElement ? HTMLSelectElement.prototype :
        node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
      setter.call(node, String(action.value));
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (action.type !== "assert") {
      throw new Error("Unsupported bounded browser action");
    }
    return { target: action.selector, text: node.textContent?.trim().slice(0, 500), value: node.value, checked: node.checked };
  })()`);
  if (action.expectResult) {
    for (const [key, value] of Object.entries(action.expectResult)) {
      if (JSON.stringify(result?.[key]) !== JSON.stringify(value)) {
        throw new Error(`Semantic game result ${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(result?.[key])}`);
      }
    }
  }
  if (action.expect) {
    try {
      await waitFor(protocol, session, `(() => {
        const expected = ${JSON.stringify(action.expect)};
        const node = document.querySelector(expected.selector);
        if (!node) return false;
        return (!expected.includes || node.textContent.includes(expected.includes)) &&
          (expected.value === undefined || node.value === String(expected.value)) &&
          (expected.disabled === undefined || Boolean(node.disabled) === expected.disabled) &&
          (expected.hidden === undefined || node.hidden === expected.hidden) &&
          (expected.checked === undefined || node.checked === expected.checked);
      })()`, JSON.stringify(action.expect));
    } catch (error) {
      const readback = await protocol.evaluate(session, `(() => {
        const node = document.querySelector(${JSON.stringify(action.expect.selector)});
        return node ? {text:node.textContent?.slice(0, 1200), value:node.value, disabled:node.disabled, hidden:node.hidden, checked:node.checked} : null;
      })()`);
      throw new Error(`${error.message}; actual readback: ${JSON.stringify(readback)}`);
    }
  }
  await sleep(100);
  return result;
}

async function inspectPage(protocol, session, config, page, actions) {
  const start = protocol.events.length;
  await protocol.send("Page.navigate", { url: new URL(page.route, config.baseUrl).href }, session);
  await waitFor(protocol, session, "document.readyState === 'complete'", "document load");
  if (page.id === "portal") {
    await waitFor(protocol, session, "document.querySelectorAll('[data-project]').length === 10", "ten portal cards");
  }
  await sleep(250);
  const actionResults = [];
  for (const action of actions) actionResults.push({ action, result: await performAction(protocol, session, action) });
  const snapshot = await protocol.evaluate(session, `(() => ({
    title: document.title,
    url: location.href,
    ready: document.readyState,
    bodyText: document.body.innerText.slice(0, 18000),
    controls: [...document.querySelectorAll("button,input,select,textarea")].slice(0, 100).map(node => ({
      tag: node.tagName.toLowerCase(), id: node.id, name: node.name || null,
      type: node.type || null, text: (node.textContent || "").trim().slice(0, 160),
      value: node.value, disabled: Boolean(node.disabled), checked: node.checked,
      ...(node.options ? { options: [...node.options].map(option => ({ value: option.value, text: option.text })) } : {})
    })),
    cardCount: document.querySelectorAll("[data-project]").length,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1
  }))()`);
  if (!snapshot.title || snapshot.bodyText.length < 50) throw new Error("Page did not render meaningful content.");
  const events = protocol.events.slice(start).filter((event) => event.sessionId === session);
  const exceptions = events.filter((event) => event.method === "Runtime.exceptionThrown").map((event) => event.params);
  const errors = events.filter((event) => event.method === "Runtime.consoleAPICalled" && event.params.type === "error").map((event) => event.params);
  const failedResponses = events.filter((event) => event.method === "Network.responseReceived" &&
    event.params.response.status >= 400 &&
    !event.params.response.url.endsWith("/favicon.ico")).map((event) => ({
      url: event.params.response.url, status: event.params.response.status,
    }));
  const screenshot = await protocol.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, session);
  const relativeScreenshot = `evidence/screenshots/${page.id}-${config.width}x${config.height}.png`;
  await mkdir(path.dirname(localPath(relativeScreenshot)), { recursive: true });
  await writeFile(localPath(relativeScreenshot), Buffer.from(screenshot.data, "base64"));
  return {
    id: page.id, ...snapshot, actions: actionResults, exceptions, consoleErrors: errors,
    failedResponses, screenshot: relativeScreenshot,
    status: exceptions.length || errors.length || snapshot.horizontalOverflow ? "failed" : "passed",
  };
}

async function main() {
  const config = options(process.argv.slice(2));
  const catalog = JSON.parse(await readFile(path.join(root, "assets/catalog.json"), "utf8"));
  const known = new Set(catalog.map((item) => item.id));
  if (config.projects.some((id) => !known.has(id))) throw new Error("Unknown project id.");
  const scenarios = config.scenarios ? JSON.parse(await readFile(localPath(config.scenarios), "utf8")) : {};
  const pages = [{ id: "portal", route: "index.html" }, ...catalog
    .filter((spec) => config.all || config.projects.includes(spec.id))
    .map((spec) => ({ id: spec.id, route: `projects/${spec.id}/index.html` }))];
  const previewRoot = path.join(root, ".preview");
  await mkdir(previewRoot, { recursive: true });
  const profile = await mkdtemp(path.join(previewRoot, "isolated-edge-"));
  let child;
  let protocol;
  try {
    const launched = await launch(profile);
    child = launched.child;
    protocol = await Protocol.connect(launched.endpoint);
    const version = await protocol.send("Browser.getVersion");
    const { targetId } = await protocol.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await protocol.send("Target.attachToTarget", { targetId, flatten: true });
    await protocol.send("Page.enable", {}, sessionId);
    await protocol.send("Runtime.enable", {}, sessionId);
    await protocol.send("Network.enable", {}, sessionId);
    await protocol.send("Emulation.setDeviceMetricsOverride", {
      width: config.width, height: config.height, deviceScaleFactor: 1, mobile: config.width < 600,
    }, sessionId);
    const report = {
      schema: "local-hive-browser-checks/1",
      recordedAt: new Date().toISOString(), allProjects: config.all,
      browser: version, mode: "isolated-headless-profile",
      viewport: { width: config.width, height: config.height },
      limitations: [
        "Separate temporary browser profile; no access to the user's authenticated browser data.",
        "Automated rendering and listed interactions, not human acceptance or exhaustive UX testing.",
      ],
      pages: [],
    };
    for (const page of pages) {
      try {
        const result = await inspectPage(protocol, sessionId, config, page, scenarios[page.id] || []);
        if (config.all && result.failedResponses.length) result.status = "failed";
        report.pages.push(result);
        console.log(result.status.toUpperCase(), page.id, result.title);
      } catch (error) {
        report.pages.push({ id: page.id, status: "failed", error: error.message });
        console.error("FAILED", page.id, error.message);
      }
    }
    report.status = report.pages.every((page) => page.status === "passed") ? "passed" : "failed";
    await mkdir(path.dirname(localPath(config.output)), { recursive: true });
    await writeFile(localPath(config.output), JSON.stringify(report, null, 2) + "\n");
    process.exitCode = report.status === "passed" ? 0 : 1;
    await protocol.send("Target.closeTarget", { targetId });
  } finally {
    let shutdownError = null;
    if (protocol && protocol.socket.readyState === WebSocket.OPEN) {
      try {
        await protocol.send("Browser.close");
      } catch (error) {
        if (error.message !== "Isolated browser connection closed.") shutdownError = error;
      }
    }
    if (protocol && protocol.socket.readyState !== WebSocket.CLOSED) protocol.socket.close();
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      const completed = await Promise.race([exited.then(() => true), sleep(5000).then(() => false)]);
      if (!completed) {
        child.kill("SIGKILL");
        await exited;
      }
    }
    if (child?.stderr) child.stderr.destroy();
    if (!profile.startsWith(previewRoot + path.sep + "isolated-edge-")) throw new Error("Refusing unexpected cleanup path.");
    await rm(profile, { recursive: true, force: true });
    if (shutdownError) throw shutdownError;
  }
}

main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
