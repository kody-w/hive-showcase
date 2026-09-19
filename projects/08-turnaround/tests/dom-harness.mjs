import { runInNewContext } from "node:vm";
import { readText } from "../scripts/inputs.mjs";

class StubNode {
  constructor(document, attributes = {}) {
    this.ownerDocument = document;
    this.attributes = { ...attributes };
    this.value = attributes.value ?? "";
    this.checked = Object.hasOwn(attributes, "checked");
    this.disabled = Object.hasOwn(attributes, "disabled");
    this.hidden = Object.hasOwn(attributes, "hidden");
    this.textContent = "";
    this.children = [];
    this.listeners = new Map();
    this.classes = new Set((attributes.class ?? "").split(/\s+/).filter(Boolean));
    this.classList = {
      toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name),
      contains: name => this.classes.has(name)
    };
  }
  set innerHTML(value) {
    this.markup = value;
    this.ownerDocument.registerMarkup(value);
  }
  get innerHTML() { return this.markup ?? ""; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  append(child) { this.children.push(child); }
  emit(type, updates = {}) {
    Object.assign(this, updates);
    for (const callback of this.listeners.get(type) ?? []) callback({ target: this });
  }
}

class StubDocument {
  constructor(html) {
    this.nodes = new Map();
    this.head = new StubNode(this);
    this.registerMarkup(html);
  }
  registerMarkup(html) {
    for (const match of html.matchAll(/<[a-z][\w:-]*(\s[^<>]*?)?>/gi)) {
      const attributes = {};
      for (const attr of (match[1] ?? "").matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
        attributes[attr[1]] = attr[2] ?? attr[3] ?? attr[4] ?? "";
      }
      if (attributes.id) this.nodes.set(attributes.id, new StubNode(this, attributes));
    }
  }
  getElementById(id) { return this.nodes.get(id) ?? null; }
  createElement(tagName) {
    const node = new StubNode(this);
    node.tagName = tagName.toUpperCase();
    return node;
  }
}

export function runOriginalUi() {
  const document = new StubDocument(readText("index.html"));
  runInNewContext(readText("offline.js"), { document }, { timeout: 3000, filename: "original-offline.js" });
  return document;
}

export function runOriginalBoot(protocol) {
  const document = new StubDocument(readText("index.html"));
  runInNewContext(readText("boot.js"), { document, location: { protocol } }, { timeout: 1000 });
  return document;
}
