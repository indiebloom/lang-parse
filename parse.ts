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

interface FinalizedExpressionResult<State, CustomSuggestion> {
  parent?: InitialExpressionResult<State, CustomSuggestion>;
  get isMatch(): boolean;
  get branchResults(): LiteralResult<State, CustomSuggestion>[];
  get longestMatchResults(): LiteralResult<State, CustomSuggestion>[];
  get bestResult(): LiteralResult<State, CustomSuggestion>;
  get matchingBranchResults(): LiteralResult<State, CustomSuggestion>[];
  get nonMatchingBranchResults(): LiteralResult<State, CustomSuggestion>[];
  get suggestions(): SuggestionObj<CustomSuggestion>[];
}

interface InitialExpressionResult<State, CustomSuggestion> {
  get nodeId(): string;
  finalize(
    branchResults: LiteralResult<State, CustomSuggestion>[],
  ): FinalizedExpressionResult<State, CustomSuggestion>;

  get isFinalized(): boolean;

  /**
   * Throws an exception if the result has not been finalized. Otherwise returns
   * the result.
   */
  get finalized(): FinalizedExpressionResult<State, CustomSuggestion>;
}

/**
 * The result of evaluating an expression against an input string.
 *
 * Each time a @type {Expression} is encountered by the parser in a particular
 * path through the expression graph, an @type {ExpressionResult} is initialized
 * to hold the results of evaluating that expression against its input. When
 * evaluation of the expression is complete, the @type {ExpressionResult} is
 * "finalized" with the evaluation results for every branch of the expression
 * graph rooted at that expression.
 */
class ExpressionResult<State, CustomSuggestion>
  implements
    InitialExpressionResult<State, CustomSuggestion>,
    FinalizedExpressionResult<State, CustomSuggestion> {
  readonly expression: Expression<State, CustomSuggestion>;
  readonly nodeId: string;
  readonly parent?: InitialExpressionResult<State, CustomSuggestion>;
  _branchResults: LiteralResult<State, CustomSuggestion>[] | undefined =
    undefined;
  private _memoizedLongestBranchResults: LiteralResult<
    State,
    CustomSuggestion
  >[] | undefined = undefined;

  constructor(
    expression: Expression<State, CustomSuggestion>,
    nodeId: string,
    parent: InitialExpressionResult<State, CustomSuggestion> | undefined,
  ) {
    this.expression = expression;
    this.nodeId = nodeId;
    this.parent = parent;
  }

  finalize(
    branchResults: LiteralResult<State, CustomSuggestion>[],
  ): FinalizedExpressionResult<State, CustomSuggestion> {
    if (this.isFinalized) {
      throw new Error("Cannot finalize an already finalized result");
    }
    this._branchResults = branchResults;
    return this;
  }

  get isFinalized() {
    return this._branchResults !== undefined;
  }

  get finalized(): FinalizedExpressionResult<State, CustomSuggestion> {
    if (this._branchResults === undefined) {
      throw new Error("Cannot access branch results before finalizing");
    }

    return this;
  }

  get branchResults() {
    if (this._branchResults === undefined) {
      throw new Error("Cannot access branch results before finalizing");
    }

    return this._branchResults;
  }

  get isMatch() {
    return this.branchResults.some((result) => result.isMatch);
  }

  get longestMatchResults() {
    if (this._memoizedLongestBranchResults === undefined) {
      const greatestMatchEnd = this.branchResults.reduce(
        (greatest, result) => Math.max(greatest, result.matchEnd),
        0,
      );
      this._memoizedLongestBranchResults = this.branchResults.filter((result) =>
        result.matchEnd === greatestMatchEnd
      );
    }
    return this._memoizedLongestBranchResults;
  }

  get suggestions() {
    return dedupSuggestions(
      this.longestMatchResults.flatMap((result) => result.suggestions),
    );
  }

  get bestResult() {
    return this.longestMatchResults.find((result) => result.isMatch) ??
      this.longestMatchResults[0];
  }

  get matchingBranchResults() {
    return this.branchResults.filter((result) => result.isMatch);
  }

  get nonMatchingBranchResults() {
    return this.branchResults.filter((result) => !result.isMatch);
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
   * The @type {InitialExpressionResult} of the @type {LiteralExpression} that
   * this result corresponds to
   */
  container: InitialExpressionResult<State, CustomSuggestion>;
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
    startResult.bestResult,
    startResult.parent,
    0,
    input,
  );

  const best = result.bestResult;

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
  parent: InitialExpressionResult<State, CustomSuggestion> | undefined,
  ordinal: number,
  input: string,
): FinalizedExpressionResult<State, CustomSuggestion> {
  const nodeId = expression.id ??
    (parent ? `${parent.nodeId}.${ordinal}` : "●");
  const result = new ExpressionResult(expression, nodeId, parent);
  switch (expression.type) {
    case "literal":
      return parseLiteral(expression, prev, input, result);
    case "sequence":
      return parseSequence(expression, prev, input, result);
    case "union":
      return parseUnion(expression, prev, input, result);
    case "dynamic":
      return parseDynamic(expression, prev, input, result);
  }
}

