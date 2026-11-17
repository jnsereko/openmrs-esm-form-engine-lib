import { translateFrom } from '@openmrs/esm-framework';
import { type TOptions } from 'i18next';
import { type FormFieldValidator, type FormField } from '../types';
import { formEngineAppName } from '../globals';
import { formatDecimal } from '../utils/decimal-format';
export const fieldRequiredErrCode = 'field.required';
export const fieldOutOfBoundErrCode = 'field.outOfBound';
export const fieldNotPickedFromListErrCode = 'field.notPickedFromList';

/**
 * Translates a validation message. The English text is the fallback, so a locale bundle
 * without the key still shows a readable message.
 */
export function translateValidationMessage(
  key: string,
  defaultValue: string,
  options?: Omit<TOptions, 'ns' | 'defaultValue'>,
): string {
  return translateFrom(formEngineAppName, key, defaultValue, options);
}

export const FieldValidator: FormFieldValidator = {
  validate: (field: FormField, value: any) => {
    if (field.meta?.submission?.unspecified) {
      return [];
    }
    // A search list keeps only an entry picked from it. Text typed without picking one is never
    // saved, so it blocks the save instead of disappearing (set by the ui-select-extended input).
    if (!isEmpty(field.meta?.textNotPickedFromList)) {
      return addError(
        fieldNotPickedFromListErrCode,
        translateValidationMessage(
          'textNotPickedFromList',
          '"{{- text}}" is not saved: pick an entry from the list, or clear the field',
          { text: field.meta.textNotPickedFromList.trim() },
        ),
      );
    }
    if (isEmpty(value) && field.isRequired) {
      if (typeof field.required === 'object' && field.required.type === 'conditionalRequired' && field.isRequired) {
        return addError(
          fieldRequiredErrCode,
          field.required.message ?? translateValidationMessage('fieldIsMandatory', 'Field is mandatory'),
        );
      } else if (field.isRequired) {
        return addError(fieldRequiredErrCode, translateValidationMessage('fieldIsMandatory', 'Field is mandatory'));
      }
    }
    if (field.questionOptions.rendering === 'text') {
      const minLength = field.questionOptions.minLength;
      const maxLength = field.questionOptions.maxLength;

      return textInputLengthValidator(minLength, maxLength, value?.length) ?? [];
    }
    if (field.questionOptions.rendering === 'number') {
      // The server refuses a value outside the concept's absolute limits (HTTP 400 on save), so
      // they bound the field too; the stricter of the form's limit and the concept's wins.
      const min = stricterLimit(field.questionOptions.min, field.meta?.concept?.lowAbsolute, Math.max);
      const max = stricterLimit(field.questionOptions.max, field.meta?.concept?.hiAbsolute, Math.min);
      const disallowDecimals = field.questionOptions.disallowDecimals || field.meta?.concept?.allowDecimal;
      if (isEmpty(value)) return [];
      if (disallowDecimals && !Number.isInteger(value)) {
        return addError(
          fieldOutOfBoundErrCode,
          translateValidationMessage('decimalValuesNotAllowed', 'Decimal values are not allowed for this field'),
        );
      }
      if (!Number.isNaN(min) || !Number.isNaN(max)) {
        return numberInputRangeValidator(min, max, value);
      }
    }
    return [];
  },
};

/**
 * The stricter of the form's limit and the concept's (`pick` is Math.min for a maximum, Math.max for
 * a minimum); NaN when neither is set. The form's limit is read as before, with Number().
 */
function stricterLimit(formLimit: unknown, conceptLimit: unknown, pick: (a: number, b: number) => number): number {
  const limits = [Number(formLimit), typeof conceptLimit === 'number' ? conceptLimit : NaN].filter(
    (limit) => !Number.isNaN(limit),
  );
  return limits.length ? limits.reduce((a, b) => pick(a, b)) : NaN;
}

export function numberInputRangeValidator(min: number, max: number, inputValue: number) {
  if (!Number.isNaN(min) && inputValue < min) {
    return addError(
      fieldOutOfBoundErrCode,
      translateValidationMessage('valueMustBeAtLeast', 'Value must be at least {{min}}', { min: formatDecimal(min) }),
    );
  }

  if (!Number.isNaN(max) && inputValue > max) {
    return addError(
      fieldOutOfBoundErrCode,
      translateValidationMessage('valueMustBeAtMost', 'Value must be at most {{max}}', { max: formatDecimal(max) }),
    );
  }

  return [];
}

export function isEmpty(value: any): boolean {
  if (value === undefined || value === null || value === '') {
    return true;
  }
  if (typeof value == 'string' && !value?.trim()) {
    return true;
  }
  if (Array.isArray(value) && !value.length) {
    return true;
  }
  return false;
}

export function textInputLengthValidator(minLength: string, maxLength: string, inputLength: number) {
  const minLen = Number(minLength);
  const maxLen = Number(maxLength);

  if (typeof inputLength === 'number' && !Number.isNaN(inputLength)) {
    if (minLen && maxLen && inputLength >= minLen && inputLength <= maxLen) {
      return [];
    }

    if (minLen && inputLength < minLen) {
      return addError(
        fieldOutOfBoundErrCode,
        translateValidationMessage('lengthShouldBeAtLeast', 'Length should be at least {{minLength}} characters', {
          minLength: minLen,
        }),
      );
    }

    if (maxLen && inputLength > maxLen) {
      return addError(
        fieldOutOfBoundErrCode,
        translateValidationMessage('lengthShouldNotExceed', 'Length should not exceed {{maxLength}} characters', {
          maxLength: maxLen,
        }),
      );
    }

    if (maxLen && minLen && inputLength < minLen && inputLength > maxLen) {
      return addError(
        fieldOutOfBoundErrCode,
        translateValidationMessage(
          'lengthShouldBeBetween',
          'Length should be between {{minLength}} and {{maxLength}} characters',
          { minLength: minLen, maxLength: maxLen },
        ),
      );
    }
  }
}

export function addError(errorCode: string, message: string): [{}] {
  return [
    {
      resultType: 'error',
      errCode: errorCode,
      message: message,
    },
  ];
}
