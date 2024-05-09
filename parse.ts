import { castImmutable, produce } from "./deps.ts";
import { literal } from "./expression.ts";
import {
  DynamicExpression,
  Expression,
  LiteralExpression,
  SequenceExpression,
  UnionExpression,
} from "./types/expression.ts";
import { ParseResult } from "./types/parse.ts";
import { Suggestion, SuggestionObj } from "./types/suggestion.ts";

/**
 * The result of evaluating an expression against an input string
 */
class ExpressionResult<State, CustomSuggestion> {
  readonly expression: Expression<State, CustomSuggestion>;
  readonly nodeId: string;
  readonly terminalResults: LiteralResult<State, CustomSuggestion>[];
  readonly longestMatchResults;
  parent?: ExpressionResult<State, CustomSuggestion>;

  constructor(
    expression: Expression<State, CustomSuggestion>,
    nodeId: string,
    terminalLiteralResults: PossiblyUnattachedLiteralResult<
      State,
      CustomSuggestion
    >[],
  ) {
    this.expression = expression;
    this.nodeId = nodeId;

    this.terminalResults = terminalLiteralResults.map((result) => {
      result.container ??= this;
      return result as LiteralResult<State, CustomSuggestion>;
    });

    const greatestMatchEnd = this.terminalResults.reduce(
      (greatest, result) => Math.max(greatest, result.matchEnd),
      0,
    );
    this.longestMatchResults = this.terminalResults.filter((result) =>
      result.matchEnd === greatestMatchEnd
    );
  }

  get isMatch() {
    return this.terminalResults.some((result) => result.isMatch);
  }

  get suggestions() {
    return dedupSuggestions(
      this.longestMatchResults.flatMap((result) => result.suggestions),
    );
  }

  get bestTerminalResult() {
    return this.longestMatchResults.find((result) => result.isMatch) ??
      this.longestMatchResults[0];
  }

  get matchingTerminalResults() {
    return this.terminalResults.filter((result) => result.isMatch);
  }

  get nonMatchingTerminalResults() {
    return this.terminalResults.filter((result) => !result.isMatch);
  }

  extend(
    fn: (
      latestLiteralResult: LiteralResult<State, CustomSuggestion>,
    ) => ExpressionResult<State, CustomSuggestion>,
  ) {
    const newResults = [
      ...this.nonMatchingTerminalResults,
      ...this.matchingTerminalResults.map(fn).flatMap((result) =>
        result.terminalResults
      ),
    ];
    return new ExpressionResult(this.expression, this.nodeId, newResults);
  }
}

/**
 * A link in a chain of @type {LiteralExpression}s that match sequential
 * pieces of the input to the parser. During evaluation of an expression
 * graph against an input, the parser maintains a reference to the
 * @type {LiteralResult} of the last evaluated @type {LiteralExpression} in
 * each explored path through the expression graph.
 */
type LiteralResult<State, CustomSuggestion> = {
  /**
   * The @type {ExpressionResult} of the @type {LiteralExpression} that
   * this result corresponds to
   */
  container: ExpressionResult<State, CustomSuggestion>;
  /**
   * The results from the previous literal expression in the current
   * branch of the expression graph
   */
  prev: LiteralResult<State, CustomSuggestion> | undefined;
  /**
   * The end index (exclusive) of the input segment beginning at
   * prev.matchEnd and matched by this result's corresponding literal expression.
   */
  matchEnd: number;
  /** True if the literal expression matched its input */
  isMatch: boolean;
  /** Suggestions contributed by the literal if it does not match */
  suggestions: SuggestionObj<CustomSuggestion>[];
  /**
   * The state populated by the chain of literal expressions evaluated in the
   * current branch of the expression graph
   */
  state: State;
};

type PossiblyUnattachedLiteralResult<State, CustomSuggestion> =
  & Omit<LiteralResult<State, CustomSuggestion>, "container">
  & { container?: ExpressionResult<State, CustomSuggestion> };

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
  const startResult = noopExpressionResult<State, CustomSuggestion>(
    initialState,
  );
  const result = parseInternal(
    expression,
    startResult.bestTerminalResult,
    undefined,
    0,
    input,
  );

  const best = result.bestTerminalResult;

  return {
    matchingPart: input.slice(0, best.matchEnd),
    remainder: input.slice(best.matchEnd),
    state: best.state,
    suggestions: result.suggestions,
  };
}

