import { readFileSync } from "node:fs";
import { Script } from "node:vm";

// This is a deliberately small event/DOM double, not a browser or accessibility observation.
class ElementDouble {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = document;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.handlers = new Map();
    this.value = "";
    this.hidden = false;
    this.disabled = false;
    this.className = "";
    this.files = [];
    this.ownText = "";
  }
  set id(value) { this.identifier = value; this.ownerDocument.ids.set(value, this); }
  get id() { return this.identifier ?? ""; }
  set textContent(value) { this.ownText = String(value); this.replaceChildren(); }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(""); }
  set innerHTML(_) { throw new Error("The UI must not interpret imported markup."); }
  append(...children) {
    for (const child of children) {
      child.remove();
      child.parentElement = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...children);
  }
  remove() {
    if (this.parentElement) {
      const siblings = this.parentElement.children;
      siblings.splice(siblings.indexOf(this), 1);
      this.parentElement = null;
    }
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  matches(selector) {
    if (selector.startsWith(".")) return this.className.split(" ").includes(selector.slice(1));
    const data = selector.match(/^\[data-([a-z-]+)(?:="([^"]*)")?\]$/);
    if (data) {
      const key = data[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return Object.hasOwn(this.dataset, key) && (data[2] === undefined || this.dataset[key] === data[2]);
    }
    return this.tagName === selector.toUpperCase();
  }
  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches(selector)) return node;
      node = node.parentElement;
    }
    return null;
  }
  addEventListener(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(handler);
  }
  fire(type) {
    const event = { target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    const path = [];
    for (let node = this; node; node = node.parentElement) path.push(node);
    const pending = [];
    for (const node of path) for (const handler of node.handlers.get(type) ?? []) {
      const result = handler(event);
      if (result?.then) pending.push(result);
    }
    return Promise.all(pending);
  }
  click() {
    if (this.disabled) return Promise.resolve();
    if (this.tagName === "A" && this.download)
      this.ownerDocument.downloads.push({ name: this.download, blob: this.ownerDocument.blobs.get(this.href) });
    return this.fire("click");
  }
  focus() { this.ownerDocument.activeElement = this; }
}

export function makeUiDouble() {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const code = readFileSync(new URL("../app.bundle.js", import.meta.url), "utf8");
  const timers = [];
  const document = {
    ids: new Map(), downloads: [], blobs: new Map(), activeElement: null,
    createElement(tag) { return new ElementDouble(tag, this); },
    getElementById(id) {
      if (!this.ids.has(id)) throw new Error(`Missing UI ID: ${id}`);
      return this.ids.get(id);
    },
  };
  document.body = document.createElement("body");
  const formStart = html.indexOf('<form id="agenda-form"');
  const formEnd = html.indexOf("</form>", formStart);
  for (const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const element = document.createElement(match[1]);
    element.id = match[3];
    element.hidden = /\bhidden\b/.test(match[2]);
    element.disabled = /\bdisabled\b/.test(match[2]);
    element.className = match[2].match(/\bclass="([^"]*)"/)?.[1] ?? "";
    if (element.tagName === "SELECT") {
      const end = html.indexOf("</select>", match.index);
      element.value = html.slice(match.index, end).match(/<option\b[^>]*value="([^"]*)"/)?.[1] ?? "";
    }
    const parent = match.index > formStart && match.index < formEnd && element.id !== "agenda-form"
      ? document.ids.get("agenda-form") : document.body;
    parent.append(element);
  }
  let blobIndex = 0;
  const urls = {
    createObjectURL(blob) {
      const url = `blob:node-dom-double-${++blobIndex}`;
      document.blobs.set(url, blob);
      return url;
    },
    revokeObjectURL(url) { document.blobs.delete(url); },
  };
  new Script(code, { filename: "original-local-app.bundle.js" }).runInNewContext({
    document, Blob, TextEncoder, URL: urls, console,
    setTimeout(callback) { timers.push(callback); return timers.length; },
  }, { timeout: 3000 });
  return {
    document,
    get: id => document.getElementById(id),
    flush() {
      let count = 0;
      while (timers.length) {
        if (++count > 30) throw new Error("Unexpected UI timer loop.");
        timers.shift()();
      }
    },
    async latestDownload() {
      const download = document.downloads.at(-1);
      if (!download) throw new Error("No explicit JSON download was requested.");
      return JSON.parse(await download.blob.text());
    },
  };
}
