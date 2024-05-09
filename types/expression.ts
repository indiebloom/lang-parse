import type { Draft, Immutable } from "../deps.ts";
import { Suggestion } from "./suggestion.ts";

export type WithID = {
  /**
   * A string that uniquely identifies this expression node.
   * The parser will generate a unique ID for the expression node if one is
   * not provided here.
   */
  id: string;
};

/** Matches a regular expression. This is the primary match type. */
export type LiteralExpression<State = object, CustomSuggestion = object> =
  & Partial<WithID>
  & {
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

/** Matches an ordered sequence of expressions */
export type SequenceExpression<State = object, CustomSuggestion = object> =
  & Partial<WithID>
  & {
    type: "sequence";
    sequence: Expression<State, CustomSuggestion>[];
  };

/** Matches any of several alternative expressions */
export type UnionExpression<State = object, CustomSuggestion = object> =
  & Partial<WithID>
  & {
    type: "union";
    alternates: Expression<State, CustomSuggestion>[];
  };

export type ExpressionGenerator<State = object, CustomSuggestion = object> = (
  state: Immutable<State>,
  wasAlreadyMatched: (
    expressionID: string,
  ) => boolean,
) => Expression<State, CustomSuggestion>;

/** Generates an exprssion based on the current state */
export type DynamicExpression<State = object, CustomSuggestion = object> =
  & Partial<WithID>
  & {
    type: "dynamic";
    fn: ExpressionGenerator<State, CustomSuggestion>;
  };

export type Expression<State = object, CustomSuggestion = object> =
  | LiteralExpression<State, CustomSuggestion>
  | SequenceExpression<State, CustomSuggestion>
  | UnionExpression<State, CustomSuggestion>
  | DynamicExpression<State, CustomSuggestion>;

export type ExpressionWithId<State = object, CustomSuggestion = object> =
  & Expression<State, CustomSuggestion>
  & WithID;
