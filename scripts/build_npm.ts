import { build, emptyDir } from "https://deno.land/x/dnt@0.40.0/mod.ts";

await emptyDir("./npm");

await build({
  typeCheck: "both",

  entryPoints: ["./mod.ts"],
  outDir: "./npm",
  shims: {
    deno: true,
  },
  mappings: {
    "https://esm.sh/immer?target=deno": {
      name: "immer",
      version: "10",
    },
  },
  package: {
    name: "@indiebloom/lang-parse",
    version: Deno.args[0],
    description:
      "Parse input strings against a custom grammar, with semantic state extraction and suggestions for powering autocompletion and other interactive UXs",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/indiebloom/lang-parse.git",
    },
    bugs: {
      url: "https://github.com/indiebloom/lang-parse/issues",
    },
  },
  postBuild() {
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("README.md", "npm/README.md");
  },
});
