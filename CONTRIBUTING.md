# Publishing to NPM

1. Run `grep "version" npm/package.json` to show the latest published version
   number.
2. Run
   `deno run --allow-env=DENO_DIR,HOME,DENO_AUTH_TOKENS --allow-read --allow-write=$PWD/npm --allow-run=npm ./scripts/build_npm.ts <new version>`.
   Once the version number is >= 1.0.0, `<new version>` should incremented
   according to semantic versioning practices. If this build command succeeds,
   the `./npm` directory will be updated with the latest js code and type
   definitions.
3. Run `npm publish --access public ./npm` to publish the new version to
   [@indiebloom/lang-parse](https://www.npmjs.com/package/@indiebloom/lang-parse).
   (You will need an [npm](npmjs.com) account with membership in the
   `indiebloom` organization.)
