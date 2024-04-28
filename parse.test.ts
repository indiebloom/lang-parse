import { assertEquals } from "https://deno.land/std@0.223.0/assert/mod.ts";
import { Draft, Immutable } from "./deps.ts";
import {
  conditional,
  dynamic,
  literal,
  optional,
  sequence,
  union,
} from "./expression.ts";
import { parse } from "./mod.ts";
import { ParseResult } from "./types/parse.ts";

const pp = (o: object) => JSON.stringify(o, null, 2);

const assertObjectEquals = (actual: object, expected: object) =>
  assertEquals(
    actual,
    expected,
    `Expected\n${pp(expected)}\nbut got\n${pp(actual)}`,
  );

type TestState = {
  matchingExpressions: number[];
};

const INITIAL_STATE: TestState = {
  matchingExpressions: [],
};

/**
 * Returns a stateUpdater function that simply records that the expression assigned the given
 * number was evaluated as matching.
 */
function buildMatchRecorder(expressionNumber: number = 0) {
  return (state: Draft<TestState>) => {
    state.matchingExpressions.push(expressionNumber);
  };
}

Deno.test("literal expression evaluation", async (t) => {
  await t.step(
    "should support regex matching the empty string with non-empty input",
    () => {
      const result = parse(
        literal(/(boop)?/, {
          stateUpdater: buildMatchRecorder(),
          suggestions: ["boop"],
        }),
        INITIAL_STATE,
        "foobar",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "",
          remainder: "foobar",
          state: { matchingExpressions: [0] },
          suggestions: [],
        } satisfies ParseResult<TestState>,
      );
    },
  );

  await t.step(
    "should support regex matching the empty string with empty input",
    () => {
      const result = parse(
        literal(/(boop)?/, {
          stateUpdater: buildMatchRecorder(),
          suggestions: ["boop"],
        }),
        INITIAL_STATE,
        "",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "",
          remainder: "",
          state: { matchingExpressions: [0] },
          suggestions: [],
        } satisfies ParseResult<TestState>,
      );
    },
  );

  await t.step(
    "should not match empty input when regex does not match empty input",
    () => {
      const result = parse(
        literal(/boop/, {
          stateUpdater: buildMatchRecorder(),
          suggestions: ["boop"],
        }),
        INITIAL_STATE,
        "",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "",
          remainder: "",
          state: INITIAL_STATE,
          suggestions: [{
            label: "boop",
          }],
        } satisfies ParseResult<TestState>,
      );
    },
  );

  await t.step(
    "should match when the regex matches the start of the input",
    () => {
      const result = parse(
        literal(/foo/, {
          stateUpdater: buildMatchRecorder(),
          suggestions: ["foo"],
        }),
        INITIAL_STATE,
        "foobar",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "foo",
          remainder: "bar",
          state: { matchingExpressions: [0] },
          suggestions: [],
        } satisfies ParseResult<TestState>,
      );
    },
  );

  await t.step(
    "should match when the regex matches the entire input",
    () => {
      const result = parse(
        literal(/foobar/, {
          stateUpdater: buildMatchRecorder(),
          suggestions: ["foobar"],
        }),
        INITIAL_STATE,
        "foobar",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "foobar",
          remainder: "",
          state: { matchingExpressions: [0] },
          suggestions: [],
        } satisfies ParseResult<TestState>,
      );
    },
  );

  await t.step("should match greedily", () => {
    const result = parse(
      literal(/foo (bar)?\w*/, {
        stateUpdater: buildMatchRecorder(),
        suggestions: ["foobar"],
      }),
      INITIAL_STATE,
      "foo barbaz bing",
    );

    assertObjectEquals(
      result,
      {
        matchingPart: "foo barbaz",
        remainder: " bing",
        state: { matchingExpressions: [0] },
        suggestions: [],
      } satisfies ParseResult<TestState>,
    );
  });

  await t.step(
    "should not match when the regex matches part of the input not at the start",
    () => {
      const result = parse(
        literal(/foo/, {
          stateUpdater: buildMatchRecorder(),
          suggestions: ["foo"],
        }),
        INITIAL_STATE,
        "barfoobar",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "",
          remainder: "barfoobar",
          state: INITIAL_STATE,
          suggestions: [{
            label: "foo",
          }],
        } satisfies ParseResult<TestState>,
      );
    },
  );
});

