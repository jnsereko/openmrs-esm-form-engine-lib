import { type FormField } from '../types';
import { vi, describe, it, expect, test } from 'vitest';
import { translateFrom } from '@openmrs/esm-framework';
import { FieldValidator } from './form-validator';
import { withEnglishTranslationFallbacks } from '../test-support';

withEnglishTranslationFallbacks();

describe('FieldValidator - validate', () => {
  const numberInputField: FormField = {
    label: 'A Question of type obs that renders a Number input',
    type: 'obs',
    questionOptions: {
      rendering: 'number',
      concept: 'a-system-defined-concept-uuid',
      min: '5',
      max: '10',
    },
    meta: {},
    id: 'sampleNumberQuestion',
  };

  const numberWithDecimalsInputField: FormField = {
    label: 'A Question of type obs that renders a Number input',
    type: 'obs',
    questionOptions: {
      rendering: 'number',
      concept: 'a-system-defined-concept-uuid',
      disallowDecimals: true,
      min: '5.0',
      max: '10.0',
    },
    id: 'sampleNumberWithDecimalsQuestion',
  };

  const textInputField: FormField = {
    label: 'A Question of type obs that renders a Text input',
    type: 'obs',
    questionOptions: {
      rendering: 'text',
      concept: 'a-system-defined-concept-uuid',
      minLength: '5',
      maxLength: '10',
    },
    meta: {},
    id: 'sampleTextQuestion',
  };

  const textInputFieldWithoutValidation: FormField = {
    label: 'A Question of type obs that renders a Text input',
    type: 'obs',
    questionOptions: {
      rendering: 'text',
      concept: 'a-system-defined-concept-uuid',
    },
    meta: {},
    id: 'sampleTextQuestion',
  };

  const textInputFieldWithMinValidation: FormField = {
    label: 'A Question of type obs that renders a Text input',
    type: 'obs',
    questionOptions: {
      rendering: 'text',
      concept: 'a-system-defined-concept-uuid',
      minLength: '5',
    },
    meta: {},
    id: 'sampleTextQuestion',
  };

  const textInputFieldWithMaxValidation: FormField = {
    label: 'A Question of type obs that renders a Text input',
    type: 'obs',
    questionOptions: {
      rendering: 'text',
      concept: 'a-system-defined-concept-uuid',
      maxLength: '10',
    },
    meta: {},
    id: 'sampleTextQuestion',
  };

  it('should fail on wrong max length only for inputText', () => {
    const validationErrors = FieldValidator.validate(textInputFieldWithMaxValidation, 'super long text to test', null);

    expect(validationErrors).toEqual([
      {
        errCode: 'field.outOfBound',
        message: `Length should not exceed ${textInputField.questionOptions.maxLength} characters`,
        resultType: 'error',
      },
    ]);
  });

  it('should fail on wrong min length only for inputText', () => {
    const validationErrors = FieldValidator.validate(textInputFieldWithMinValidation, 'sup', null);

    expect(validationErrors).toEqual([
      {
        errCode: 'field.outOfBound',
        message: `Length should be at least ${textInputField.questionOptions.minLength} characters`,
        resultType: 'error',
      },
    ]);
  });

  it('should not fail if min and max is not defined for inputText', () => {
    const validationErrors = FieldValidator.validate(
      textInputFieldWithoutValidation,
      'super text super text super text',
      null,
    );

    expect(validationErrors).toEqual([]);
  });

  it('should fail for text length greater than the max defined length', () => {
    const validationErrors = FieldValidator.validate(textInputField, 'super text super text super text', null);

    expect(validationErrors).toEqual([
      {
        errCode: 'field.outOfBound',
        message: `Length should not exceed ${textInputField.questionOptions.maxLength} characters`,
        resultType: 'error',
      },
    ]);
  });

  it('should fail for text length lesser than the min defined length', () => {
    const validationErrors = FieldValidator.validate(textInputField, 'text', null);

    expect(validationErrors).toEqual([
      {
        errCode: 'field.outOfBound',
        message: `Length should be at least ${textInputField.questionOptions.minLength} characters`,
        resultType: 'error',
      },
    ]);
  });

  it('should accept value with length within the defined range', () => {
    const validationErrors = FieldValidator.validate(textInputField, 'qwertyu', null);
    expect(validationErrors).toEqual([]);
  });

  it('should accept value with length equal to minLength', () => {
    const validationErrors = FieldValidator.validate(textInputField, 'qwert', null);
    expect(validationErrors).toEqual([]);
  });

  it('should accept value with length equal to maxLength', () => {
    const validationErrors = FieldValidator.validate(textInputField, 'qwertyuiop', null);
    expect(validationErrors).toEqual([]);
  });

  // Number Input Validator Tests
  it('should fail for number lesser than the defined min allowed', () => {
    const validationErrors = FieldValidator.validate(numberInputField, 3, null);

    expect(validationErrors).toEqual([
      {
        errCode: 'field.outOfBound',
        message: `Value must be at least ${numberInputField.questionOptions.min}`,
        resultType: 'error',
      },
    ]);
  });

  it('should fail for numbers greater than the defined max allowed', () => {
    const validationErrors = FieldValidator.validate(numberInputField, 100, null);

    expect(validationErrors).toEqual([
      {
        errCode: 'field.outOfBound',
        message: `Value must be at most ${numberInputField.questionOptions.max}`,
        resultType: 'error',
      },
    ]);
  });

  it('should fail for numbers with decimals', () => {
    const validationErrors = FieldValidator.validate(numberWithDecimalsInputField, 8.5, null);
    expect(validationErrors).toEqual([
      {
        errCode: 'field.outOfBound',
        message: 'Decimal values are not allowed for this field',
        resultType: 'error',
      },
    ]);
  });

  it('should accept numbers equal to the defined min and max', () => {
    expect(FieldValidator.validate(numberInputField, 5, null)).toEqual([]);
    expect(FieldValidator.validate(numberInputField, 10, null)).toEqual([]);
  });

  it('should look up range messages in the form engine translations with the limit as a parameter, written as the session writes numbers', () => {
    FieldValidator.validate(numberInputField, 3, null);
    FieldValidator.validate(numberInputField, 100, null);

    expect(translateFrom).toHaveBeenCalledWith(
      '@openmrs/esm-form-engine-app',
      'valueMustBeAtLeast',
      'Value must be at least {{min}}',
      { min: '5' },
    );
    expect(translateFrom).toHaveBeenCalledWith(
      '@openmrs/esm-form-engine-app',
      'valueMustBeAtMost',
      'Value must be at most {{max}}',
      { max: '10' },
    );
  });

  it('should show the translated message when the active locale has one', () => {
    vi.mocked(translateFrom).mockImplementationOnce((_moduleName, key) =>
      key === 'fieldIsMandatory' ? 'Champ obligatoire' : key,
    );

    expect(FieldValidator.validate({ ...textInputField, isRequired: true }, '', null)).toEqual([
      { errCode: 'field.required', message: 'Champ obligatoire', resultType: 'error' },
    ]);
  });
});

