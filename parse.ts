import type {
  Expression,
  LiteralExpression,
  ParseResult,
  SequenceExpression,
  Suggestion,
  SuggestionObj,
  UnionExpression,
} from "./types/index.ts";

import { castImmutable, produce } from "./deps.ts";
import { sequence } from "./expression.ts";

type EvalResult<State, CustomSuggestion> = {
  /** True if the entire evaluted expression matches some prefix of the input */
  isMatch: boolean;
  /** The length of the prefix of the input string that matches the expression */
  matchingPartLength: number;
  /**
   * The state extracted from the input string by the branch of the expression
   * tree that matched the matchingPrefix.
   */
  state: State;
  /**
   * Suggestions for continuing the input string to produce a larger
   * matchingPrefix
   */
  suggestions: Suggestion<CustomSuggestion>[];
};

/**
 * Parse the given input string against the given expression
 *
 * @param {Expression} expression - The expression to parse against
 * @param {State} initialState - A state object for the parser to use and build upon
 * @param input The input string to parse
 * @returns A @type {ParseResult} containing the output of the parse operation
 */
export function parse<State = object, CustomSuggestion = object>(
  expression: Expression<State, CustomSuggestion>,
  initialState: State,
  input: string,
): ParseResult<State, CustomSuggestion> {
  const allResults = _parse(expression, initialState, input);
  if (allResults.length === 0) {
    throw new Error("The provided expression did not produce any results");
  }

  const longestMatchLength = allResults.map((result) =>
    result.matchingPartLength
  ).reduce((a, b) => Math.max(a, b));
  const longestMatchResults = allResults.filter((result) =>
    result.matchingPartLength === longestMatchLength
  );
  const stateResult = longestMatchResults.find((result) => result.isMatch) ??
    longestMatchResults[0];

  // TODO: suggestions matching against remainder prefix

  const mergedSuggestions = Object.values(longestMatchResults.reduce<
    Record<string, SuggestionObj<CustomSuggestion>>
  >((acc, result) => {
    for (const suggestion of result.suggestions) {
      const suggestionObj = suggestionAsObj(suggestion);
      const key = suggestionObj.label;
      const existingSuggestion = acc[key];

      if (
        !existingSuggestion ||
        compareSuggestionPriority(suggestionObj, existingSuggestion) > 0
      ) {
        acc[key] = suggestionObj;
      }
    }
    return acc;
  }, {}));

  return {
    matchingPart: input.slice(0, longestMatchResults[0].matchingPartLength),
    remainder: input.slice(longestMatchResults[0].matchingPartLength),
    state: stateResult.state,
    suggestions: mergedSuggestions,
  };
}

function emptyEvalResult<State, CustomSuggestion>(
  state: State,
): EvalResult<State, CustomSuggestion> {
  return {
    isMatch: false,
    matchingPartLength: 0,
    state,
    suggestions: [],
  };
}

function suggestionAsObj<CustomSuggestion>(
  suggestion: Suggestion<CustomSuggestion>,
): SuggestionObj<CustomSuggestion> {
  return typeof suggestion === "string" ? { label: suggestion } : suggestion;
}

/**
 * A comparator for sorting suggestions by priority
 * @returns A negative value if s1 has a lower priority than s2, a positive value if s1 has a higher priority than s2, and 0 if they have the same priority
 */
function compareSuggestionPriority<CustomSuggestion>(
  s1: SuggestionObj<CustomSuggestion>,
  s2: SuggestionObj<CustomSuggestion>,
) {
  // If the suggestions have the same group, compare their individual priorities
  if (s1.group === s2.group) {
    return (s1.priority ?? 0) - (s2.priority ?? 0);
  }

  // If one suggestion has a group and the other does not, the grouped suggestion has
  // a higher priority
  const groupDiff = (s1.group ? 1 : 0) - (s2.group ? 1 : 0);
  if (groupDiff !== 0) {
    return groupDiff;
  }

  // If the suggestions have different groups, compare the group's priorities
  return (s1.group?.priority ?? 0) - (s2.group?.priority ?? 0);
}

/**
 * Parse the given input string against the given expression
 *
 * @returns {ParseResult[]} - The results of the parse operation for every branch of
 * the expression tree that match part of the input string. If none of the input string
 * matches any branch of the expression tree, an empty array is returned.
 */
function _parse<State, CustomSuggestion>(
  expression: Expression<State, CustomSuggestion>,
  state: State,
  input: string,
): EvalResult<State, CustomSuggestion>[] {
  switch (expression.type) {
    case "literal":
      return [parseLiteral(expression, state, input)];
    case "sequence":
      return parseSequence(expression, state, input);
    case "union":
      return parseUnion(expression, state, input);
  }
}

function parseLiteral<State, CustomSuggestion>(
  expression: LiteralExpression<State, CustomSuggestion>,
  state: State,
  input: string,
): EvalResult<State, CustomSuggestion> {
  const regexp = typeof expression.regexp === "function"
    ? expression.regexp(castImmutable(state))
    : expression.regexp;
  // Ensure that we only match from the start of the input
  const finalRegexp = regexp.source.startsWith("^")
    ? regexp
    : new RegExp(`^${regexp.source}`);

  const match = finalRegexp.exec(input);
  if (match) {
    const [matchingPart, ...matchGroups] = match;
    const updatedState = produce(
      state,
      (draftState) => expression.stateUpdater(draftState, matchGroups),
    );
    return {
      matchingPartLength: matchingPart.length,
      isMatch: true,
      state: updatedState,
      suggestions: [],
    };
  }

  const suggestions = typeof expression.suggestions === "function"
    ? expression.suggestions(castImmutable(state), input)
    : expression.suggestions;
  return {
    ...emptyEvalResult(state),
    suggestions: suggestions.map(suggestionAsObj),
  };
}

function parseSequence<State, CustomSuggestion>(
  expression: SequenceExpression<State, CustomSuggestion>,
  state: State,
  input: string,
): EvalResult<State, CustomSuggestion>[] {
  if (expression.sequence.length === 0) {
    throw new Error("Sequence expression must have at least one child");
  }

  const firstChildResults = _parse(expression.sequence[0], state, input);
  if (expression.sequence.length === 1) {
    return firstChildResults;
  }

  const rest = expression.sequence.slice(1);

  return firstChildResults.flatMap((firstChildResult) => {
    if (!firstChildResult.isMatch) {
      // If the first child expression did not match the input, we stop exploring
      // the branch here
      return [firstChildResult];
    }

    // Otherwise, recursively parse the remainder of the input against the rest of
    // the child expressions
    const remainder = input.slice(firstChildResult.matchingPartLength);
    const restResults = _parse(
      sequence(...rest),
      firstChildResult.state,
      remainder,
    );

    return restResults.map((restResult) => ({
      ...restResult,
      matchingPartLength: firstChildResult.matchingPartLength +
        restResult.matchingPartLength,
    }));
  });
}

function parseUnion<State, CustomSuggestion>(
  expression: UnionExpression<State, CustomSuggestion>,
  state: State,
  input: string,
): EvalResult<State, CustomSuggestion>[] {
  if (expression.alternates.length === 0) {
    throw new Error("Union expression must have at least one child");
  }

  return expression.alternates.flatMap((alternate) =>
    _parse(alternate, state, input)
  );
}
