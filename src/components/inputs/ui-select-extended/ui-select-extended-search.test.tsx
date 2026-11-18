import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type OpenmrsResource } from '@openmrs/esm-framework';
import { type DataSource, type FormField } from '../../../types';
import { buildField, renderWithFormContext } from '../../../test-support';
import { useFormProviderContext } from '../../../provider/form-provider';
import * as registry from '../../../registry/registry';
import UiSelectExtended, { findItemsNamed } from './ui-select-extended.component';

// These tests drive the input with fireEvent rather than userEvent. userEvent awaits a
// setTimeout inside testing-library's async wrapper that only advances under jest's fake
// timers, so it never resolves while vitest's fake timers are installed.

const fetchData = vi.fn<DataSource<OpenmrsResource>['fetchData']>();
const datasource: DataSource<OpenmrsResource> = {
  fetchData,
  fetchSingleItem: vi.fn(),
  toUuidAndDisplay: (item) => item,
};

const setFieldValueSpy = vi.fn();

function Connected({ field }: { field: FormField }) {
  const { methods } = useFormProviderContext();

  return (
    <UiSelectExtended
      field={field}
      value={null}
      errors={[]}
      warnings={[]}
      setFieldValue={(value) => {
        setFieldValueSpy(value);
        methods.setValue(field.id, value, { shouldDirty: true });
      }}
    />
  );
}

async function renderSearch(initialValue = '') {
  const field = buildField({
    id: 'provider',
    questionOptions: {
      rendering: 'ui-select-extended',
      isSearchable: true,
      datasource: { name: 'provider', config: { tag: 'initial' } },
    },
  });
  const result = renderWithFormContext(<Connected field={field} />, {
    fields: [field],
    initialValues: { provider: initialValue },
  });
  await act(async () => {});

  return { ...result, field };
}