describe('FieldValidator - text not picked from a search list (UVL-EMR #725)', () => {
  const diagnosisField = (meta: FormField['meta'], required = false): FormField => ({
    label: 'Confirmed Diagnosis',
    type: 'diagnosis',
    questionOptions: { rendering: 'ui-select-extended', isSearchable: true },
    meta,
    isRequired: required,
    id: 'confirmedDiagnosis',
  });

  it('fails the field and names the text typed but not picked', () => {
    expect(FieldValidator.validate(diagnosisField({ textNotPickedFromList: ' Conjonctivite ' }), null)).toEqual([
      {
        resultType: 'error',
        errCode: 'field.notPickedFromList',
        message: '"Conjonctivite" is not saved: pick an entry from the list, or clear the field',
      },
    ]);
  });

  it('reports the unpicked text rather than "mandatory" on a required field', () => {
    const [result] = FieldValidator.validate(diagnosisField({ textNotPickedFromList: 'Conjonctivite' }, true), null);
    expect(result.errCode).toBe('field.notPickedFromList');
  });

  it('fails even when an entry was picked before the text was typed', () => {
    const [result] = FieldValidator.validate(diagnosisField({ textNotPickedFromList: 'Conj' }), 'malaria-uuid');
    expect(result.errCode).toBe('field.notPickedFromList');
  });

  it('passes once the text is cleared', () => {
    expect(FieldValidator.validate(diagnosisField({ textNotPickedFromList: undefined }), 'malaria-uuid')).toEqual([]);
    expect(FieldValidator.validate(diagnosisField({ textNotPickedFromList: '   ' }), null)).toEqual([]);
  });
});
