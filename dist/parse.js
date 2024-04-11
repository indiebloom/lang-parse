"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.parse = parse;
function _createForOfIteratorHelper(o, allowArrayLike) { var it = typeof Symbol !== "undefined" && o[Symbol.iterator] || o["@@iterator"]; if (!it) { if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") { if (it) o = it; var i = 0; var F = function F() {}; return { s: F, n: function n() { if (i >= o.length) return { done: true }; return { done: false, value: o[i++] }; }, e: function e(_e) { throw _e; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var normalCompletion = true, didErr = false, err; return { s: function s() { it = it.call(o); }, n: function n() { var step = it.next(); normalCompletion = step.done; return step; }, e: function e(_e2) { didErr = true; err = _e2; }, f: function f() { try { if (!normalCompletion && it["return"] != null) it["return"](); } finally { if (didErr) throw err; } } }; }
function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }
function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i]; return arr2; }
/**
 * @typedef {Object} SuggestionGroup
 * @property {any} key - The unique key for the group
 * @property {number} [priority] - The importance of the suggestion group, relative to other groups and ungrouped suggestions. May be used to determine display order.
 */

/**
 * @typedef {Object} SuggestionObj
 * @property {string} label - The string for display to the user
 * @property {string} [value] - The value that should be added to the input if the suggestion is selected by the user. If not provided, the label should be used instead.
 * @property {any} [type] - Optional custom data that can be used to create more complex suggestion interactions for users.
 * @property {SuggestionGroup} [group] - Optional group for the suggestion. May be used to associate related suggestions so that they can be displayed together.
 * @property {number} [priority] - The importance of the suggestion, relative to other suggestions in the same group, or relative to other ungrouped suggestions if this suggestion has no group. May be used to determine display order.
 */

/**
 * @typedef {string|SuggestionObj} Suggestion
 */

/**
 * @typedef {Object} ParseResult
 * @property {string} matchingPrefix - The prefix of the input string that matches the expression
 * @property {string} nonMatchingSuffix - The suffix of the input string that does not match the expression 
 * @property {boolean} isCompleteMatch - True if the entire input string matches the expression. This is a convenience property that is equivalent to `matchingPrefix === input` or `nonMatchingSuffix.length === 0`.
 * @property {boolean} isTerminal - True if there is no way to append more characters to the input string to grow the matching prefix.
 * @property {any} state - The state extracted from the input string by the branch of the expression tree that matched the matchingPrefix.
 * @property {Suggestion[]} suggestions - Suggestions for continuing the input string to produce a larger matchingPrefix
 */

/**
 * @typedef {Object} LiteralExpression
 * @property {'literal'} type
 * @property {RegExp|function(any): RegExp} regexp
 * @property {Suggestion[]|function(any, string): Suggestion[]} suggestions
 * @property {function(any, string[]): any} stateUpdater
 */

/**
 * @typedef {Object} UnionExpression
 * @property {'union'} type - The type of the expression
 * @property {Expression[]} alternatives - An array of alternative expressions that this union expression can match
 */

/**
 * @typedef {LiteralExpression|UnionExpression} Expression
 */

/**
 * Parse the given input string against the given expression
 * 
 * @param {Expression} expression - The expression to parse against
 * @param {string} input - The input string to parse
 * @returns {ParseResult} - The result of the parse operation
 */
function parse(expression, input) {
  var _longestMatchResults$;
  // TODO: Make inner parse fn return a matchingPrefixLen instead of separate matchingPrefix, nonMatchingSuffix, and isCompleteMatch
  // for efficiency
  var allResults = _parse(expression, input);
  if (allResults.length === 0) {
    return {
      matchingPrefix: '',
      nonMatchingSuffix: input,
      isCompleteMatch: input.length === 0,
      isTerminal: false,
      state: null,
      suggestions: []
    };
  }
  var longestMatchLength = allResults.map(function (result) {
    return result.matchingPrefix.length;
  }).reduce(function (a, b) {
    return Math.max(a, b);
  });
  var longestMatchResults = allResults.filter(function (result) {
    return result.matchingPrefix.length === longestMatchLength;
  });
  var stateResult = (_longestMatchResults$ = longestMatchResults.find(function (result) {
    return result.isTerminal;
  })) !== null && _longestMatchResults$ !== void 0 ? _longestMatchResults$ : longestMatchResults[0];

  // TODO: suggestions matching against suffix prefix

  var mergedSuggestions = longestMatchResults.reduce(function (acc, result) {
    var _iterator = _createForOfIteratorHelper(result.suggestions),
      _step;
    try {
      for (_iterator.s(); !(_step = _iterator.n()).done;) {
        var suggestion = _step.value;
        var key = suggestionKey(suggestion);
        var existingSuggestion = acc[key];
        if (existingSuggestion) {
          var _suggestion$group, _existingSuggestion$g;
          // Same suggestion provided multiple times. Favor
          // a) The grouped version over the non-grouped version
          // b) The higher priority version over the lower priority version / version without a priority
          if (suggestion.group !== undefined && existingSuggestion.group === undefined || (((_suggestion$group = suggestion.group) === null || _suggestion$group === void 0 ? void 0 : _suggestion$group.priority) !== undefined && (((_existingSuggestion$g = existingSuggestion.group) === null || _existingSuggestion$g === void 0 ? void 0 : _existingSuggestion$g.priorty) === undefined || existingSuggestion.group.priority < suggestion.group.priority))(suggestion.group === undefined && existingSuggestion.group === undefined && suggestion.priority !== undefined && (existingSuggestion.priority === undefined || existingSuggestion.priority < suggestion.priority))) {
            acc[key] = suggestion;
          }
        } else {
          acc[key] = suggestion;
        }
      }
    } catch (err) {
      _iterator.e(err);
    } finally {
      _iterator.f();
    }
    return acc;
  }, {});
  return {
    matchingPrefix: longestMatchResults[0].matchingPrefix,
    nonMatchingSuffix: longestMatchResults[0].nonMatchingSuffix,
    isCompleteMatch: longestMatchResults[0].isCompleteMatch,
    isTerminal: longestMatchResults[0].isTerminal,
    state: stateResult.state,
    suggestions: Object.values(mergedSuggestions)
  };
}
function suggestionKey(suggestion) {
  return typeof suggestion === 'string' ? suggestion : suggestion.label;
}

/**
 * Parse the given input string against the given expression
 * 
 * @param {Expression} expression - The expression to parse against
 * @param {string} input - The input string to parse
 * @returns {ParseResult[]} - The results of the parse operation for every branch of
 * the expression tree that match part of the input string. If none of the input string
 * matches any branch of the expression tree, an empty array is returned.
 */
function _parse(expression, input) {
  switch (expression.type) {
    case 'literal':
      var result = parseLiteral(expression, input);
      return result.matchingPrefix.length > 0 || result.suggestions.length > 0 ? [result] : [];
    case 'union':
      return parseUnion(expression, input);
  }
}

/**
 * 
 * @param {LiteralExpression} expression 
 * @param {string} input 
 * @returns {ParseResult}
 */
function parseLiteral(expression, input) {}

/**
 * 
 * @param {UnionExpression} expression 
 * @param {string} input 
 * @returns {ParseResult[]}
 */
function parseUnion(expression, input) {}