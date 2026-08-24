/**
 * Enough of Obsidian's API to load the plugin's UI under `node --test`.
 *
 * Not a mock library and not a browser. It is a real tree of fake elements, because the
 * bugs worth catching here are about what ends up on the screen. A button that was never
 * appended, a row that never redrew, and a registry of recorded calls cannot see those.
 * Tests walk the tree the way a person reads the screen.
 *
 * It covers what `src/` actually uses and nothing else. Anything missing should throw
 * loudly when first needed rather than be stubbed ahead of time and quietly wrong.
 */

const classesOf = (cls) => (Array.isArray(cls) ? cls : String(cls ?? "").split(/\s+/)).filter(Boolean);

export class El {
  constructor(tag = "div", opts = {}) {
    const o = typeof opts === "string" ? { cls: opts } : (opts ?? {});
    this.tagName = String(tag).toLowerCase();
    this.children = [];
    this.parent = null;
    this.classes = new Set(classesOf(o.cls));
    this.attrs = { ...(o.attr ?? {}) };
    this.listeners = new Map();
    this.style = {};
    this.onclick = null;
    this.value = o.value ?? "";
    this.disabled = false;
    this.focused = false;
    // Layout the code reads to decide whether to follow an answer down the page.
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.title = "";
    this.own = o.text ? String(o.text) : "";
    for (const k of ["href", "type", "placeholder", "src", "title"]) if (o[k] != null) this[k] = o[k];
  }

  get textContent() { return this.own + this.children.map((c) => c.textContent).join(""); }
  set textContent(v) { this.own = String(v ?? ""); this.children = []; }
  setText(v) { this.textContent = v; return this; }

  createEl(tag, opts) { return this.append(new El(tag, opts)); }
  createDiv(opts) { return this.createEl("div", opts); }
  createSpan(opts) { return this.createEl("span", opts); }
  appendChild(el) { return this.append(el); }
  append(el) { el.parent = this; this.children.push(el); return el; }

  empty() { this.children = []; this.own = ""; return this; }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  detach() { this.remove(); }

  addClass(...c) { for (const x of c) this.classes.add(x); return this; }
  removeClass(...c) { for (const x of c) this.classes.delete(x); return this; }
  toggleClass(c, on) { for (const x of classesOf(c)) on ? this.classes.add(x) : this.classes.delete(x); return this; }
  hasClass(c) { return this.classes.has(c); }
  setAttr(k, v) { this.attrs[k] = v; return this; }
  getAttr(k) { return this.attrs[k]; }

  focus() { this.focused = true; }
  blur() { this.focused = false; }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  dispatchEvent(event) {
    for (const fn of this.listeners.get(event.type) ?? []) fn(event);
    return true;
  }
  /** What a person does, rather than what the handler happens to be called. */
  click() {
    this.onclick?.({ preventDefault() {}, stopPropagation() {} });
    this.dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
  }
  /** Named for the act, not the attribute: elements already have a `type`. */
  enter(text) {
    this.value = text;
    this.dispatchEvent({ type: "input", target: this, preventDefault() {} });
  }
  /** @returns whether the handler swallowed it, which is how a key that sends is told from one that types. */
  press(key, extra = {}) {
    let defaultPrevented = false;
    this.dispatchEvent({
      type: "keydown",
      key,
      shiftKey: false,
      ...extra,
      preventDefault() { defaultPrevented = true; },
      stopPropagation() {},
    });
    return { defaultPrevented };
  }

  /** Pasting, as the box receives it: files on the clipboard, text beside them. */
  paste(files = [], text = "") {
    let defaultPrevented = false;
    this.dispatchEvent({
      type: "paste",
      clipboardData: { files, getData: () => text },
      preventDefault() { defaultPrevented = true; },
    });
    return { defaultPrevented };
  }

  // ── reading the tree, for assertions ────────────────────────────────────────────
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  find(pred) { return this.descendants().find(pred) ?? null; }
  findAll(pred) { return this.descendants().filter(pred); }
  /** The control a person would click, found by its visible words. */
  button(label) { return this.find((e) => e.tagName === "button" && e.textContent.trim() === label); }
  buttons() { return this.findAll((e) => e.tagName === "button").map((e) => e.textContent.trim()); }
}

export const notices = [];
export class Notice {
  constructor(message, timeout) {
    this.message = String(message);
    this.timeout = timeout;
    notices.push(this.message);
  }
  hide() {}
}

class Control {
  constructor(el) { this.el = el; }
  setDisabled(v) { this.el.disabled = Boolean(v); return this; }
  setTooltip(v) { this.el.setAttr("aria-label", v); return this; }
  then(cb) { cb(this); return this; }
}

