import React, { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MAX_PHOTOS_PER_ENTRY } from '~/constants';
import { AssetType } from '~/types';
import { usePhotoSession } from './usePhotoSession';

const mockWarning = jest.fn();
jest.mock('~/components/ui/toast', () => ({
  toast: { warning: (message: string) => mockWarning(message), error: jest.fn() },
}));
jest.mock('~/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('~/lib/photoUtils', () => {
  const { MAX_PHOTOS_PER_ENTRY: max } = jest.requireActual('~/constants');
  return {
    compressAndSavePhoto: async (uri: string) => ({ type: 'IMAGE', uri: `saved-${uri}` }),
    deletePhotoFile: jest.fn(),
    takeUrisWithinCapacity: (uris: string[], current: number, pending: number) =>
      uris.slice(0, Math.max(0, max - current - pending)),
  };
});

const latest: { session?: ReturnType<typeof usePhotoSession> } = {};
const keepSession = (value: ReturnType<typeof usePhotoSession>) => {
  latest.session = value;
};
function Probe({
  reserved,
  onSession,
}: {
  reserved: number;
  onSession: typeof keepSession;
}) {
  const current = usePhotoSession(
    [{ type: AssetType.IMAGE, uri: 'photos/visible.jpg' }],
    reserved,
  );
  useEffect(() => onSession(current));
  return null;
}

let root: ReactTestRenderer;
afterEach(() => act(() => root.unmount()));

test('photos still downloading use up the per-entry capacity of pasted images', async () => {
  // One visible photo plus all but one slot held by downloading photos.
  await act(async () => {
    root = create(<Probe reserved={MAX_PHOTOS_PER_ENTRY - 2} onSession={keepSession} />);
  });
  await act(async () => {
    await latest.session!.handlePhotosPicked({
      status: 'success',
      uris: ['a', 'b', 'c'],
    });
  });
  expect(latest.session!.photos.map((photo) => photo.uri)).toEqual([
    'photos/visible.jpg',
    'saved-a',
  ]);

  await act(async () => {
    await latest.session!.handlePhotosPicked({ status: 'success', uris: ['d'] });
  });
  expect(latest.session!.photos).toHaveLength(2);
  expect(mockWarning).toHaveBeenCalledWith('entry.maximumCountPhotosPerEntry');
});
