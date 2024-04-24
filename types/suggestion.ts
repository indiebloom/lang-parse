export type SuggestionGroup = {
  /**
   * The unique key for the group
   */
  key: string;
  /**
   * The importance of the suggestion group, relative to other groups
   * and ungrouped suggestions. May be used to determine display order.
   */
  priority?: number;
};

export type SuggestionObj<CustomSuggestion = {}> = {
  /** The string for display to the user */
  label: string;
  /**
   * The value that should be added to the input if the suggestion is selected
   * by the user. If not provided, the label should be used instead.
   */
  value?: string;
  /**
   * Optional custom data that can be used to create more complex suggestion
   * interactions for users. For example, an application might use an enum
   * type for CustomSuggestion to indicate multiple types of interactive forms
   * that the user can use to select a value dynamically, .e.g. date picker and
   * time picker suggestions that when tapped, open a calendar or clock widget.
   */
  type?: CustomSuggestion;
  /**
   * Optional group for the suggestion. May be used to associate related suggestions
   * so that they can be displayed together.
   */
  group?: SuggestionGroup;
  /**
   * The importance of the suggestion, relative to other suggestions in the same group,
   * or relative to other ungrouped suggestions if this suggestion has no group.
   * May be used to determine display order.
   */
  priority?: number;
};

/**
 * A suggested continuation that would produce a larger matching
 * prefix if appended to the input string.
 */
export type Suggestion<CustomSuggestion> =
  | string
  | SuggestionObj<CustomSuggestion>;

/** Output produced by running the parser for an expression on an input string */
export type ParseResult<State, CustomSuggestion = {}> = {
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
   * True if there is no way to append more characters to the input string
   * to grow the matching prefix.
   */
  isTerminal: boolean;
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
