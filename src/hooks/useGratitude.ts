import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
} from '@tanstack/react-query';
import {
  getGratitudeLogs,
  saveGratitudeLog,
  searchGratitudeLogs,
  deleteAllData,
} from '~/database';
import { IGratitudeDBLog } from '~/types';
import { importFromCSV } from '~/lib/backup';

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

export const useDeleteAllData = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteAllData,
    onSuccess: () => {
      // Refresh the list and search results automatically
      queryClient.invalidateQueries({ queryKey: ['gratitude-logs'] });
      queryClient.invalidateQueries({ queryKey: ['gratitude-logs-search'] });
    },
  });
};

export const useImportFromCSV = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (uri: string) => importFromCSV(uri),
    onSuccess: () => {
      // Refresh the list and search results automatically
      queryClient.invalidateQueries({ queryKey: ['gratitude-logs'] });
      queryClient.invalidateQueries({ queryKey: ['gratitude-logs-search'] });
    },
  });
};
