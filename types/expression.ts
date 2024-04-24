import type { Draft, Immutable } from "../deps.ts";
import { Suggestion } from "./suggestion.ts";

export type Expression<State = object, CustomSuggestion = object> =
  | LiteralExpression<State, CustomSuggestion>
  | UnionExpression<State>;

/** Matches a regular expression. This is the primary match type. */
export type LiteralExpression<State = object, CustomSuggestion = object> = {
  type: "literal";
  regexp: RegExp | ((state: Immutable<State>) => RegExp);
  suggestions:
    | Suggestion<CustomSuggestion>[]
    | ((
      state: Immutable<State>,
      existingMatchingPart: string,
    ) => Suggestion<CustomSuggestion>[]);
  stateUpdater: (state: Draft<State>, matchGroups: string[]) => void;
};

/** Matches any of several alternative expressions */
export type UnionExpression<State> = {
  type: "union";
  alternatives: Expression<State>[];
};
