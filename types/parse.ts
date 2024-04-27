import { SuggestionObj } from "./suggestion.ts";

/** Output produced by running the parser for an expression on an input string */
export type ParseResult<State, CustomSuggestion = object> = {
  /** The prefix of the input string that matches the expression */
  matchingPart: string;
  /** The suffix of the input string that does not match the expression */
  remainder: string;
  /**
   * The state extracted from the input string by the branch of the expression
   * tree that matched the matchingPrefix.
   */
  state: State;
  /**
   * Suggestions for continuing the input string to produce a larger
   * matchingPrefix
   */
  suggestions: SuggestionObj<CustomSuggestion>[];
};
