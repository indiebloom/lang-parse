import * as chai from "$chai";
import { parse } from "./index.ts";

Deno.test("parse should parse the input correctly", () => {
  const result = parse(
    {
      type: "literal",
      regexp: /foo/,
      stateUpdater: () => ({}),
      suggestions: ["foobar"],
    },
    {},
    "foobar",
  );

  chai.expect(result).toEqual({
    matchingPrefix: "foo",
    nonMatchingSuffix: "bar",
    isCompleteMatch: true,
    isTerminal: true,
    state: {},
    suggestions: ["foobar"],
  });
});
