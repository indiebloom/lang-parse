import { crypto, Draft, Immutable } from "./deps.ts";
import {
  DynamicExpression,
  Expression,
  ExpressionGenerator,
  ExpressionWithId,
  LiteralExpression,
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
): Expression<State, CustomSuggestion> {
  if (sequence.length === 0) {
    throw new Error("Sequence expression must have at least one child");
  } else if (sequence.length === 1) {
    return sequence[0];
  }

  return {
    type: "sequence",
    sequence,
  };
}

export function union<State = object, CustomSuggestion = object>(
  ...alternates: Expression<State, CustomSuggestion>[]
): Expression<State, CustomSuggestion> {
  if (alternates.length === 0) {
    throw new Error("Union expression must have at least one child");
  } else if (alternates.length === 1) {
    return alternates[0];
  }

  return {
    type: "union",
    alternates,
  };
}

export function dynamic<State = object, CustomSuggestion = object>(
  fn: ExpressionGenerator<State, CustomSuggestion>,
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
 *
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

/**
 * Produces an expression that matches sequential segments of the input
 * between a minimum and maximum number of times.
 *
 * e.g. The expression `repeated(literal(/foo/), { min: 2, max: 4 })` will match
 * "foofoo", "foofoofoo", and "foofoofoofoo", but not "foo" or "foofoofoofoofoo".
 */
export function repeated<State = object, CustomSuggestion = object>(
  expression: Expression<State, CustomSuggestion>,
  options?: {
    /** The minimum number of times that the given expression must match. Defaults to 0.  */
    min?: number;
    /**
     * The maximum number of times that the given expression will be matched. Defaults to infinity,
     * meaning that as long as the next segment of the input matches the given expression, the
     * produced expression will continue to accumulate matching segments.
     */
    max?: number;
  },
): Expression<State, CustomSuggestion> {
  const { min = 0, max = Infinity } = options ?? {};
  if (min < 0) {
    throw new Error("Minimum number of repetitions must be non-negative");
  } else if (max < min) {
    throw new Error(
      "Maximum number of repetitions must be greater than the minimum",
    );
  }

  const nextExpr = max === 0
    ? TERMINAL_LITERAL as Expression<State, CustomSuggestion>
    : sequence(
      expression,
      // Note: a dynamic expression is used here so that the "more" part of the expression
      // is only generated if the "first" part of the expression matches the input. This
      // is important when `options.max` is infinity (or even just a large number) because
      // we don't want to generate a large number of expressions that will never be reached
      // during parsing.
      dynamic(() =>
        repeated(expression, {
          min: Math.max(0, min - 1),
          max: Math.max(0, max - 1),
        })
      ),
    );

  return min === 0 ? optional(nextExpr) : nextExpr;
}

/**
 * Produces an expression that matches any permutation of the given expressions.
 * E.g. if options.requiredMembers = [`A`, `B`] and options.optionalMembers = [`c`]
 *
 * Then the resulting expression will match inputs that match `A`, `B`, and `C`
 * in any of the following orders:
 * - `A` `B` `C`
 * - `A` `C` `B`
 * - `B` `A` `C`
 * - `B` `C` `A`
 * - `C` `A` `B`
 * - `C` `B` `A`
 * - `A` `B`
 * - `B` `A`
 *
 * NOTE: A `permutations` expression consisting of `n` member expressions may produce
 * an expression subgraph with on the order of `n!` paths. In most real-world scenarios it
 * is likely that most of those possible branches will be trimmed immediately, and
 * only on the order of n^2 branches will actually be evaluated, but this combinatorial
 * reduction will not occur if several member expressions overlap in the inputs that they
 * match. e.g. if two members are literal expressions with regexes `/foo/` and `/foobar/`,
 * then when the input is 'foobarbaz', the first expression will match and consume "foo"
 * and the second will match and consume "foobar", and each of those two branches becomes
 * the root of a new permutations expression graph which matches the remaining member
 * expressoins against the remainder of the input.
 */
export function permutations<State = object, CustomSuggestion = object>(
  options: {
    /**
     * Member expressions that must appear in the input in some order for the
     * returned permutations expression to fully match the input
     */
    requiredMembers?: Expression<State, CustomSuggestion>[];
    /**
     * Member expressions that may appear in the input in any order relative to
     * the requiredMembers.
     */
    optionalMembers?: Expression<State, CustomSuggestion>[];
    /**
     * An ID that is unique to this permutations expression within the expression
     * graph. Mainly intended to aid debugability of dynamic expression; If not
     * provided, a random ID will be assigned.
     */
    id?: string;
  },
): ExpressionWithId<State, CustomSuggestion> {
  const {
    requiredMembers = [],
    optionalMembers = [],
    id = crypto.randomUUID(),
  } = options;
  const required = requiredMembers.map((expr, i) => ({
    ...expr,
    id: expr.id ?? `${id}.required.${i}`,
  }));
  const optional = optionalMembers.map((expr, i) => ({
    ...expr,
    id: expr.id ?? `${id}.optional.${i}`,
  }));

  return _permutations(
    required,
    optional,
    id,
    1,
  );
}

function _permutations<State = object, CustomSuggestion = object>(
  requiredMembers: ExpressionWithId<State, CustomSuggestion>[],
  optionalMembers: ExpressionWithId<State, CustomSuggestion>[],
  baseId: string,
  epoch: number,
): ExpressionWithId<State, CustomSuggestion> {
  const dynamicExpr = dynamic<State, CustomSuggestion>(
    (_, wasAlreadyMatched) => {
      const remainingRequiredMembers = requiredMembers.filter((expr) =>
        !wasAlreadyMatched(expr.id)
      );
      const remainingOptionalMembers = optionalMembers.filter((expr) =>
        !wasAlreadyMatched(expr.id)
      );

      if (
        !remainingRequiredMembers.length && !remainingOptionalMembers.length
      ) {
        return EMPTY_LITERAL as Expression<State, CustomSuggestion>;
      }

      const nextMatchExpr = union(
        ...remainingRequiredMembers,
        ...remainingOptionalMembers,
      );

      const permutationsExp = sequence(
        nextMatchExpr,
        _permutations(
          remainingRequiredMembers,
          remainingOptionalMembers,
          baseId,
          epoch + 1,
        ),
      );

      return remainingRequiredMembers.length
        ? permutationsExp
        : optional(permutationsExp);
    },
  );

  return {
    ...dynamicExpr,
    id: `${baseId}[epoch-${epoch}]`,
  };
}
