import React, { useState } from 'react';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, render, screen } from '@testing-library/react';
import { useFormProviderContext } from '../../../provider/form-provider';
import { FieldValidator } from '../../../validators/form-validator';
import { withEnglishTranslationFallbacks } from '../../../test-support';
import { type FormField } from '../../../types';
import NumberField, { parseDecimalText } from './number.component';

withEnglishTranslationFallbacks();

vi.mock('../../../provider/form-provider', () => ({
  useFormProviderContext: vi.fn(),
}));

const mockUseFormProviderContext = useFormProviderContext as Mock;

const numberFieldMock = {
  label: 'Weight(kg):',
  type: 'obs',
  id: 'weight',
  questionOptions: {
    rendering: 'number',
    concept: '5089AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  },
  isHidden: false,
  isDisabled: false,
  readonly: false,
};

const renderNumberField = async (props) => {
  await act(() => render(<NumberField {...props} />));
};

const mockProviderValues = {
  layoutType: 'small-desktop',
  sessionMode: 'enter',
  workspaceLayout: 'minimized',
  formFieldAdapters: {},
};

describe('NumberField Component', () => {
  beforeEach(() => {
    mockUseFormProviderContext.mockReturnValue(mockProviderValues);
  });

  it('renders correctly', async () => {
    await renderNumberField({
      field: numberFieldMock,
      value: '',
      errors: [],
      warnings: [],
      setFieldValue: vi.fn(),
    });

    expect(screen.getByLabelText('Weight(kg):')).toBeInTheDocument();
  });

  it('should render with NaN value', async () => {
    await renderNumberField({
      field: numberFieldMock,
      value: NaN,
      errors: [],
      warnings: [],
      setFieldValue: vi.fn(),
    });

    const inputElement = screen.getByLabelText('Weight(kg):') as HTMLInputElement;
    expect(inputElement.value).toBe('');
  });

  it('calls setFieldValue on input change', async () => {
    const user = userEvent.setup();
    const mockSetFieldValue = vi.fn();

    await renderNumberField({
      field: numberFieldMock,
      value: '',
      errors: [],
      warnings: [],
      setFieldValue: mockSetFieldValue,
    });

    const inputElement = screen.getByLabelText('Weight(kg):') as HTMLInputElement;
    await user.type(inputElement, '150');

    expect(mockSetFieldValue).toHaveBeenCalledWith(150);
  });

  it('displays error message when invalid', async () => {
    await renderNumberField({
      field: numberFieldMock,
      value: '',
      errors: [{ message: 'Invalid value' }],
      warnings: [],
      setFieldValue: vi.fn(),
    });

    expect(screen.getByText('Invalid value')).toBeInTheDocument();
  });

  it('disables input when field is disabled', async () => {
    await renderNumberField({
      field: { ...numberFieldMock, isDisabled: true },
      value: '',
      errors: [],
      warnings: [],
      setFieldValue: vi.fn(),
    });

    const inputElement = screen.getByLabelText('Weight(kg):') as HTMLInputElement;
    expect(inputElement).toBeDisabled();
  });

  // A French-locale browser empties an <input type="number"> on a typed dot ("36.4" was saved as 4), and
  // elsewhere "36,4" was saved as 364: the field is a text input that takes a dot or a comma (UVL-EMR #719).
  describe('decimals typed with a dot or a comma', () => {
    it.each([
      ['36.4', 36.4],
      ['36,4', 36.4],
      ['36.', 36],
      ['36,', 36],
      ['-1,5', -1.5],
    ])('keeps "%s" as typed and sets the value %s', async (typed, expected) => {
      const user = userEvent.setup();
      const mockSetFieldValue = vi.fn();
      await renderNumberField({
        field: numberFieldMock,
        value: '',
        errors: [],
        warnings: [],
        setFieldValue: mockSetFieldValue,
      });

      const inputElement = screen.getByLabelText('Weight(kg):') as HTMLInputElement;
      expect(inputElement).toHaveAttribute('inputmode', 'decimal');
      await user.type(inputElement, typed);

      expect(inputElement.value).toBe(typed);
      expect(mockSetFieldValue).toHaveBeenLastCalledWith(expected);
    });

    it('sets no value when the field is emptied', async () => {
      const user = userEvent.setup();
      const mockSetFieldValue = vi.fn();
      await renderNumberField({
        field: numberFieldMock,
        value: '',
        errors: [],
        warnings: [],
        setFieldValue: mockSetFieldValue,
      });

      const inputElement = screen.getByLabelText('Weight(kg):') as HTMLInputElement;
      await user.type(inputElement, '36,4');
      await user.clear(inputElement);

      expect(inputElement.value).toBe('');
      expect(mockSetFieldValue).toHaveBeenLastCalledWith(undefined);
    });

    it('ignores letters and a second decimal point', async () => {
      const user = userEvent.setup();
      const mockSetFieldValue = vi.fn();
      await renderNumberField({
        field: numberFieldMock,
        value: '',
        errors: [],
        warnings: [],
        setFieldValue: mockSetFieldValue,
      });

      const inputElement = screen.getByLabelText('Weight(kg):') as HTMLInputElement;
      await user.type(inputElement, '7a0,5.2');

      expect(inputElement.value).toBe('70,52');
      expect(mockSetFieldValue).toHaveBeenLastCalledWith(70.52);
    });

    it('shows the stored value of an encounter being edited', async () => {
      await renderNumberField({
        field: numberFieldMock,
        value: 70.5,
        errors: [],
        warnings: [],
        setFieldValue: vi.fn(),
      });

      expect((screen.getByLabelText('Weight(kg):') as HTMLInputElement).value).toBe('70.5');
    });

    /** The field with its value and errors kept as the form keeps them, validated on each change. */
    function ValidatedNumberField({ field }: { field: FormField }) {
      const [value, setValue] = useState<number | undefined>(undefined);
      const errors = FieldValidator.validate(field, value).filter((result) => result.resultType === 'error');
      return <NumberField field={field} value={value} errors={errors} warnings={[]} setFieldValue={setValue} />;
    }

    it('keeps the range message for a value typed with a comma (#500)', async () => {
      const user = userEvent.setup();
      const field = { ...numberFieldMock, questionOptions: { ...numberFieldMock.questionOptions, max: '150' } };
      await act(() => render(<ValidatedNumberField field={field as FormField} />));

      await user.type(screen.getByLabelText('Weight(kg):'), '150,5');
      expect(screen.getByText('Value must be at most 150')).toBeInTheDocument();

      await user.type(screen.getByLabelText('Weight(kg):'), '{Backspace}{Backspace}');
      expect(screen.queryByText('Value must be at most 150')).not.toBeInTheDocument();
    });

    it('keeps the decimals message for a value typed with a comma', async () => {
      const user = userEvent.setup();
      const field = {
        ...numberFieldMock,
        questionOptions: { ...numberFieldMock.questionOptions, disallowDecimals: true },
      };
      await act(() => render(<ValidatedNumberField field={field as FormField} />));

      await user.type(screen.getByLabelText('Weight(kg):'), '72,5');
      expect(screen.getByText('Decimal values are not allowed for this field')).toBeInTheDocument();
    });
  });
});

describe('parseDecimalText', () => {
  it.each([
    ['36.4', 36.4],
    ['36,4', 36.4],
    ['36.', 36],
    ['36,', 36],
    [' 70,5 ', 70.5],
    ['-1,5', -1.5],
    ['', undefined],
    [',', undefined],
    ['-', undefined],
  ])('reads "%s" as %s', (text, expected) => {
    expect(parseDecimalText(text)).toBe(expected);
  });
});