function type(value: string) {
  fireEvent.change(screen.getByRole('combobox'), { target: { value } });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchData.mockReset().mockResolvedValue([]);
  setFieldValueSpy.mockReset();
  vi.spyOn(registry, 'getRegisteredDataSource').mockResolvedValue(datasource);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('search request lifetime', () => {
  it('searches once after rapid typing, using the latest term', async () => {
    await renderSearch();

    for (const value of ['m', 'ma', 'mal', 'mala']) {
      type(value);
      await advance(40);
    }
    expect(fetchData).not.toHaveBeenCalled();
    await advance(300);

    expect(fetchData).toHaveBeenCalledExactlyOnceWith('mala', { tag: 'initial' });
  });

  it('cancels a pending search when the query is cleared', async () => {
    await renderSearch();

    type('mal');
    await advance(100);
    type('');
    await advance(300);

    expect(fetchData).not.toHaveBeenCalled();
  });

  it('cancels a pending search when unmounted', async () => {
    const { unmount } = await renderSearch();

    type('mal');
    unmount();
    await advance(300);

    expect(fetchData).not.toHaveBeenCalled();
  });

  it('uses updated configuration when a pending search is replaced', async () => {
    const { rerender, field } = await renderSearch();
    const updatedField = {
      ...field,
      questionOptions: {
        ...field.questionOptions,
        datasource: { name: 'provider', config: { tag: 'updated' } },
      },
    };

    type('mal');
    await advance(100);
    rerender(<Connected field={updatedField} />);
    await advance(300);

    expect(fetchData).toHaveBeenCalledExactlyOnceWith('mal', { tag: 'updated' });
  });

  it('retains the selected item when new search results arrive', async () => {
    vi.mocked(datasource.fetchSingleItem).mockResolvedValue({ uuid: 'selected', display: 'Selected provider' });
    fetchData.mockResolvedValue([{ uuid: 'new', display: 'New provider' }]);
    await renderSearch('selected');

    type('new');
    await advance(300);

    expect(screen.getByText('New provider')).toBeInTheDocument();
    expect(screen.getByText('Selected provider')).toBeInTheDocument();
  });

  it('ignores an older response that arrives after the current search', async () => {
    let resolveOld: (items: OpenmrsResource[]) => void;
    fetchData.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    );
    fetchData.mockResolvedValueOnce([{ uuid: 'new', display: 'New provider' }]);
    await renderSearch();

    type('old');
    await advance(300);
    type('new');
    await advance(300);
    expect(screen.getByText('New provider')).toBeInTheDocument();
    await act(async () => {
      resolveOld([{ uuid: 'old', display: 'Old provider' }]);
    });

    expect(screen.getByText('New provider')).toBeInTheDocument();
    expect(screen.queryByText('Old provider')).not.toBeInTheDocument();
  });

  it('does not repeat a resolved search when a synonym match is selected', async () => {
    fetchData.mockResolvedValue([{ uuid: 'acet', display: 'Acetaminophen' }]);
    await renderSearch();

    type('para');
    await advance(300);
    fireEvent.click(screen.getByRole('option', { name: 'Acetaminophen' }));
    await advance(350);

    expect(fetchData).toHaveBeenCalledTimes(1);
  });

  it('invalidates an in-flight search when an item is selected', async () => {
    let resolveInFlight: (items: OpenmrsResource[]) => void;
    fetchData.mockResolvedValueOnce([{ uuid: 'malaria', display: 'Malaria' }]);
    fetchData.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveInFlight = resolve;
      }),
    );
    await renderSearch();

    type('ma');
    await advance(300);
    type('malx');
    await advance(300);
    fireEvent.click(screen.getByRole('option', { name: 'Malaria' }));
    await act(async () => {
      resolveInFlight([{ uuid: 'unrelated', display: 'Unrelated result' }]);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(screen.queryByRole('option', { name: 'Unrelated result' })).not.toBeInTheDocument();
    expect(screen.queryByText('Searching...')).not.toBeInTheDocument();
  });

  it('cancels a pending search when an item is selected', async () => {
    fetchData.mockResolvedValue([{ uuid: 'malaria', display: 'Malaria' }]);
    await renderSearch();

    type('ma');
    await advance(300);
    type('malx');
    await advance(100);
    fireEvent.click(screen.getByRole('option', { name: 'Malaria' }));
    await advance(350);

    expect(fetchData).toHaveBeenCalledExactlyOnceWith('ma', { tag: 'initial' });
    expect(screen.getByRole('combobox')).toHaveValue('Malaria');
  });
});

describe('search that the selected entry or earlier results match (UVL-EMR #759)', () => {
  it('searches the server even when the selected entry contains the typed text', async () => {
    vi.mocked(datasource.fetchSingleItem).mockResolvedValue({ uuid: 'dusenge', display: 'Pacifique Dusenge' });
    fetchData.mockResolvedValue([
      { uuid: 'gahungu', display: 'Pacifique Gahungu' },
      { uuid: 'dusenge', display: 'Pacifique Dusenge' },
    ]);
    await renderSearch('dusenge');

    type('Pacifique');
    await advance(300);

    expect(fetchData).toHaveBeenCalledExactlyOnceWith('Pacifique', { tag: 'initial' });
    expect(screen.getByText('Pacifique Gahungu')).toBeInTheDocument();
  });

  it('searches the server even when an earlier result contains the typed text', async () => {
    fetchData.mockResolvedValueOnce([{ uuid: 'gahungu', display: 'Pacifique Gahungu' }]).mockResolvedValueOnce([
      { uuid: 'gahungu', display: 'Pacifique Gahungu' },
      { uuid: 'dusenge', display: 'Pacifique Dusenge' },
    ]);
    await renderSearch();

    type('Pacifique G');
    await advance(300);
    type('Pacifique');
    await advance(300);

    expect(fetchData).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Pacifique Dusenge')).toBeInTheDocument();
  });

  it('empties the list when a search finds nothing, and keeps the selected value', async () => {
    fetchData
      .mockResolvedValueOnce([{ uuid: 'sebastien', display: 'Sebastien Nsengumuremyi' }])
      .mockResolvedValueOnce([]);
    await renderSearch();

    type('Sebastien');
    await advance(300);
    fireEvent.click(screen.getByRole('option', { name: 'Sebastien Nsengumuremyi' }));
    type('zzqx');
    await advance(300);

    expect(fetchData).toHaveBeenLastCalledWith('zzqx', { tag: 'initial' });
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(setFieldValueSpy).toHaveBeenLastCalledWith('sebastien');
  });

  it('does not search for the selected entry shown in the input', async () => {
    vi.mocked(datasource.fetchSingleItem).mockResolvedValue({ uuid: 'dusenge', display: 'Pacifique Dusenge' });
    await renderSearch('dusenge');
    await advance(300);

    expect(screen.getByRole('combobox')).toHaveValue('Pacifique Dusenge');
    expect(fetchData).not.toHaveBeenCalled();
  });
});

