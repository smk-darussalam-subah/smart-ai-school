'use strict';

/** Recovery is a separate observation, never a waiver for a render exception. */
function exceptionFree(pageErrors, consoleErrors) {
  if (!Array.isArray(pageErrors) || !Array.isArray(consoleErrors))
    throw new TypeError('Explicit browser exception and console collections required');
  return (
    pageErrors.length === 0 &&
    !consoleErrors.some((message) =>
      /Minified React error #\d+|Rendered (?:more|fewer) hooks|Application error: a client-side exception/i.test(
        message,
      ),
    )
  );
}

module.exports = { exceptionFree };
