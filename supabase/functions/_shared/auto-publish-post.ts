import { moderatePost } from "../moderate-post/index.ts";
import { isUuid } from "./post-publication.ts";

/** Publish only the submitting user's ordinary image through the existing atomic publication path. */
export async function publishOrdinaryPost(admin: any, postId: string, authorId: string) {
  if (!isUuid(postId) || !isUuid(authorId)) throw new Error("post_id_invalid");
  const readPost = async () => {
    const result = await admin.from("user_posts").select("id,author_id,status,post_kind")
      .eq("id", postId).maybeSingle();
    if (result.error || !result.data) throw new Error("post_publication_read_failed");
    if (result.data.author_id !== authorId || !["pixel_art", "pixel_camera"].includes(result.data.post_kind)) {
      throw new Error("post_publication_not_allowed");
    }
    return result.data;
  };
  const confirmPublished = async () => {
    const point = await admin.from("post_map_points").select("post_id,public_image_path")
      .eq("post_id", postId).maybeSingle();
    if (point.error || point.data?.post_id !== postId || !point.data.public_image_path) {
      throw new Error("post_publish_outcome_unknown");
    }
    return { postId, status: "published" };
  };
  const post = await readPost();
  // A request-key replay must never publish a rejected/hidden post, or approve a puzzle.
  if (!["pending", "published"].includes(post.status)) return { postId, status: post.status };
  const puzzle = await admin.from("user_post_puzzles").select("post_id")
    .eq("post_id", postId).maybeSingle();
  if (puzzle.error) throw new Error("puzzle_read_failed");
  if (puzzle.data) throw new Error("puzzle_review_required");
  if (post.status === "published") return await confirmPublished();
  try {
    return await moderatePost(admin, { postId, action: "approve", note: "" });
  } catch (error) {
    // Another retry may have won. moderatePost preserves committed images and removes
    // only its own unreferenced trial image when the outcome is known.
    const current = await readPost();
    if (current.status === "published") return await confirmPublished();
    if (["hidden", "rejected"].includes(current.status)) return { postId, status: current.status };
    throw error;
  }
}
