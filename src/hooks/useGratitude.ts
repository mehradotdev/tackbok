import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
} from '@tanstack/react-query';
import { getGratitudeLogs, saveGratitudeLog } from '~/database';
import { GratitudeLog } from '~/types';

export const useGratitudeLogs = (): UseQueryResult<GratitudeLog[], Error> => {
  return useQuery({
    queryKey: ['gratitude-logs'],
    queryFn: getGratitudeLogs,
  });
};

export const useSaveGratitudeLog = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ date, text }: { date: string; text: string }) =>
      saveGratitudeLog(date, text),
    onSuccess: () => {
      // Refresh the list automatically
      queryClient.invalidateQueries({ queryKey: ['gratitude-logs'] });
    },
  });
};
