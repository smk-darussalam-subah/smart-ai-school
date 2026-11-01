'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { exceptionFree } = require('./router-recovery-contract.cjs');

test('the observed staging #310 remains a failure after Beranda recovers', () => {
  // Sanitized historical observation, not a new application reproduction.
  const observation = {
    finalPath: '/dashboard',
    homeGreetingVisible: true,
    applicationErrorVisible: false,
    pageErrors: [
      {
        message:
          'Minified React error #310; visit https://react.dev/errors/310 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.',
      },
    ],
  };
  assert.equal(observation.homeGreetingVisible, true);
  assert.equal(exceptionFree(observation.pageErrors, []), false);
});
test('a completed exception-free journey passes', () => assert.equal(exceptionFree([], []), true));
test('an exception after hydration still fails', () =>
  assert.equal(exceptionFree([{ message: 'late failure' }], []), false));
test('a console-only React exception is not ignored', () =>
  assert.equal(exceptionFree([], ['Minified React error #310']), false));
test('development hook-count wording fails too', () =>
  assert.equal(exceptionFree([], ['Rendered more hooks than during the previous render.']), false));
test('an unrelated request diagnostic is not mislabeled as a render exception', () =>
  assert.equal(exceptionFree([], ['Failed to load resource: 503']), true));
test('missing evidence is rejected instead of passing', () =>
  assert.throws(() => exceptionFree(undefined, []), TypeError));
test('a clean replay does not modify a preceding failed observation', () => {
  const previous = [{ message: 'Minified React error #310' }];
  assert.equal(exceptionFree(previous, []), false);
  assert.equal(exceptionFree([], []), true);
  assert.equal(exceptionFree(previous, []), false);
});
