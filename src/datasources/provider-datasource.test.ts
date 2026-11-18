import { vi, it, describe, beforeEach, expect } from 'vitest';
import { getConfig, openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import { isExcluded, ProviderDataSource } from './provider-datasource';

const mockOpenmrsFetch = vi.mocked(openmrsFetch);
const mockGetConfig = vi.mocked(getConfig);

const providersUrl = `${restBaseUrl}/provider?v=custom:(uuid,display,identifier)&limit=100`;

describe('ProviderDataSource', () => {
  let ds: ProviderDataSource;

  beforeEach(() => {
    ds = new ProviderDataSource();
    mockGetConfig.mockResolvedValue({ excludedProviderIdentifiers: [] });
  });

  describe('fetchSingleItem', () => {
    it('fetches a single provider by UUID at the correct endpoint', async () => {
      const uuid = 'provider-uuid-1';
      const mockProvider = { uuid, display: 'Dr. Test' };
      mockOpenmrsFetch.mockResolvedValueOnce({ data: mockProvider } as any);

      const result = await ds.fetchSingleItem(uuid);

      expect(mockOpenmrsFetch).toHaveBeenCalledWith(`${restBaseUrl}/provider/${uuid}?v=custom:(uuid,display)`);
      expect(result).toEqual(mockProvider);
    });
  });

  describe('fetchData', () => {
    it('fetches all providers when no search term is given', async () => {
      const mockProviders = [
        { uuid: 'uuid-1', display: 'Provider 1' },
        { uuid: 'uuid-2', display: 'Provider 2' },
      ];
      mockOpenmrsFetch.mockResolvedValueOnce({ data: { results: mockProviders } } as any);

      const result = await ds.fetchData(null);

      expect(mockOpenmrsFetch).toHaveBeenCalledTimes(1);
      expect(mockOpenmrsFetch).toHaveBeenCalledWith(`${providersUrl}&startIndex=0`);
      expect(result).toEqual(mockProviders);
    });

    it('reads every page when there are more providers than one page holds', async () => {
      const page = (from: number, count: number) =>
        Array.from({ length: count }, (_, i) => ({ uuid: `uuid-${from + i}`, display: `Provider ${from + i}` }));
      mockOpenmrsFetch
        .mockResolvedValueOnce({ data: { results: page(0, 100), links: [{ rel: 'next', uri: 'next' }] } } as any)
        .mockResolvedValueOnce({ data: { results: page(100, 4), links: [{ rel: 'prev', uri: 'prev' }] } } as any);

      const result = await ds.fetchData(null);

      expect(mockOpenmrsFetch).toHaveBeenNthCalledWith(1, `${providersUrl}&startIndex=0`);
      expect(mockOpenmrsFetch).toHaveBeenNthCalledWith(2, `${providersUrl}&startIndex=100`);
      expect(result).toHaveLength(104);
      expect(result[103]).toEqual({ uuid: 'uuid-103', display: 'Provider 103' });
    });

    it('searches the server with the search term, encoded', async () => {
      mockOpenmrsFetch.mockResolvedValueOnce({ data: { results: [] } } as any);

      await ds.fetchData('Sébastien N');

      expect(mockOpenmrsFetch).toHaveBeenCalledWith(`${providersUrl}&q=S%C3%A9bastien%20N`);
    });

    it('leaves out the providers excluded by the app config and by the field config', async () => {
      mockGetConfig.mockResolvedValue({ excludedProviderIdentifiers: ['admin', 'service-account-*'] });
      mockOpenmrsFetch.mockResolvedValueOnce({
        data: {
          results: [
            { uuid: 'uuid-1', display: 'admin - Super User', identifier: 'admin' },
            { uuid: 'uuid-2', display: 'service-account-eip - eip app', identifier: 'service-account-eip' },
            { uuid: 'uuid-3', display: 'nurse.one - Nurse One', identifier: 'nurse.one' },
            { uuid: 'uuid-4', display: 'test.user - Test User', identifier: 'test.user' },
          ],
        },
      } as any);

      const result = await ds.fetchData('e', { excludedIdentifiers: ['test.user'] });

      expect(result.map((provider) => provider.uuid)).toEqual(['uuid-3']);
    });

    it('offers a provider again once the app config no longer lists it: nothing is excluded by default', async () => {
      const results = [
        { uuid: 'uuid-1', display: 'admin - Super User', identifier: 'admin' },
        { uuid: 'uuid-2', display: 'service-account-eip - eip app', identifier: 'service-account-eip' },
      ];
      mockOpenmrsFetch.mockResolvedValue({ data: { results } } as any);

      mockGetConfig.mockResolvedValue({ excludedProviderIdentifiers: ['admin', 'service-account-*'] });
      expect(await ds.fetchData('a')).toEqual([]);

      mockGetConfig.mockResolvedValue({ excludedProviderIdentifiers: ['service-account-*'] });
      expect((await ds.fetchData('a')).map((provider) => provider.identifier)).toEqual(['admin']);

      mockGetConfig.mockResolvedValue({ excludedProviderIdentifiers: [] });
      expect((await ds.fetchData('a')).map((provider) => provider.identifier)).toEqual([
        'admin',
        'service-account-eip',
      ]);
      expect(mockGetConfig).toHaveBeenCalledWith('@openmrs/esm-form-engine-app');
    });

    it('excludes nobody when the app config cannot be read', async () => {
      mockGetConfig.mockRejectedValue(new Error('no config'));
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockOpenmrsFetch.mockResolvedValueOnce({
        data: { results: [{ uuid: 'uuid-1', display: 'admin - Super User', identifier: 'admin' }] },
      } as any);

      const result = await ds.fetchData('admin');

      expect(result).toHaveLength(1);
    });
  });

  it('excludes nobody when the app config never loads', async () => {
    vi.useFakeTimers();
    mockGetConfig.mockReturnValue(new Promise(() => {}));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockOpenmrsFetch.mockResolvedValueOnce({
      data: { results: [{ uuid: 'uuid-1', display: 'admin - Super User', identifier: 'admin' }] },
    } as any);

    const result = ds.fetchData('admin');
    await vi.advanceTimersByTimeAsync(5000);

    expect(await result).toHaveLength(1);
    vi.useRealTimers();
  });

  describe('isExcluded', () => {
    it('matches an identifier exactly, or by prefix for an entry ending with *', () => {
      expect(isExcluded('admin', ['admin'])).toBe(true);
      expect(isExcluded('administrator', ['admin'])).toBe(false);
      expect(isExcluded('service-account-orthanc-service', ['service-account-*'])).toBe(true);
      expect(isExcluded('nurse.one', ['service-account-*'])).toBe(false);
      expect(isExcluded(undefined, ['*'])).toBe(false);
    });
  });
});
