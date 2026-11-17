import { useMemo } from 'react';
import useSWR from 'swr';
import { type Concept, type FetchResponse, openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';

// hiAbsolute and lowAbsolute are the numeric concept's limits the server enforces on save
// (ObsValidator); a concept that is not numeric simply has none.
const conceptRepresentation =
  'custom:(uuid,display,conceptClass:(uuid,display),answers:(uuid,display),conceptMappings:(conceptReferenceTerm:(conceptSource:(name),code)),hiAbsolute,lowAbsolute)';

type ConceptRepresentation = Pick<Concept, 'uuid' | 'display'> & {
  conceptClass: Pick<Concept['conceptClass'], 'uuid' | 'display'>;
  answers: Array<{
    uuid: string;
    display: string;
  }>;
  conceptMappings: Array<{
    conceptReferenceTerm: {
      conceptSource: {
        name: string;
      };
      code: string;
    };
  }>;
  hiAbsolute?: number | null;
  lowAbsolute?: number | null;
};

type ConceptFetchResponse = FetchResponse<{ [reference: string]: ConceptRepresentation }>;

export function useConcepts(references: Array<string>): {
  concepts: Array<ConceptRepresentation> | undefined;
  isLoading: boolean;
  error: Error | undefined;
} {
  const { data, error, isLoading } = useSWR<ConceptFetchResponse, Error>(
    [`${restBaseUrl}/conceptreferences?v=${conceptRepresentation}`, references],
    ([url, refs]) =>
      openmrsFetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          references: refs,
        },
        method: 'POST',
      }),
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    },
  );

  const concepts = useMemo(() => (data?.data ? Object.values(data.data) : undefined), [data]);

  return {
    concepts,
    isLoading,
    error,
  };
}
