import { assertEquals } from "https://deno.land/std@0.223.0/assert/mod.ts";
import { parse } from "./mod.ts";

const pp = (o: object) => JSON.stringify(o, null, 2);

const assertObjectEquals = (actual: object, expected: object) =>
  assertEquals(
    actual,
    expected,
    `Expected\n${pp(expected)}\nbut got\n${pp(actual)}`,
  );

Deno.test("parse should correctly handle literal expressions", async (t) => {
  await t.step(
    "when regex matches the empty string and input is non-empty",
    () => {
      const result = parse(
        {
          type: "literal",
          regexp: /(boop)?/,
          stateUpdater: () => ({}),
          suggestions: [],
        },
        {},
        "foobar",
      );

      assertObjectEquals(result, {
        matchingPrefix: "",
        nonMatchingSuffix: "foobar",
        isCompleteMatch: false,
        isTerminal: true,
        state: {},
        suggestions: [],
      });
    },
  );

  await t.step("when regex matches the empty string and input is empty", () => {
    const result = parse(
      {
        type: "literal",
        regexp: /(boop)?/,
        stateUpdater: () => ({}),
        suggestions: [],
      },
      {},
      "",
    );

    assertObjectEquals(result, {
      matchingPrefix: "",
      nonMatchingSuffix: "",
      isCompleteMatch: true,
      isTerminal: true,
      state: {},
      suggestions: [],
    });
  });

  await t.step("when regex matches the beginning of the input", () => {
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

    assertObjectEquals(result, {
      matchingPrefix: "foo",
      nonMatchingSuffix: "bar",
      isCompleteMatch: false,
      isTerminal: true,
      state: {},
      suggestions: [],
    });
  });

  await t.step(
    "when regex matches part of the input not at the beginning",
    () => {
      const result = parse(
        {
          type: "literal",
          regexp: /foo/,
          stateUpdater: () => ({}),
          suggestions: ["barfoobar"],
        },
        {},
        "barfoobar",
      );

      assertObjectEquals(result, {
        matchingPrefix: "",
        nonMatchingSuffix: "barfoobar",
        isCompleteMatch: false,
        isTerminal: true,
        state: {},
        suggestions: [{
          label: "barfoobar",
        }],
      });
    },
  );
});
