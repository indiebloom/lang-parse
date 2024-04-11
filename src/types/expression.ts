import { Suggestion } from "./suggestion";

export type Expression<State = {}, CustomSuggestion = {}> =
  | LiteralExpression<State, CustomSuggestion>
  | UnionExpression<State>;

/** Matches a regular expression. This is the primary match type. */
export type LiteralExpression<State = {}, CustomSuggestion = {}> = {
  type: "literal";
  regexp: RegExp | ((state: State) => RegExp);
  suggestions:
    | Suggestion<CustomSuggestion>[]
    | ((
      state: State,
      existingMatchingPart: string,
    ) => Suggestion<CustomSuggestion>[]);
  stateUpdater: (state: State, matchGroups: string[]) => State;
};

/** Matches any of several alternative expressions */
export type UnionExpression<State> = {
  type: "union";
  alternatives: Expression<State>[];
};
