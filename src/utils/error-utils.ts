import { showSnackbar } from '@openmrs/esm-framework';
import { translateValidationMessage } from '../validators/form-validator';

/**
 * Server validation codes the REST error carries as their own message, the key untranslated
 * (ObsValidator rejects a number outside the concept's absolute limits with them; core's
 * messages.properties only defines them with an `.obs.valueNumeric` suffix). Neither the field nor
 * the limit is in the response, so the message stays general. A message the server did translate
 * (a site's message properties) is kept.
 */
const untranslatedServerCodes: Record<string, [key: string, defaultValue: string]> = {
  'error.value.outOfRange.high': [
    'valueAboveAcceptedMaximum',
    'A value is above the highest accepted for its question: check the numbers entered in the form',
  ],
  'error.outOfRange.high': [
    'valueAboveAcceptedMaximum',
    'A value is above the highest accepted for its question: check the numbers entered in the form',
  ],
  'error.value.outOfRange.low': [
    'valueBelowAcceptedMinimum',
    'A value is below the lowest accepted for its question: check the numbers entered in the form',
  ],
  'error.outOfRange.low': [
    'valueBelowAcceptedMinimum',
    'A value is below the lowest accepted for its question: check the numbers entered in the form',
  ],
};

/**
 * Server codes whose English sentence tells the user nothing to do. The code is read first because
 * the server sends the sentence in its own language.
 */
const serverCodesWithAdvice: Record<string, [key: string, defaultValue: string]> = {
  'Encounter.datetimeShouldBeInVisitDatesRange': [
    'encounterDatetimeOutsideVisit',
    'The date of the form is outside its visit (the visit has ended, or the date is before it started). Choose a date within the visit, or start a new visit.',
  ],
};

function messageOf(error: { code?: string; message?: string }): string {
  const advice = serverCodesWithAdvice[error?.code];
  if (advice) {
    return translateValidationMessage(...advice);
  }
  const known = untranslatedServerCodes[error?.message || error?.code];
  return known ? translateValidationMessage(...known) : error?.message;
}

export function reportError(error: Error, title: string): void {
  if (error) {
    const errorMessage = extractErrorMessagesFromResponse(error).join(', ');
    console.error(error);
    showSnackbar({
      subtitle: errorMessage,
      title: title,
      kind: 'error',
      isLowContrast: false,
    });
  }
}

/**
 * Extracts error messages from a given error response object.
 * If fieldErrors are present, it extracts the error messages from each field.
 * Otherwise, it returns the top-level error message.
 *
 * @param {object} errorObject - The error response object.
 * @returns {string[]} An array of error messages.
 */
export function extractErrorMessagesFromResponse(errorObject) {
  const fieldErrors = errorObject?.responseBody?.error?.fieldErrors;
  const globalErrors = errorObject?.responseBody?.error?.globalErrors;

  if ((!fieldErrors || Object.keys(fieldErrors).length === 0) && !globalErrors) {
    return [errorObject?.responseBody?.error?.message ?? errorObject?.message];
  }

  if (globalErrors?.length) {
    return globalErrors.flatMap((error) => messageOf(error));
  } else {
    return Object.values(fieldErrors).flatMap((errors: Array<{ code?: string; message?: string }>) =>
      errors.map((error) => messageOf(error)),
    );
  }
}
