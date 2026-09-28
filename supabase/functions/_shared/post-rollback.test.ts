import { rollbackFailedLocation } from "./post-rollback.ts";

Deno.test("location rollback removes the private image only after its post row is gone", async () => {
  let imageRemovals = 0;
  const failedDelete = await rollbackFailedLocation(
    async () => false,
    async () => {
      imageRemovals += 1;
      return true;
    },
  );
  if (
    failedDelete.postRemoved || failedDelete.imageRemoved || imageRemovals !== 0
  ) {
    throw new Error("a referenced private image was removed");
  }
  const throwingDelete = await rollbackFailedLocation(
    async () => {
      throw new Error("network error");
    },
    async () => {
      imageRemovals += 1;
      return true;
    },
  );
  if (
    throwingDelete.postRemoved || throwingDelete.imageRemoved ||
    imageRemovals !== 0
  ) {
    throw new Error("delete failure must retain the private image");
  }
  const deleted = await rollbackFailedLocation(
    async () => true,
    async () => {
      imageRemovals += 1;
      return true;
    },
  );
  if (
    !deleted.postRemoved || !deleted.imageRemoved || Number(imageRemovals) !== 1
  ) {
    throw new Error("success must remove both the post row and image");
  }
  const imageFailure = await rollbackFailedLocation(
    async () => true,
    async () => {
      throw new Error("storage error");
    },
  );
  if (!imageFailure.postRemoved || imageFailure.imageRemoved) {
    throw new Error("private image cleanup failure must be reported");
  }
});
