import React from 'react';
import { vi, describe, it, expect, test, beforeEach, type Mock } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { type FormField } from '../../../types';
import { useFormProviderContext } from '../../../provider/form-provider';
import DateField from './date.component';

vi.mock('src/provider/form-provider', () => ({
  useFormProviderContext: vi.fn(),
}));

const mockUseFormProviderContext = useFormProviderContext as Mock;
const mockSetFieldValue = vi.fn();

const dateFieldMock: FormField = {
  id: 'test-date-field',
  label: 'Test Date Field',
  type: 'obs',
  datePickerFormat: 'both',
  questionOptions: {
    rendering: 'date',
    concept: '6089AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  },
  isHidden: false,
  isDisabled: false,
  readonly: false,
};

const renderDateField = async (props) => {
  await act(() => render(<DateField {...props} />));
};

describe('DateField Component', () => {
  beforeEach(() => {
    mockUseFormProviderContext.mockReturnValue({
      layoutType: 'default',
      sessionMode: 'edit',
      workspaceLayout: 'default',
      formFieldAdapters: {},
    });
  });

  it('should render date picker and time picker when datePickerFormat is "both"', async () => {
    await renderDateField({
      field: dateFieldMock,
      value: new Date(),
      errors: [],
      warnings: [],
      setFieldValue: mockSetFieldValue,
    });

    expect(screen.getByLabelText('Test Date Field')).toBeInTheDocument();
    expect(screen.getByText('Time')).toBeInTheDocument();
  });

  it('should display error message when there are errors', async () => {
    await renderDateField({
      field: dateFieldMock,
      value: new Date(),
      errors: [{ resultType: 'error', message: 'Error message' }],
      warnings: [],
      setFieldValue: mockSetFieldValue,
    });

    const errorMessages = screen.getAllByText(/Error message/i);
    expect(errorMessages.length).toBeGreaterThan(0);
    errorMessages.forEach((message) => {
      expect(message).toBeInTheDocument();
    });
  });

  it('should display warning message when there are warnings', async () => {
    const warnings = [{ resultType: 'warning', message: 'Warning message' }];
    await renderDateField({
      field: dateFieldMock,
      value: new Date(),
      errors: [],
      warnings: warnings,
      setFieldValue: mockSetFieldValue,
    });

    const warningMessages = screen.getAllByText(/Warning message/i);
    expect(warningMessages.length).toBeGreaterThan(0);
    warningMessages.forEach((message) => {
      expect(message).toBeInTheDocument();
    });
  });

  it('gives the time input its own id and only a time value, beside the date picker', async () => {
    await renderDateField({
      field: dateFieldMock,
      value: new Date(2026, 10, 11, 14, 5),
      errors: [],
      warnings: [],
      setFieldValue: mockSetFieldValue,
    });

    const timeInput = screen.getByLabelText('Time') as HTMLInputElement;
    expect(timeInput.id).toBe('test-date-field-time');
    expect(timeInput.value).toBe('14:05');
  });

  it('never puts the date text in the time input', async () => {
    await renderDateField({
      field: dateFieldMock,
      value: '11/11/2026',
      errors: [],
      warnings: [],
      setFieldValue: mockSetFieldValue,
    });

    expect((screen.getByLabelText('Time') as HTMLInputElement).value).toBe('');
  });

  it('leaves the error to the date picker, so the time input shows no error icon', async () => {
    await renderDateField({
      field: dateFieldMock,
      value: new Date(),
      errors: [{ resultType: 'error', message: 'Error message' }],
      warnings: [],
      setFieldValue: mockSetFieldValue,
    });

    expect(screen.getByLabelText('Time')).not.toHaveAttribute('data-invalid');
    expect(screen.getAllByText('Error message')).toHaveLength(1);
  });

  it('keeps the error on the time input when it is the only input', async () => {
    await renderDateField({
      field: { ...dateFieldMock, datePickerFormat: 'timer' },
      value: new Date(),
      errors: [{ resultType: 'error', message: 'Error message' }],
      warnings: [],
      setFieldValue: mockSetFieldValue,
    });

    const timeInput = screen.getByLabelText('Test Date Field') as HTMLInputElement;
    expect(timeInput.id).toBe('test-date-field');
    expect(timeInput).toHaveAttribute('data-invalid');
  });
});