class ButtonComponent extends Control {
  constructor(el) { super(el); this.buttonEl = el; }
  setButtonText(v) { this.el.setText(v); return this; }
  setIcon(v) { this.el.setAttr("data-icon", v); return this; }
  setWarning() { this.el.addClass("mod-warning"); return this; }
  setCta() { this.el.addClass("mod-cta"); return this; }
  onClick(fn) { this.el.onclick = fn; return this; }
}

class TextComponent extends Control {
  constructor(el) { super(el); this.inputEl = el; }
  getValue() { return this.el.value; }
  setValue(v) { this.el.value = v ?? ""; return this; }
  setPlaceholder(v) { this.el.placeholder = v; return this; }
  onChange(fn) { this.el.addEventListener("input", () => fn(this.el.value)); return this; }
}

class ToggleComponent extends Control {
  constructor(el) {
    super(el);
    this.toggleEl = el;
    this.el.value = false;
    this.el.onclick = () => this.toggle();
  }
  getValue() { return Boolean(this.el.value); }
  setValue(v) { this.el.value = Boolean(v); return this; }
  onChange(fn) { this.changed = fn; return this; }
  /** What a click on the toggle does, which is the only way it is ever changed. */
  async toggle() { this.el.value = !this.el.value; await this.changed?.(this.el.value); }
}

class DropdownComponent extends Control {
  constructor(el) { super(el); this.selectEl = el; this.options = new Map(); }
  addOption(value, label) { this.options.set(value, label); return this; }
  addOptions(record) { for (const [v, l] of Object.entries(record)) this.addOption(v, l); return this; }
  getValue() { return this.el.value; }
  setValue(v) { this.el.value = v; return this; }
  onChange(fn) { this.changed = fn; return this; }
  async choose(value) { this.el.value = value; await this.changed?.(value); }
}

/** Obsidian takes either a string or a fragment here, and a fragment is how a row gets structure. */
function fill(el, value) {
  el.empty();
  if (value instanceof El) for (const child of [...value.children]) el.append(child);
  else el.setText(value);
}

