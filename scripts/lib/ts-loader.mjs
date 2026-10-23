import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
// Compile just the modules under test in memory; never load .env or call a service.
export function loader(overrides = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const localRequire = (specifier) => {
      if (specifier === "server-only") return {}; // build-time guard, not runtime code
      if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
      if (specifier.startsWith("."))
        return load(path.resolve(path.dirname(file), specifier + ".ts"));
      return require(specifier);
    };
    new Function("require", "module", "exports", source)(
      localRequire,
      loadedModule,
      loadedModule.exports,
    );
    return loadedModule.exports;
  }
  return load;
}