describe('text typed but not picked from the list (UVL-EMR #725)', () => {
  function leave() {
    fireEvent.blur(screen.getByRole('combobox'));
  }

  it('flags the text on the field when it is left without picking an entry', async () => {
    const { field } = await renderSearch();

    type('Conjonctivite');
    await advance(300);
    leave();

    expect(field.meta.textNotPickedFromList).toBe('Conjonctivite');
    // set again to the value it had (empty here), so the field is validated and the error shows before the save
    expect(setFieldValueSpy).toHaveBeenLastCalledWith('');
  });

  it('picks the one entry whose label is typed in full (UVL-EMR #768)', async () => {
    fetchData.mockResolvedValue([{ uuid: 'malaria', display: 'Malaria' }]);
    const { field } = await renderSearch();

    type('Malaria');
    await advance(300);
    leave();

    expect(field.meta.textNotPickedFromList).toBeUndefined();
    expect(setFieldValueSpy).toHaveBeenLastCalledWith('malaria');
  });

  it('clears the flag when an entry is picked', async () => {
    fetchData.mockResolvedValue([{ uuid: 'malaria', display: 'Malaria' }]);
    const { field } = await renderSearch();

    type('Malx');
    await advance(300);
    leave();
    expect(field.meta.textNotPickedFromList).toBe('Malx');

    type('ma');
    await advance(300);
    fireEvent.click(screen.getByRole('option', { name: 'Malaria' }));

    expect(field.meta.textNotPickedFromList).toBeUndefined();
    expect(setFieldValueSpy).toHaveBeenLastCalledWith('malaria');
  });

  it('flags nothing when the combobox puts the picked entry back over the typed text (UVL-EMR #759)', async () => {
    fetchData
      .mockResolvedValueOnce([{ uuid: 'sebastien', display: 'Sebastien Nsengumuremyi' }])
      .mockResolvedValueOnce([]);
    const { field } = await renderSearch();

    type('Sebastien');
    await advance(300);
    fireEvent.click(screen.getByRole('option', { name: 'Sebastien Nsengumuremyi' }));
    type('eip');
    await advance(300);
    leave();

    // (Carbon's blur reducer writes the picked entry's label back into the input; jsdom does not run it.)
    expect(field.meta.textNotPickedFromList).toBeUndefined();
    expect(setFieldValueSpy).toHaveBeenLastCalledWith('sebastien');
  });

  it('picks the entry whose label is typed in full over the picked entry (UVL-EMR #768)', async () => {
    fetchData.mockResolvedValue([
      { uuid: 'malaria', display: 'Malaria' },
      { uuid: 'measles', display: 'Measles' },
    ]);
    const { field } = await renderSearch();

    type('ma');
    await advance(300);
    fireEvent.click(screen.getByRole('option', { name: 'Malaria' }));
    type('Measles');
    await advance(300);
    leave();

    expect(field.meta.textNotPickedFromList).toBeUndefined();
    expect(setFieldValueSpy).toHaveBeenLastCalledWith('measles');
    expect(screen.getByRole('combobox')).toHaveValue('Measles');
  });

  it('clears the flag and the value when the field is left empty', async () => {
    const { field } = await renderSearch();

    type('Conjonctivite');
    await advance(300);
    leave();
    type('');
    leave();

    expect(field.meta.textNotPickedFromList).toBeUndefined();
    expect(setFieldValueSpy).toHaveBeenLastCalledWith(null);
  });

  it('flags nothing when the input shows the picked entry', async () => {
    fetchData.mockResolvedValue([{ uuid: 'malaria', display: 'Malaria' }]);
    const { field } = await renderSearch();

    type('ma');
    await advance(300);
    fireEvent.click(screen.getByRole('option', { name: 'Malaria' }));
    leave();

    expect(field.meta.textNotPickedFromList).toBeUndefined();
  });
});