export class Setting {
  constructor(containerEl) {
    this.settingEl = containerEl.createDiv({ cls: "setting-item" });
    this.infoEl = this.settingEl.createDiv({ cls: "setting-item-info" });
    this.nameEl = this.infoEl.createDiv({ cls: "setting-item-name" });
    this.descEl = this.infoEl.createDiv({ cls: "setting-item-description" });
    this.controlEl = this.settingEl.createDiv({ cls: "setting-item-control" });
    this.components = [];
  }
  setName(v) { fill(this.nameEl, v); return this; }
  setDesc(v) { fill(this.descEl, v); return this; }
  setClass(v) { this.settingEl.addClass(v); return this; }
  setHeading() { this.settingEl.addClass("setting-item-heading"); return this; }
  setTooltip(v) { this.settingEl.setAttr("aria-label", v); return this; }
  #add(component, cb) { this.components.push(component); cb?.(component); return this; }
  addButton(cb) { return this.#add(new ButtonComponent(this.controlEl.createEl("button")), cb); }
  addExtraButton(cb) { return this.#add(new ButtonComponent(this.controlEl.createEl("button", { cls: "extra-setting-button" })), cb); }
  addText(cb) { return this.#add(new TextComponent(this.controlEl.createEl("input")), cb); }
  addTextArea(cb) { return this.#add(new TextComponent(this.controlEl.createEl("textarea")), cb); }
  addToggle(cb) { return this.#add(new ToggleComponent(this.controlEl.createEl("div", { cls: "checkbox-container" })), cb); }
  addDropdown(cb) { return this.#add(new DropdownComponent(this.controlEl.createEl("select")), cb); }
  then(cb) { cb(this); return this; }
}

export class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = new El("div");
  }
  display() {}
  hide() {}
}

/** Every modal that has been opened, so a test can act on the one a click just produced. */
export const modals = [];

export class Modal {
  constructor(app) {
    this.app = app;
    this.contentEl = new El("div");
    this.titleEl = new El("div");
    this.modalEl = new El("div");
    this.opened = false;
  }
  open() { this.opened = true; modals.push(this); this.onOpen?.(); }
  static last() { return modals.at(-1); }
  close() { this.opened = false; this.onClose?.(); }
  setTitle(v) { this.titleEl.setText(v); return this; }
  setPlaceholder() { return this; }
}

export class FuzzySuggestModal extends Modal {
  constructor(app) { super(app); this.limit = 50; }
  setPlaceholder(v) { this.placeholder = v; return this; }
  setInstructions() { return this; }
  /** Standing in for typing and clicking: pick by the text the modal itself renders. */
  pick(text) {
    const item = this.getItems().find((i) => this.getItemText(i) === text);
    if (item === undefined) throw new Error(`no item reads "${text}"`);
    this.onChooseItem(item, { type: "click" });
    return item;
  }
}

export class ItemView {
  constructor(leaf) {
    this.leaf = leaf;
    this.app = leaf?.app;
    this.containerEl = new El("div");
    this.containerEl.createDiv();
    // Obsidian puts the view header first and the content second; code reaches for the second.
    this.contentEl = this.containerEl.createDiv({ cls: "view-content" });
    this.registered = [];
  }
  getViewType() { return ""; }
  getDisplayText() { return ""; }
  getIcon() { return ""; }
  addAction(icon, title, fn) { this.registered.push({ icon, title, fn }); return new El("a"); }
  registerEvent(ref) { this.registered.push(ref); }
  registerDomEvent(el, type, fn) { el.addEventListener(type, fn); }
  register(fn) { this.registered.push(fn); }
  onunload() {}
}

export class Plugin {
  constructor(app, manifest) {
    this.app = app;
    this.manifest = manifest ?? {};
    this.commands = [];
    this.ribbons = [];
    this.views = new Map();
    this.tabs = [];
    this.disposers = [];
    this.data = null;
  }
  addCommand(command) { this.commands.push(command); return command; }
  addRibbonIcon(icon, title, fn) { this.ribbons.push({ icon, title, fn }); return new El("div"); }
  addSettingTab(tab) { this.tabs.push(tab); }
  registerView(type, factory) { this.views.set(type, factory); }
  registerEvent(ref) { this.disposers.push(ref); }
  register(fn) { this.disposers.push(fn); }
  registerInterval(id) { return id; }
  async loadData() { return this.data; }
  async saveData(data) { this.data = data; }
}

/** Every menu that has been shown, so a test can choose from the one that just opened. */
export const menus = [];

export class Menu {
  constructor() { this.items = []; }
  addItem(cb) {
    const item = {
      title: "",
      icon: "",
      setTitle(v) { this.title = v; return this; },
      setIcon(v) { this.icon = v; return this; },
      setChecked(v) { this.checked = v; return this; },
      setDisabled(v) { this.disabled = v; return this; },
      onClick(fn) { this.click = fn; return this; },
    };
    cb(item);
    this.items.push(item);
    return this;
  }
  addSeparator() { this.items.push({ separator: true }); return this; }
  showAtMouseEvent() { return this.#show(); }
  showAtPosition() { return this.#show(); }
  #show() { this.shown = true; menus.push(this); return this; }
  static last() { return menus.at(-1); }
  /** What is on the menu, as a person would read it. */
  titles() { return this.items.filter((i) => !i.separator).map((i) => i.title); }
  /** Choosing from an open menu, by the words on it. */
  choose(title) {
    const item = this.items.find((i) => i.title === title);
    if (!item) throw new Error(`no menu item reads "${title}"`);
    return item.click?.();
  }
}

export const MarkdownRenderer = {
  rendered: [],
  async render(app, markdown, el, sourcePath, component) {
    MarkdownRenderer.rendered.push({ markdown, sourcePath });
    // Close enough for assertions about what reached the screen: the text arrives, and
    // the element is the one the caller passed.
    el.createDiv({ cls: "markdown-rendered", text: String(markdown ?? "") });
  },
};

export function setIcon(el, icon) { el.setAttr("data-icon", icon); }

export function normalizePath(path) {
  return String(path ?? "")
    .replace(/([\\/])+/g, "/")
    .replace(/(^\/+|\/+$)/g, "")
    .normalize("NFC");
}

export const Platform = { isDesktopApp: true, isMobile: false };
export class TFile {}
export class TFolder {}
export class Component {}

/**
 * The three globals Obsidian puts on the page rather than in its module. Installed by
 * register.mjs before any test file loads, because a plugin reaches for them without
 * importing anything.
 */
export const opened = [];
export function installGlobals() {
  globalThis.createEl = (tag, opts) => new El(tag, opts);
  globalThis.createDiv = (opts) => new El("div", opts);
  globalThis.createFragment = () => new El("fragment");
  globalThis.activeDocument = { body: new El("body"), createElement: (tag) => new El(tag) };
  globalThis.window = globalThis.window ?? {};
  globalThis.window.open = (url) => { opened.push(url); return null; };
  globalThis.activeWindow = globalThis.window;
}