Deno.test("union expression evaluation", async (t) => {
  await t.step(
    "should match when only the first child expression matches",
    () => {
      const result = parse(
        union(
          literal(/foo/, {
            stateUpdater: buildMatchRecorder(0),
            suggestions: ["foo"],
          }),
          literal(/bar/, {
            stateUpdater: buildMatchRecorder(1),
            suggestions: ["bar"],
          }),
        ),
        INITIAL_STATE,
        "foo",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "foo",
          remainder: "",
          state: { matchingExpressions: [0] },
          suggestions: [],
        } satisfies ParseResult<TestState>,
      );
    },
  );

  await t.step(
    "should match when only the second child expression matches",
    () => {
      const result = parse(
        union(
          literal(/foo/, {
            stateUpdater: buildMatchRecorder(0),
            suggestions: ["foo"],
          }),
          literal(/bar/, {
            stateUpdater: buildMatchRecorder(1),
            suggestions: ["bar"],
          }),
        ),
        INITIAL_STATE,
        "bar",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "bar",
          remainder: "",
          state: { matchingExpressions: [1] },
          suggestions: [],
        } satisfies ParseResult<TestState>,
      );
    },
  );

  await t.step(
    "should not match when no child expression matches",
    () => {
      const result = parse(
        union(
          literal(/foo/, {
            stateUpdater: buildMatchRecorder(0),
            suggestions: ["foo"],
          }),
          literal(/bar/, {
            stateUpdater: buildMatchRecorder(1),
            suggestions: ["bar"],
          }),
        ),
        INITIAL_STATE,
        "baz",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "",
          remainder: "baz",
          state: INITIAL_STATE,
          suggestions: [{
            label: "foo",
          }, {
            label: "bar",
          }],
        } satisfies ParseResult<TestState>,
      );
    },
  );

  await t.step(
    "should return the results from longest match over all child expression when multiple child expressions match",
    () => {
      const result = parse(
        union(
          literal(/foo/, {
            stateUpdater: buildMatchRecorder(0),
            suggestions: ["foo"],
          }),
          literal(/foobar/, {
            stateUpdater: buildMatchRecorder(1),
            suggestions: ["foobar"],
          }),
        ),
        INITIAL_STATE,
        "foobarbaz",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "foobar",
          remainder: "baz",
          state: { matchingExpressions: [1] },
          suggestions: [],
        } satisfies ParseResult<TestState>,
      );
    },
  );
});