describe('a provider typed over the picked one without picking it (UVL-EMR #768)', () => {
  const sebastien = {
    uuid: 'sebastien',
    identifier: 'sebastien.nsengumuremyi',
    display: 'sebastien.nsengumuremyi - Sebastien Nsengumuremyi',
  };
  const nephtalie = {
    uuid: 'nephtalie',
    identifier: 'nephtalie.cimana',
    display: 'nephtalie.cimana - Nephtalie CIMANA',
  };

  function leave() {
    fireEvent.blur(screen.getByRole('combobox'));
  }

  async function pickSebastien() {
    fetchData.mockResolvedValueOnce([sebastien]);
    const rendered = await renderSearch();
    type('Sebastien');
    await advance(300);
    fireEvent.click(screen.getByRole('option', { name: sebastien.display }));
    return rendered;
  }

  it('picks the provider whose name is typed in full, not the one picked before', async () => {
    const { field } = await pickSebastien();
    fetchData.mockResolvedValueOnce([nephtalie]);

    type('Nephtalie CIMANA');
    await advance(300);
    leave();
    await advance(0);

    expect(setFieldValueSpy).toHaveBeenLastCalledWith('nephtalie');
    expect(field.meta.textNotPickedFromList).toBeUndefined();
    expect(screen.getByRole('combobox')).toHaveValue(nephtalie.display);
  });

  it('picks the provider whose identifier is typed, ignoring case and spaces', async () => {
    const { field } = await pickSebastien();
    fetchData.mockResolvedValueOnce([nephtalie]);

    type('  NEPHTALIE.cimana ');
    await advance(300);
    leave();

    expect(setFieldValueSpy).toHaveBeenLastCalledWith('nephtalie');
    expect(field.meta.textNotPickedFromList).toBeUndefined();
  });

  it('blocks the save when the typed name is that of two providers', async () => {
    const { field } = await pickSebastien();
    fetchData.mockResolvedValueOnce([
      nephtalie,
      { ...nephtalie, uuid: 'nephtalie-2', identifier: 'ncimana', display: 'ncimana - Nephtalie Cimana' },
    ]);

    type('Nephtalie Cimana');
    await advance(300);
    leave();

    expect(field.meta.textNotPickedFromList).toBe('Nephtalie Cimana');
    expect(setFieldValueSpy).toHaveBeenLastCalledWith('sebastien');
  });

  it('blocks the save while the search for the text left in the field has not answered, then picks the provider it names', async () => {
    const { field } = await pickSebastien();
    let answer: (items: OpenmrsResource[]) => void;
    fetchData.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));

    type('Nephtalie CIMANA');
    await advance(50);
    leave();

    expect(field.meta.textNotPickedFromList).toBe('Nephtalie CIMANA');
    expect(fetchData).toHaveBeenLastCalledWith('Nephtalie CIMANA', { tag: 'initial' });

    await act(async () => answer([nephtalie]));

    expect(field.meta.textNotPickedFromList).toBeUndefined();
    expect(setFieldValueSpy).toHaveBeenLastCalledWith('nephtalie');
    expect(screen.getByRole('combobox')).toHaveValue(nephtalie.display);
  });

  it('puts the picked provider back once the late search finds nobody of that name', async () => {
    const { field } = await pickSebastien();
    let answer: (items: OpenmrsResource[]) => void;
    fetchData.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));

    type('zzqx');
    await advance(50);
    leave();
    expect(field.meta.textNotPickedFromList).toBe('zzqx');

    await act(async () => answer([]));
    await advance(0);

    expect(field.meta.textNotPickedFromList).toBeUndefined();
    expect(setFieldValueSpy).toHaveBeenLastCalledWith('sebastien');
    expect(screen.getByRole('combobox')).toHaveValue(sebastien.display);
  });

  it('drops the late answer when typing has resumed in the field', async () => {
    const { field } = await pickSebastien();
    let answer: (items: OpenmrsResource[]) => void;
    fetchData.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));

    type('Nephtalie CIMANA');
    await advance(50);
    leave();
    screen.getByRole('combobox').focus();
    type('Nephtalie CIMANA x');
    await advance(0);

    await act(async () => answer([nephtalie]));

    expect(setFieldValueSpy).not.toHaveBeenLastCalledWith('nephtalie');
    expect(field.meta.textNotPickedFromList).toBe('Nephtalie CIMANA');
  });

  it('shows the picked provider again when the field is left (by Tab) with text that names nobody', async () => {
    const { field } = await pickSebastien();
    fetchData.mockResolvedValueOnce([]);

    type('zzqx');
    await advance(300);
    leave();

    // The combobox does not put the picked entry back on Tab: the text left on screen was not what is saved.
    expect(screen.getByRole('combobox')).toHaveValue(sebastien.display);
    expect(field.meta.textNotPickedFromList).toBeUndefined();
    expect(setFieldValueSpy).toHaveBeenLastCalledWith('sebastien');
  });

  it('shows the provider of an edited encounter again when the field is left with text that names nobody', async () => {
    vi.mocked(datasource.fetchSingleItem).mockResolvedValue(sebastien);
    const { field } = await renderSearch('sebastien');
    fetchData.mockResolvedValueOnce([nephtalie]);

    type('Nephtalie');
    await advance(300);
    leave();

    expect(screen.getByRole('combobox')).toHaveValue(sebastien.display);
    expect(field.meta.textNotPickedFromList).toBeUndefined();
    expect(setFieldValueSpy).not.toHaveBeenCalled();
  });
});

describe('findItemsNamed (UVL-EMR #768)', () => {
  const items = [
    { uuid: 'a', identifier: 'nephtalie.cimana', display: 'nephtalie.cimana - Nephtalie CIMANA' },
    { uuid: 'b', display: 'Malaria' },
    { uuid: 'c', code: 'B54', display: 'Paludisme' },
    { uuid: 'd', display: 'Diabetes - type 2' },
  ];

  it.each([
    ['Nephtalie CIMANA', ['a']],
    ['nephtalie  cimana', ['a']],
    ['nephtalie.cimana', ['a']],
    ['nephtalie.cimana - Nephtalie CIMANA', ['a']],
    ['malaria', ['b']],
    ['B54 Paludisme', ['c']],
    ['Paludisme', ['c']],
    ['Nephtalie', []],
    ['type 2', []],
    ['', []],
  ])('« %s » names %j', (text, uuids) => {
    expect(findItemsNamed(items, text).map((item) => item.uuid)).toEqual(uuids);
  });

  it('names an entry once when it is listed twice', () => {
    expect(findItemsNamed([items[1], { ...items[1] }], 'Malaria')).toHaveLength(1);
  });
});
