import type {
  Expression,
  LiteralExpression,
  Suggestion,
  SuggestionObj,
  UnionExpression,
} from "./types/index.ts";

import { castImmutable, type Immutable, produce } from "./deps.ts";

export type ParseResult<State, CustomSuggestion = object> = {
  /** The prefix of the input string that matches the expression */
  matchingPrefix: string;
  /** The suffix of the input string that does not match the expression */
  nonMatchingSuffix: string;
  /**
   * True if the entire input string matches the expression. This is a convenience
   * property that is equivalent to `matchingPrefix === input` or `nonMatchingSuffix.length === 0`.
   */
  isCompleteMatch: boolean;
  /**
   * True if there is no way to append more tokens to the input string
   * to to match more subexpressions in this branch of the expression tree.
   */
  isTerminal: boolean;
  /**
   * The state extracted from the input string by the branch of the expression
   * tree that matched the matchingPrefix.
   */
  state: Immutable<State>;
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
  // TODO: Make inner parse fn return a matchingPrefixLen instead of separate matchingPrefix, nonMatchingSuffix, and isCompleteMatch
  // for efficiency
  const allResults = _parse(expression, initialState, input);
  if (allResults.length === 0) {
    return emptyResult(initialState, input);
  }

  const longestMatchLength = allResults.map((result) =>
    result.matchingPrefix.length
  ).reduce((a, b) => Math.max(a, b));
  const longestMatchResults = allResults.filter((result) =>
    result.matchingPrefix.length === longestMatchLength
  );
  const stateResult = longestMatchResults.find((result) => result.isTerminal) ??
    longestMatchResults[0];

  // TODO: suggestions matching against suffix prefix

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
    matchingPrefix: longestMatchResults[0].matchingPrefix,
    nonMatchingSuffix: longestMatchResults[0].nonMatchingSuffix,
    isCompleteMatch: longestMatchResults[0].isCompleteMatch,
    isTerminal: longestMatchResults[0].isTerminal,
    state: stateResult.state,
    suggestions: mergedSuggestions,
  };
}

function emptyResult<State, CustomSuggestion>(
  state: State,
  input: string,
): ParseResult<State, CustomSuggestion> {
  return {
    matchingPrefix: "",
    nonMatchingSuffix: input,
    isCompleteMatch: input.length === 0,
    isTerminal: true,
    state: castImmutable(state),
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
): ParseResult<State, CustomSuggestion>[] {
  switch (expression.type) {
    case "literal":
      return [parseLiteral(expression, state, input)];
    case "union":
      return parseUnion(expression, state, input);
  }
}

function parseLiteral<State, CustomSuggestion>(
  expression: LiteralExpression<State, CustomSuggestion>,
  state: State,
  input: string,
): ParseResult<State, CustomSuggestion> {
  const regexp = typeof expression.regexp === "function"
    ? expression.regexp(castImmutable(state))
    : expression.regexp;
  // Ensure that we only match from the start of the input
  const finalRegexp = regexp.source.startsWith("^")
    ? regexp
    : new RegExp(`^${regexp.source}`);
  const match = finalRegexp.exec(input);
  if (match) {
    const [matchingPrefix, ...matchGroups] = match;
    const updatedState = produce(
      state,
      (draftState) => expression.stateUpdater(draftState, matchGroups),
    );
    return {
      matchingPrefix,
      nonMatchingSuffix: input.slice(matchingPrefix.length),
      isCompleteMatch: input.length === matchingPrefix.length,
      isTerminal: true,
      state: castImmutable(updatedState),
      suggestions: [],
    };
  }

  const suggestions = typeof expression.suggestions === "function"
    ? expression.suggestions(castImmutable(state), input)
    : expression.suggestions;
  return {
    ...emptyResult(state, input),
    suggestions,
  };
}

function parseUnion<State, CustomSuggestion>(
  expression: UnionExpression<State>,
  state: State,
  input: string,
): ParseResult<State, CustomSuggestion>[] {
  return [];
}
