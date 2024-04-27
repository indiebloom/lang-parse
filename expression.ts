import { Draft, Immutable } from "./deps.ts";
import {
  Expression,
  LiteralExpression,
  SequenceExpression,
  UnionExpression,
} from "./types/expression.ts";
import { Suggestion } from "./types/suggestion.ts";

const NO_OP = () => {};

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
): SequenceExpression<State, CustomSuggestion> {
  if (sequence.length === 0) {
    throw new Error("Sequence expression must have at least one child");
  }

  return {
    type: "sequence",
    sequence,
  };
}

export function union<State = object, CustomSuggestion = object>(
  ...alternates: Expression<State, CustomSuggestion>[]
): UnionExpression<State, CustomSuggestion> {
  if (alternates.length === 0) {
    throw new Error("Union expression must have at least one child");
  }

  return {
    type: "union",
    alternates,
  };
}
