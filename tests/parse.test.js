import { parse } from '../src';


describe('parse', () => {

  it('should parse the input correctly', () => {
    const result = parse({
      type: 'literal',
      regexp: /foo/,
      stateUpdater: () => ({}),
      suggestions: ['foobar'],
    }, 'foobar')

    expect(result).toEqual({
      matchingPrefix: 'foo',
      nonMatchingSuffix: 'bar',
      isCompleteMatch: true,
      isTerminal: true,
      state: {},
      suggestions: ['foobar']
    })
  });


});