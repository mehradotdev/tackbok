let openViewers = 0;

/** Counts a photo viewer while it is up; call the returned function when it closes. */
export function trackPhotoViewer(): () => void {
  openViewers += 1;
  return () => {
    openViewers -= 1;
  };
}

/** Whether a photo viewer is up, which Home's one-off sheets wait out. */
export const photoViewerShowing = () => openViewers > 0;
