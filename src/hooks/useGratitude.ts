import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
} from '@tanstack/react-query';
import { getGratitudeLogs, saveGratitudeLog, searchGratitudeLogs } from '~/database';
import { IGratitudeDBLog } from '~/types';

export const useGratitudeLogs = (): UseQueryResult<IGratitudeDBLog[], Error> => {
  return useQuery({
    queryKey: ['gratitude-logs'],
    queryFn: getGratitudeLogs,
  });
};

export const useSearchGratitudeLogs = (
  searchTerm: string,
): UseQueryResult<IGratitudeDBLog[], Error> => {
  return useQuery({
    queryKey: ['gratitude-logs-search', searchTerm],
    queryFn: () => searchGratitudeLogs(searchTerm),
    enabled: searchTerm.trim().length > 0,
  });
};

export const useSaveGratitudeLog = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ date, text }: { date: string; text: string }) =>
      saveGratitudeLog(date, text),
    onSuccess: () => {
      // Refresh the list and search results automatically
      queryClient.invalidateQueries({ queryKey: ['gratitude-logs'] });
      queryClient.invalidateQueries({ queryKey: ['gratitude-logs-search'] });
    },
  });
};