Deno.test("sequence expression evaluation", async (t) => {
  await t.step("should match when all child expressions match", () => {
    const result = parse(
      sequence(
        literal(/foo/, {
          stateUpdater: buildMatchRecorder(0),
        }),
        literal(/bar/, {
          stateUpdater: buildMatchRecorder(1),
        }),
      ),
      INITIAL_STATE,
      "foobar",
    );

    assertObjectEquals(
      result,
      {
        matchingPart: "foobar",
        remainder: "",
        state: { matchingExpressions: [0, 1] },
        suggestions: [],
      } satisfies ParseResult<TestState>,
    );
  });

  await t.step(
    "should partially match when only the first child expression matches",
    () => {
      const result = parse(
        sequence(
          literal(/foo/, {
            stateUpdater: buildMatchRecorder(0),
          }),
          literal(/bar/, {
            stateUpdater: buildMatchRecorder(1),
            suggestions: ["bar"],
          }),
        ),
        INITIAL_STATE,
        "fooba",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "foo",
          remainder: "ba",
          state: { matchingExpressions: [0] },
          suggestions: [{
            label: "bar",
          }],
        } satisfies ParseResult<TestState>,
      );
    },
  );

  await t.step(
    "should not match when first child expression does not match",
    () => {
      const result = parse(
        sequence(
          literal(/foo/, {
            stateUpdater: buildMatchRecorder(0),
            suggestions: ["foo"],
          }),
          literal(/bar/, {
            stateUpdater: buildMatchRecorder(1),
            suggestions: ["bar"],
          }),
        ),
        INITIAL_STATE,
        "foba",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "",
          remainder: "foba",
          state: INITIAL_STATE,
          suggestions: [{
            label: "foo",
          }],
        } satisfies ParseResult<TestState>,
      );
    },
  );

  await t.step(
    "should not match empty input the first child expression does not match empty input",
    () => {
      const result = parse(
        sequence(
          literal(/foo/, {
            stateUpdater: buildMatchRecorder(0),
            suggestions: ["foo"],
          }),
          literal(/bar/, {
            stateUpdater: buildMatchRecorder(1),
            suggestions: ["bar"],
          }),
        ),
        INITIAL_STATE,
        "",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "",
          remainder: "",
          state: INITIAL_STATE,
          suggestions: [{
            label: "foo",
          }],
        } satisfies ParseResult<TestState>,
      );
    },
  );

  await t.step(
    "should match nested sequences where all child expressions match",
    () => {
      const result = parse(
        sequence(
          sequence(
            literal(/foo/, {
              stateUpdater: buildMatchRecorder(0),
              suggestions: ["foo"],
            }),
            literal(/bar/, {
              stateUpdater: buildMatchRecorder(1),
              suggestions: ["bar"],
            }),
          ),
          literal(/baz/, {
            stateUpdater: buildMatchRecorder(2),
            suggestions: ["baz"],
          }),
        ),
        INITIAL_STATE,
        "foobarbaz",
      );

      assertObjectEquals(result, {
        matchingPart: "foobarbaz",
        remainder: "",
        state: { matchingExpressions: [0, 1, 2] },
        suggestions: [],
      } as ParseResult<TestState>);
    },
  );

  await t.step(
    "should not match nested sequences where not all child expressions match",
    () => {
      const result = parse(
        sequence(
          sequence(
            literal(/foo/, {
              stateUpdater: buildMatchRecorder(0),
              suggestions: ["foo"],
            }),
            literal(/bar/, {
              stateUpdater: buildMatchRecorder(1),
              suggestions: ["bar"],
            }),
          ),
          literal(/baz/, {
            stateUpdater: buildMatchRecorder(2),
            suggestions: ["baz"],
          }),
        ),
        INITIAL_STATE,
        "fooboopbaz",
      );

      assertObjectEquals(result, {
        matchingPart: "foo",
        remainder: "boopbaz",
        state: { matchingExpressions: [0] },
        suggestions: [{
          label: "bar",
        }],
      } as ParseResult<TestState>);
    },
  );

  await t.step(
    "should continue matching against next child expression when any branch of the first child expression matches",
    () => {
      const result = parse(
        sequence(
          union(
            literal(/fu/, {
              stateUpdater: buildMatchRecorder(0),
              suggestions: ["fu"],
            }),
            literal(/foo/, {
              stateUpdater: buildMatchRecorder(1),
              suggestions: ["foo"],
            }),
          ),
          literal(/bar/, {
            stateUpdater: buildMatchRecorder(2),
            suggestions: ["bar"],
          }),
        ),
        INITIAL_STATE,
        "foobar",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "foobar",
          remainder: "",
          state: { matchingExpressions: [1, 2] },
          suggestions: [],
        } satisfies ParseResult<TestState>,
      );
    },
  );
});

Deno.test("dynamic expression evaluation", async (t) => {
  const testExp = sequence(
    optional(
      literal(/test/, {
        stateUpdater: buildMatchRecorder(0),
        suggestions: ["test"],
      }),
    ),
    dynamic((state: Immutable<TestState>) => {
      if (state.matchingExpressions.includes(0)) {
        return literal(/foo/, {
          stateUpdater: buildMatchRecorder(1),
          suggestions: ["foo"],
        });
      } else {
        return literal(/bar/, {
          stateUpdater: buildMatchRecorder(2),
          suggestions: ["bar"],
        });
      }
    }),
  );

  await t.step("should choose the expression based on the state", () => {
    const result1 = parse(testExp, INITIAL_STATE, "testfoo");
    assertObjectEquals(
      result1,
      {
        matchingPart: "testfoo",
        remainder: "",
        state: { matchingExpressions: [0, 1] },
        suggestions: [],
      } satisfies ParseResult<TestState>,
    );

    const result2 = parse(testExp, INITIAL_STATE, "foo");
    assertObjectEquals(
      result2,
      {
        matchingPart: "",
        remainder: "foo",
        state: INITIAL_STATE,
        suggestions: [
          {
            label: "bar",
          },
          {
            label: "test",
          },
        ],
      } satisfies ParseResult<TestState>,
    );

    const result3 = parse(testExp, INITIAL_STATE, "bar");
    assertObjectEquals(
      result3,
      {
        matchingPart: "bar",
        remainder: "",
        state: { matchingExpressions: [2] },
        suggestions: [],
      } satisfies ParseResult<TestState>,
    );

    const result4 = parse(testExp, INITIAL_STATE, "testbar");
    assertObjectEquals(
      result4,
      {
        matchingPart: "test",
        remainder: "bar",
        state: { matchingExpressions: [0] },
        suggestions: [{
          label: "foo",
        }],
      } satisfies ParseResult<TestState>,
    );
  });
});