function parseLiteral<State, CustomSuggestion>(
  expression: LiteralExpression<State, CustomSuggestion>,
  prev: LiteralResult<State, CustomSuggestion>,
  input: string,
  result: InitialExpressionResult<State, CustomSuggestion>,
): FinalizedExpressionResult<State, CustomSuggestion> {
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
    const literalResult: LiteralResult<
      State,
      CustomSuggestion
    > = {
      container: result,
      matchEnd: matchingPart.length + prevMatchEnd,
      isMatch: true,
      state: updatedState,
      suggestions: [],
      prev,
    };

    return result.finalize([literalResult]);
  }

  const suggestions = typeof expression.suggestions === "function"
    ? expression.suggestions(castImmutable(state), input)
    : expression.suggestions;
  const literalResult: LiteralResult<
    State,
    CustomSuggestion
  > = {
    container: result,
    matchEnd: prev.matchEnd,
    isMatch: false,
    state,
    prev,
    suggestions: suggestions.map(suggestionAsObj),
  };
  return result.finalize([literalResult]);
}

function parseSequence<State, CustomSuggestion>(
  expression: SequenceExpression<State, CustomSuggestion>,
  prev: LiteralResult<State, CustomSuggestion>,
  input: string,
  result: InitialExpressionResult<State, CustomSuggestion>,
): FinalizedExpressionResult<State, CustomSuggestion> {
  if (expression.sequence.length === 0) {
    throw new Error("Sequence expression must have at least one child");
  }

  let liveBranchResults = [prev];
  const deadBranchResults = [];
  for (let i = 0; i < expression.sequence.length; i++) {
    const childExpression = expression.sequence[i];

    const childResults = liveBranchResults.map((branchResult) =>
      parseInternal(childExpression, branchResult, result, i, input)
    );

    liveBranchResults = childResults.flatMap((childResult) =>
      childResult.matchingBranchResults
    );

    deadBranchResults.push(
      ...childResults.flatMap((childResult) =>
        childResult.nonMatchingBranchResults
      ),
    );

    if (liveBranchResults.length === 0) {
      break;
    }
  }

  return result.finalize(liveBranchResults.concat(deadBranchResults));
}

function parseUnion<State, CustomSuggestion>(
  expression: UnionExpression<State, CustomSuggestion>,
  prev: LiteralResult<State, CustomSuggestion>,
  input: string,
  result: InitialExpressionResult<State, CustomSuggestion>,
): FinalizedExpressionResult<State, CustomSuggestion> {
  if (expression.alternates.length === 0) {
    throw new Error("Union expression must have at least one child");
  }

  const childResults = expression.alternates.map((alternate, i) =>
    parseInternal(alternate, prev, result, i, input)
  );

  return result.finalize(
    childResults.flatMap((childResult) => childResult.branchResults),
  );
}

function parseDynamic<State, CustomSuggestion>(
  expression: DynamicExpression<State, CustomSuggestion>,
  prev: LiteralResult<State, CustomSuggestion>,
  input: string,
  result: InitialExpressionResult<State, CustomSuggestion>,
): FinalizedExpressionResult<State, CustomSuggestion> {
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
    result,
    0,
    input,
  );

  return result.finalize(childResult.branchResults);
}

/**
 * Produce a no-op @type {ExpressionResult} representing the starting
 * state of the parser before begining evaluation of the root expression
 */
function noopExpressionResult<State, CustomSuggestion>(
  initialState: State,
) {
  const result = new ExpressionResult<State, CustomSuggestion>(
    literal(/()/), // Dummy expression
    "∅",
    undefined,
  );
  const startingLiteralResult: LiteralResult<
    State,
    CustomSuggestion
  > = {
    container: result,
    matchEnd: 0,
    isMatch: true,
    state: initialState,
    suggestions: [],
    prev: undefined,
  };
  return result.finalize([startingLiteralResult]);
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

      let expressionResult:
        | InitialExpressionResult<State, CustomSuggestion>
        | undefined = container;
      while (expressionResult !== undefined && expressionResult.isFinalized) {
        const nodeId = expressionResult.nodeId;

        if (matchedNodeIds.has(nodeId)) {
          // Already encountered this expression result, so its ancestors will
          // also have been processed
          break;
        }

        if (expressionResult.finalized.isMatch) {
          matchedNodeIds.add(nodeId);
        }
        expressionResult = expressionResult.finalized.parent;
      }
    }
    currentLiteralResult = currentLiteralResult.prev;
  }

  return matchedNodeIds;
}
