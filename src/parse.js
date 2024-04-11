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
export function parse(expression, input) {

    // TODO: Make inner parse fn return a matchingPrefixLen instead of separate matchingPrefix, nonMatchingSuffix, and isCompleteMatch
    // for efficiency
    const allResults = _parse(expression, input);
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

    const longestMatchLength = allResults.map(result => result.matchingPrefix.length).reduce((a, b) => Math.max(a, b));
    const longestMatchResults = allResults.filter(result => result.matchingPrefix.length === longestMatchLength);
    const stateResult = longestMatchResults.find(result => result.isTerminal) ?? longestMatchResults[0];

    // TODO: suggestions matching against suffix prefix

    const mergedSuggestions = longestMatchResults.reduce((acc, result) => {
        for (const suggestion of result.suggestions) {
            const key = suggestionKey(suggestion);
            const existingSuggestion = acc[key]
            if (existingSuggestion) {
                // Same suggestion provided multiple times. Favor
                // a) The grouped version over the non-grouped version
                // b) The higher priority version over the lower priority version / version without a priority
                if ((suggestion.group !== undefined && existingSuggestion.group === undefined) ||
                   (suggestion.group?.priority !== undefined && (existingSuggestion.group?.priorty === undefined || existingSuggestion.group.priority < suggestion.group.priority))
                   (suggestion.group === undefined && existingSuggestion.group === undefined && suggestion.priority !== undefined && (existingSuggestion.priority === undefined || existingSuggestion.priority < suggestion.priority))) {
                    acc[key] = suggestion;
                }
            } else {
                acc[key] = suggestion;
            }
        }
        return acc
    }, {})

    return {
        matchingPrefix: longestMatchResults[0].matchingPrefix,
        nonMatchingSuffix: longestMatchResults[0].nonMatchingSuffix,
        isCompleteMatch: longestMatchResults[0].isCompleteMatch,
        isTerminal: longestMatchResults[0].isTerminal,
        state: stateResult.state,
        suggestions: Object.values(mergedSuggestions)

    }
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
            const result = parseLiteral(expression, input);
            return result.matchingPrefix.length > 0 || result.suggestions.length > 0 ?
                [result] : [];
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
function parseLiteral(expression, input) {

}

/**
 * 
 * @param {UnionExpression} expression 
 * @param {string} input 
 * @returns {ParseResult[]}
 */
function parseUnion(expression, input) {

}