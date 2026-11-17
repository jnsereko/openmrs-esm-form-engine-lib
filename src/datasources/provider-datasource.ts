import { getConfig, openmrsFetch, restBaseUrl, type OpenmrsResource } from '@openmrs/esm-framework';
import { BaseOpenMRSDataSource } from './data-source';

/** Providers asked for per request: the REST default (50) silently cut the list short. */
const pageSize = 100;
const configTimeoutMs = 5000;

export class ProviderDataSource extends BaseOpenMRSDataSource {
  constructor() {
    super(null);
  }

  /**
   * Active providers whose name or identifier matches the search term, or every active provider without
   * one (read page by page). Providers whose identifier is listed in the form engine app's
   * `excludedProviderIdentifiers`, or in the field's datasource config `excludedIdentifiers`, are left out.
   */
  async fetchData(searchTerm: string, config?: Record<string, any>): Promise<any[]> {
    const url = `${restBaseUrl}/provider?v=custom:(uuid,display,identifier)&limit=${pageSize}`;
    const providers = searchTerm
      ? (await openmrsFetch(`${url}&q=${encodeURIComponent(searchTerm)}`)).data?.results ?? []
      : await fetchAllPages(url);
    const excluded = [...(await getExcludedIdentifiers()), ...(config?.excludedIdentifiers ?? [])];
    return providers.filter((provider) => !isExcluded(provider.identifier, excluded));
  }

  async fetchSingleItem(uuid: string): Promise<OpenmrsResource | null> {
    const { data } = await openmrsFetch(`${restBaseUrl}/provider/${uuid}?v=custom:(uuid,display)`);
    return data;
  }
}

async function fetchAllPages(url: string): Promise<any[]> {
  const providers = [];
  let hasNextPage = true;
  while (hasNextPage) {
    const { data } = await openmrsFetch(`${url}&startIndex=${providers.length}`);
    const results = data?.results ?? [];
    providers.push(...results);
    hasNextPage = results.length > 0 && Boolean(data?.links?.some((link) => link.rel === 'next'));
  }
  return providers;
}

async function getExcludedIdentifiers(): Promise<Array<string>> {
  try {
    // getConfig never settles for a module that is not registered (the library rendered by another app).
    const config = await Promise.race([
      getConfig('@openmrs/esm-form-engine-app'),
      new Promise<Record<string, any>>((_, reject) =>
        setTimeout(() => reject(new Error('config not loaded')), configTimeoutMs),
      ),
    ]);
    return config?.excludedProviderIdentifiers ?? [];
  } catch (error) {
    console.warn('Failed to load @openmrs/esm-form-engine-app config - no provider is excluded: ', error);
    return [];
  }
}

/** An entry matches an identifier exactly, or, when it ends with `*`, any identifier it starts. */
export function isExcluded(identifier: string, excluded: Array<string>): boolean {
  if (!identifier) {
    return false;
  }
  return excluded.some((entry) =>
    entry.endsWith('*') ? identifier.startsWith(entry.slice(0, -1)) : identifier === entry,
  );
}
