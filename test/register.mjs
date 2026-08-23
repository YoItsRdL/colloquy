/**
 * Resolves "obsidian" to the stub beside this file, and installs the globals Obsidian puts
 * on the page. Loaded with `node --import`, before any test file is resolved.
 *
 * The plugin's UI half imports Obsidian's API, which only exists inside the app, so none of
 * it could be loaded under `node --test` and none of it was tested. This is how that is
 * fixed without a dependency: no package to install, no third-party code, and nothing that
 * reaches the bundle, which already marks "obsidian" external.
 */
import { registerHooks } from "node:module";
import { installGlobals } from "./obsidian.js";

const STUB = new URL("./obsidian.js", import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "obsidian") return { url: STUB, shortCircuit: true };
    return next(specifier, context);
  },
});

installGlobals();