/**
 * Parse the given input string against the given expression
 *
 * @returns The result of evaluating the expression against the input string
 */
function parseInternal<State, CustomSuggestion>(
  expression: Expression<State, CustomSuggestion>,
  prev: LiteralResult<State, CustomSuggestion>,
  parentNodeId: string | undefined,
  ordinal: number,
  input: string,
): ExpressionResult<State, CustomSuggestion> {
  const nodeId = expression.id ??
    (parentNodeId ? `${parentNodeId}.${ordinal}` : "●");
  switch (expression.type) {
    case "literal":
      return parseLiteral(expression, prev, nodeId, input);
    case "sequence":
      return parseSequence(expression, prev, nodeId, input);
    case "union":
      return parseUnion(expression, prev, nodeId, input);
    case "dynamic":
      return parseDynamic(expression, prev, nodeId, input);
  }
}

function parseLiteral<State, CustomSuggestion>(
  expression: LiteralExpression<State, CustomSuggestion>,
  prev: LiteralResult<State, CustomSuggestion>,
  nodeId: string,
  input: string,
): ExpressionResult<State, CustomSuggestion> {
  const { state, matchEnd: prevMatchEnd } = prev;
  const regexp = typeof expression.regexp === "function"
    ? expression.regexp(castImmutable(prev.state))
    : expression.regexp;
  // Ensure that we only match from the start of the input
  const finalRegexp = regexp.source.startsWith("^")
    ? regexp
    : new RegExp(`^${regexp.source}`);

  const expressionInput = prevMatchEnd !== 0
    ? input.slice(prevMatchEnd)
    : input;
  const match = finalRegexp.exec(expressionInput);
  if (match) {
    const [matchingPart, ...matchGroups] = match;
    const updatedState = produce(
      state,
      (draftState) => expression.stateUpdater(draftState, matchGroups),
    );
    const literalResult: PossiblyUnattachedLiteralResult<
      State,
      CustomSuggestion
    > = {
      matchEnd: matchingPart.length + prevMatchEnd,
      isMatch: true,
      state: updatedState,
      suggestions: [],
      prev,
    };
    return new ExpressionResult(expression, nodeId, [literalResult]);
  }

  const suggestions = typeof expression.suggestions === "function"
    ? expression.suggestions(castImmutable(state), input)
    : expression.suggestions;
  const literalResult: PossiblyUnattachedLiteralResult<
    State,
    CustomSuggestion
  > = {
    matchEnd: prev.matchEnd,
    isMatch: false,
    state,
    prev,
    suggestions: suggestions.map(suggestionAsObj),
  };
  return new ExpressionResult(expression, nodeId, [literalResult]);
}

function parseSequence<State, CustomSuggestion>(
  expression: SequenceExpression<State, CustomSuggestion>,
  prev: LiteralResult<State, CustomSuggestion>,
  nodeId: string,
  input: string,
): ExpressionResult<State, CustomSuggestion> {
  if (expression.sequence.length === 0) {
    throw new Error("Sequence expression must have at least one child");
  }

  let result = parseInternal(expression.sequence[0], prev, nodeId, 0, input);
  const childResults: ExpressionResult<State, CustomSuggestion>[] = [result];
  for (let i = 1; i < expression.sequence.length; i++) {
    if (!result.isMatch) {
      break;
    }
    result = result.extend(
      (latestLiteralResult) => {
        const childResult = parseInternal(
          expression.sequence[i],
          latestLiteralResult,
          nodeId,
          i,
          input,
        );
        childResults.push(childResult);
        return childResult;
      },
    );
  }
  // The results of any evaluation of a sequence expression member should have
  // the sequence expression's result as their parent.
  // TODO: assigning parents after the fact like this seems error-prone. Think
  //  about how to improve.
  for (const childResult of childResults) {
    childResult.parent = result;
  }

  return result;
}

function parseUnion<State, CustomSuggestion>(
  expression: UnionExpression<State, CustomSuggestion>,
  prev: LiteralResult<State, CustomSuggestion>,
  nodeId: string,
  input: string,
): ExpressionResult<State, CustomSuggestion> {
  if (expression.alternates.length === 0) {
    throw new Error("Union expression must have at least one child");
  }

  const childResults = expression.alternates.map((alternate, i) =>
    parseInternal(alternate, prev, nodeId, i, input)
  );

  const result = new ExpressionResult(
    expression,
    nodeId,
    childResults.flatMap((childResult) => childResult.terminalResults),
  );

  for (const childResult of childResults) {
    childResult.parent = result;
  }

  return result;
}

