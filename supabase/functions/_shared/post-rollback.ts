/** Keep a private image when its post row could still reference it. */
export async function rollbackFailedLocation(
  deletePost: () => Promise<boolean>,
  removeImage: () => Promise<boolean>,
): Promise<{ postRemoved: boolean; imageRemoved: boolean }> {
  let postRemoved = false;
  try {
    postRemoved = await deletePost();
  } catch { /* Keep the image for recovery. */ }
  if (!postRemoved) return { postRemoved: false, imageRemoved: false };
  let imageRemoved = false;
  try {
    imageRemoved = await removeImage();
  } catch { /* Private orphan can be cleaned up later. */ }
  return { postRemoved: true, imageRemoved };
}
