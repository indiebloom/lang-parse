import { Draft, Immutable } from "./deps.ts";
import {
  DynamicExpression,
  Expression,
  LiteralExpression,
  SequenceExpression,
  UnionExpression,
} from "./types/expression.ts";
import { Suggestion } from "./types/suggestion.ts";

const NO_OP = () => {};
const EMPTY_LITERAL = literal(/(?:)/);
const TERMINAL_LITERAL = literal(/$/);

export function literal<State = object, CustomSuggestion = object>(
  regexp: RegExp | ((state: Immutable<State>) => RegExp),
  options?: {
    suggestions?:
      | Suggestion<CustomSuggestion>[]
      | ((state: Immutable<State>) => Suggestion<CustomSuggestion>[]);
    stateUpdater?: (state: Draft<State>, matchGroups: string[]) => void;
  },
): LiteralExpression<State, CustomSuggestion> {
  return {
    type: "literal",
    regexp,
    suggestions: options?.suggestions ?? [],
    stateUpdater: options?.stateUpdater ?? NO_OP,
  };
}

export function sequence<State = object, CustomSuggestion = object>(
  ...sequence: Expression<State, CustomSuggestion>[]
): SequenceExpression<State, CustomSuggestion> {
  if (sequence.length === 0) {
    throw new Error("Sequence expression must have at least one child");
  }

  return {
    type: "sequence",
    sequence,
  };
}

export function union<State = object, CustomSuggestion = object>(
  ...alternates: Expression<State, CustomSuggestion>[]
): UnionExpression<State, CustomSuggestion> {
  if (alternates.length === 0) {
    throw new Error("Union expression must have at least one child");
  }

  return {
    type: "union",
    alternates,
  };
}

export function dynamic<State = object, CustomSuggestion = object>(
  fn: (state: Immutable<State>) => Expression<State, CustomSuggestion>,
): DynamicExpression<State, CustomSuggestion> {
  return {
    type: "dynamic",
    fn,
  };
}

/**
 * Makes a given expression optional.
 * @param expression The expression to make optional
 * @returns A union expression with two alternates: 1) the given expression, and 2) an expression
 * that vacuously matches the empty string.
 */
export function optional<State = object, CustomSuggestion = object>(
  expression: Expression<State, CustomSuggestion>,
): Expression<State, CustomSuggestion> {
  return union(
    EMPTY_LITERAL as Expression<State, CustomSuggestion>,
    expression,
  );
}

/**
 * Dynamically chooses between two possible expression to evaluate, based on the current
 * state.
 * @param options
 * @returns The expression chosen based on the given conditional options and the
 * current state.
 */
export function conditional<State = object, CustomSuggestion = object>(
  options: {
    condition: (state: Immutable<State>) => boolean;
    /** The expression to evaluate if the condition is satisfied */
    ifTrue: Expression<State, CustomSuggestion>;
    /**
     * Defines the expression to evaluate if the condition is not satisfied.
     * One of:
     * - "matchEmpty" (DEFAULT): If the condition evaluates to false,
     *   this expression vacuously matches the empty string, allowing any expressions that
     *   follow this one in the branch of the expression tree to be matched against the
     *   input, as though this expression were not present in the tree at all.
     * - "noMatch": If the condition evaluates to false, the expression does does not
     *   match the input, and its branch of the expression tree is not explored further, as
     *   though this expression were a LiteralExpression whose regex did not match.
     * - A custom expression
     */
    ifFalse?: "matchEmpty" | "notMatch" | Expression<State, CustomSuggestion>;
  },
): Expression<State, CustomSuggestion> {
  return dynamic((state) => {
    const isConditionSatisfied = options.condition(state);
    if (isConditionSatisfied) {
      return options.ifTrue;
    } else if (!options.ifFalse || options.ifFalse === "matchEmpty") {
      return EMPTY_LITERAL as Expression<State, CustomSuggestion>;
    } else if (options.ifFalse === "notMatch") {
      return TERMINAL_LITERAL as Expression<State, CustomSuggestion>;
    } else {
      return options.ifFalse;
    }
  });
}
