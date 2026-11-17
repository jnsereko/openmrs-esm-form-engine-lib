import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { showSnackbar, translateFrom } from '@openmrs/esm-framework';
import { extractErrorMessagesFromResponse, reportError } from './error-utils';
import { withEnglishTranslationFallbacks } from '../test-support';

withEnglishTranslationFallbacks();

describe('extractErrorMessagesFromResponse', () => {
  it('returns the top-level REST error message when there are no field or global errors', () => {
    const error = { responseBody: { error: { message: 'Invalid submission' } } };
    expect(extractErrorMessagesFromResponse(error)).toEqual(['Invalid submission']);
  });

  it('falls back to the plain Error message when there is no response body', () => {
    expect(extractErrorMessagesFromResponse(new Error('Network failure'))).toEqual(['Network failure']);
  });

  it('returns [undefined] when no message exists anywhere', () => {
    expect(extractErrorMessagesFromResponse({})).toEqual([undefined]);
  });

  it('flattens field error messages across fields', () => {
    const error = {
      responseBody: {
        error: {
          fieldErrors: {
            encounterDatetime: [{ message: 'Date cannot be in the future' }, { message: 'Date is required' }],
            location: [{ message: 'Location is required' }],
          },
        },
      },
    };
    expect(extractErrorMessagesFromResponse(error)).toEqual([
      'Date cannot be in the future',
      'Date is required',
      'Location is required',
    ]);
  });

  it('prefers global errors over field errors when both are present', () => {
    const error = {
      responseBody: {
        error: {
          fieldErrors: { location: [{ message: 'Location is required' }] },
          globalErrors: [{ message: 'Encounter validation failed' }],
        },
      },
    };
    expect(extractErrorMessagesFromResponse(error)).toEqual(['Encounter validation failed']);
  });

  it('treats an empty fieldErrors object as no field errors', () => {
    const error = {
      responseBody: { error: { fieldErrors: {}, message: 'Fallback message' } },
    };
    expect(extractErrorMessagesFromResponse(error)).toEqual(['Fallback message']);
  });

  it('throws when globalErrors is an empty array and there are no fieldErrors', () => {
    // Pins a real defect: an empty (truthy) globalErrors array skips the fallback
    // guard, then the empty-length check routes to Object.values(fieldErrors) with
    // fieldErrors undefined. Every caller sits inside a catch block, so this throw
    // replaces the original error. Recorded here so the eventual fix is a
    // deliberate, visible behavior change.
    const error = { responseBody: { error: { globalErrors: [] } } };
    expect(() => extractErrorMessagesFromResponse(error)).toThrow(TypeError);
  });
});

describe('extractErrorMessagesFromResponse - server range codes left untranslated (UVL-EMR #751)', () => {
  const outOfRange = (code: string, message = code) => ({
    responseBody: {
      error: {
        message: 'Invalid Submission',
        code: 'webservices.rest.error.invalid.submission',
        globalErrors: [],
        fieldErrors: { valueNumeric: [{ code, message }] },
      },
    },
  });

  it('replaces error.value.outOfRange.high with a readable message, never the raw key', () => {
    expect(extractErrorMessagesFromResponse(outOfRange('error.value.outOfRange.high'))).toEqual([
      'A value is above the highest accepted for its question: check the numbers entered in the form',
    ]);
  });

  it('replaces error.value.outOfRange.low the same way', () => {
    expect(extractErrorMessagesFromResponse(outOfRange('error.value.outOfRange.low'))).toEqual([
      'A value is below the lowest accepted for its question: check the numbers entered in the form',
    ]);
  });

  it('looks the message up in the form engine translations', () => {
    extractErrorMessagesFromResponse(outOfRange('error.value.outOfRange.high'));
    expect(translateFrom).toHaveBeenCalledWith(
      '@openmrs/esm-form-engine-app',
      'valueAboveAcceptedMaximum',
      'A value is above the highest accepted for its question: check the numbers entered in the form',
      undefined,
    );
  });

  it('keeps a message the server did translate', () => {
    const translated = 'La valeur saisie est supérieure au maximum attendu 47.0';
    expect(extractErrorMessagesFromResponse(outOfRange('error.value.outOfRange.high', translated))).toEqual([
      translated,
    ]);
  });

  it('maps the same codes in global errors', () => {
    const error = {
      responseBody: { error: { globalErrors: [{ code: 'error.outOfRange.high', message: 'error.outOfRange.high' }] } },
    };
    expect(extractErrorMessagesFromResponse(error)).toEqual([
      'A value is above the highest accepted for its question: check the numbers entered in the form',
    ]);
  });
});

describe('reportError', () => {
  let consoleErrorSpy: MockInstance;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('shows an error snackbar with the extracted message and logs the error', () => {
    const error = new Error('Something went wrong');
    reportError(error, 'Error saving encounter');

    expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    expect(showSnackbar).toHaveBeenCalledWith({
      title: 'Error saving encounter',
      subtitle: 'Something went wrong',
      kind: 'error',
      isLowContrast: false,
    });
  });

  it('joins multiple extracted messages with a comma', () => {
    const error = {
      responseBody: {
        error: {
          fieldErrors: {
            a: [{ message: 'first' }],
            b: [{ message: 'second' }],
          },
        },
      },
    } as unknown as Error;
    reportError(error, 'Error');

    expect(showSnackbar).toHaveBeenCalledWith(expect.objectContaining({ subtitle: 'first, second' }));
  });

  it('does nothing when the error is null', () => {
    reportError(null, 'Error saving encounter');

    expect(showSnackbar).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