function parseDynamic<State, CustomSuggestion>(
  expression: DynamicExpression<State, CustomSuggestion>,
  prev: LiteralResult<State, CustomSuggestion>,
  nodeId: string,
  input: string,
): ExpressionResult<State, CustomSuggestion> {
  const matchedNodeIds = getAllMatchedNodeIds(
    prev,
  );
  const wasAlreadyMatched = (expressionId: string) =>
    matchedNodeIds.has(expressionId);
  const generatedExpression = expression.fn(
    castImmutable(prev.state),
    wasAlreadyMatched,
  );

  const childResult = parseInternal(
    generatedExpression,
    prev,
    nodeId,
    0,
    input,
  );

  const result = new ExpressionResult(
    expression,
    nodeId,
    childResult.terminalResults,
  );
  childResult.parent = result;
  return result;
}

/**
 * Produce a no-op @type {ExpressionResult} representing the starting
 * state of the parser before begining evaluation of the root expression
 */
function noopExpressionResult<State, CustomSuggestion>(
  initialState: State,
) {
  const startingLiteralResult: PossiblyUnattachedLiteralResult<
    State,
    CustomSuggestion
  > = {
    matchEnd: 0,
    isMatch: true,
    state: initialState,
    suggestions: [],
    prev: undefined,
  };
  return new ExpressionResult<State, CustomSuggestion>(
    literal(/()/), // Dummy expression
    "∅",
    [startingLiteralResult],
  );
}

/** Convert a suggestion to a @type {SuggestionObj} */
function suggestionAsObj<CustomSuggestion>(
  suggestion: Suggestion<CustomSuggestion>,
): SuggestionObj<CustomSuggestion> {
  return typeof suggestion === "string" ? { label: suggestion } : suggestion;
}

/**
 * Deduplicate suggestions by label, resolving conflicts using the
 * suggestion's priorities and groups.
 *
 * Grouped suggestions are given priority over ungrouped suggestions with the same label.
 * Suggestions with higher priority values are given priority over suggestions with
 * lower priority values.
 */
function dedupSuggestions<CustomSuggestion>(
  suggestions: SuggestionObj<CustomSuggestion>[],
): SuggestionObj<CustomSuggestion>[] {
  const dedupedSuggestions: Record<string, SuggestionObj<CustomSuggestion>> =
    {};
  for (const suggestion of suggestions) {
    const suggestionObj = suggestionAsObj(suggestion);
    const key = suggestionObj.label;
    const existingSuggestion = dedupedSuggestions[key];

    if (
      !existingSuggestion ||
      compareSuggestionPriority(suggestionObj, existingSuggestion) > 0
    ) {
      dedupedSuggestions[key] = suggestionObj;
    }
  }

  return Object.values(dedupedSuggestions);
}

/**
 * A comparator for sorting suggestions by priority
 * @returns A negative value if s1 has a lower priority than s2, a positive value
 * if s1 has a higher priority than s2, and 0 if they have the same priority
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
 * Walk backwards through the chain of evaluated literal expressions, and for
 * each evaluated literal expression, traverse up the chain of its logcial parent
 * expressions to the root of the expression graph. Return the node IDs of all
 * expression nodes that have been fully evaluated as matching their input.
 */
function getAllMatchedNodeIds<
  State,
  CustomSuggestion,
>(
  latestLiteralResult: LiteralResult<State, CustomSuggestion>,
): Set<string> {
  const matchedNodeIds = new Set<string>();
  let currentLiteralResult: LiteralResult<State, CustomSuggestion> | undefined =
    latestLiteralResult;
  while (currentLiteralResult !== undefined) {
    const { isMatch, container } = currentLiteralResult;
    if (isMatch) {
      matchedNodeIds.add(container.nodeId);

      let parentResult = container.parent;
      while (parentResult !== undefined) {
        if (!matchedNodeIds.has(parentResult.nodeId)) {
          if (parentResult.isMatch) {
            matchedNodeIds.add(parentResult.nodeId);
          }
        } else {
          // Already encountered this parent expression, so its ancestors will
          // also have been processed
          break;
        }
        parentResult = parentResult.parent;
      }
    }
    currentLiteralResult = currentLiteralResult.prev;
  }

  return matchedNodeIds;
}