Deno.test("optional expression evaluation", async (t) => {
  await t.step("should match when the optional expression matches", () => {
    const result = parse(
      optional(literal(/foo/, {
        stateUpdater: buildMatchRecorder(),
        suggestions: ["foo"],
      })),
      INITIAL_STATE,
      "foo",
    );

    assertObjectEquals(
      result,
      {
        matchingPart: "foo",
        remainder: "",
        state: { matchingExpressions: [0] },
        suggestions: [],
      } satisfies ParseResult<TestState>,
    );
  });

  await t.step(
    "should match and contribute suggestions when the optional expression does not match",
    () => {
      const result = parse(
        sequence(
          optional(literal(/foo/, {
            stateUpdater: buildMatchRecorder(0),
            suggestions: ["foo"],
          })),
          literal(/bar/, {
            stateUpdater: buildMatchRecorder(1),
            suggestions: ["bar"],
          }),
        ),
        INITIAL_STATE,
        "boop",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "",
          remainder: "boop",
          state: INITIAL_STATE,
          suggestions: [{ label: "bar" }, { label: "foo" }],
        } satisfies ParseResult<TestState>,
      );
    },
  );

  await t.step(
    "should match when the optional expression does not match",
    () => {
      const result = parse(
        sequence(
          optional(literal(/foo/, {
            stateUpdater: buildMatchRecorder(0),
            suggestions: ["foo"],
          })),
          literal(/bar/, {
            stateUpdater: buildMatchRecorder(1),
            suggestions: ["bar"],
          }),
        ),
        INITIAL_STATE,
        "bar",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "bar",
          remainder: "",
          state: { matchingExpressions: [1] },
          suggestions: [],
        } satisfies ParseResult<TestState>,
      );
    },
  );
});

Deno.test("conditional expression evaluation", async (t) => {
  await t.step(
    "should evaluate the ifTrue expression if the condition is satisified",
    () => {
      const result = parse(
        conditional({
          condition: (state: Immutable<TestState>) =>
            state.matchingExpressions.includes(0),
          ifTrue: literal(/foo/, {
            stateUpdater: buildMatchRecorder(1),
          }),
        }),
        { matchingExpressions: [0] } satisfies TestState,
        "foo",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "foo",
          remainder: "",
          state: { matchingExpressions: [0, 1] },
          suggestions: [],
        } satisfies ParseResult<TestState>,
      );
    },
  );

  await t.step(
    "should match the empty string by default if the condition is not satisified",
    () => {
      const result = parse(
        sequence(
          conditional({
            condition: (state: Immutable<TestState>) =>
              state.matchingExpressions.includes(0),
            ifTrue: literal(/foo/, {
              stateUpdater: buildMatchRecorder(1),
            }),
          }),
          literal(/bar/, {
            stateUpdater: buildMatchRecorder(2),
          }),
        ),
        INITIAL_STATE,
        "bar",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "bar",
          remainder: "",
          state: { matchingExpressions: [2] },
          suggestions: [],
        } satisfies ParseResult<TestState>,
      );
    },
  );

  await t.step(
    "should not match if the condition is not satisified and ifFalse=notMatch",
    () => {
      const result = parse(
        sequence(
          conditional({
            condition: (state: Immutable<TestState>) =>
              state.matchingExpressions.includes(0),
            ifTrue: literal(/foo/, {
              stateUpdater: buildMatchRecorder(1),
            }),
            ifFalse: "notMatch",
          }),
          literal(/bar/, {
            stateUpdater: buildMatchRecorder(2),
          }),
        ),
        INITIAL_STATE,
        "bar",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "",
          remainder: "bar",
          state: INITIAL_STATE,
          suggestions: [],
        } satisfies ParseResult<TestState>,
      );
    },
  );

  await t.step(
    "should evaluate the custom ifFalse expression if the condition is not satisified",
    () => {
      const result = parse(
        conditional({
          condition: (state: Immutable<TestState>) =>
            state.matchingExpressions.includes(0),
          ifTrue: literal(/foo/, {
            stateUpdater: buildMatchRecorder(1),
          }),
          ifFalse: literal(/bar/, {
            stateUpdater: buildMatchRecorder(2),
          }),
        }),
        INITIAL_STATE,
        "bar",
      );

      assertObjectEquals(
        result,
        {
          matchingPart: "bar",
          remainder: "",
          state: { matchingExpressions: [2] },
          suggestions: [],
        } satisfies ParseResult<TestState>,
      );
    },
  );
});
