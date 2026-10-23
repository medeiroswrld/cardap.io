import "server-only";
import { logger } from "./observability/logger";
import { getVideoStatus } from "./cloudflare";
import { invalidateCatalog } from "./catalog-cache";
import { serviceClient } from "./supabase/server";
import {
  STORAGE_VIDEO_PREFIX,
  VIDEO_BUCKET,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SECONDS,
  VIDEO_TYPES,
} from "./video-config";

export async function syncVideoAsset(
  restaurantId: string,
  asset: {
    id: string;
    provider_asset_id: string;
    product_id?: string;
    duration_seconds?: number | null;
  },
) {
  if (asset.provider_asset_id.startsWith(STORAGE_VIDEO_PREFIX)) {
    const path = asset.provider_asset_id.slice(STORAGE_VIDEO_PREFIX.length);
    // Only the path issued for this exact restaurant/product/asset is accepted.
    const expected = `${restaurantId}/${asset.product_id}/${asset.id}.`;
    if (![expected + "mp4", expected + "webm"].includes(path))
      throw new Error("FORBIDDEN");
    const service = serviceClient();
    const storage = service.storage.from(VIDEO_BUCKET);
    const { data: file, error } = await storage.info(path);
    if (error && String(error.statusCode) !== "404")
      throw new Error("VIDEO_STORAGE_UNAVAILABLE");
    if (!file) throw new Error("VIDEO_UPLOAD_INCOMPLETE");
    const duration = Number(asset.duration_seconds);
    const valid =
      Number(file.size) > 0 &&
      Number(file.size) <= VIDEO_MAX_BYTES &&
      VIDEO_TYPES.includes(file.contentType as (typeof VIDEO_TYPES)[number]) &&
      duration > 0 &&
      duration <= VIDEO_MAX_SECONDS;
    if (!valid)
      logger.warn("video.rejected", {
        operation: "supabase.storage",
        errorCode: "INVALID_VIDEO",
      });
    const changes = {
      state: valid ? "ready" : "failed",
      playback_url: valid ? storage.getPublicUrl(path).data.publicUrl : null,
      duration_seconds: valid ? duration : null,
    };
    const result = await service
      .from("product_media")
      .update(changes)
      .eq("id", asset.id)
      .eq("restaurant_id", restaurantId);
    if (result.error) throw result.error;
    if (changes.state === "ready")
      await invalidateCatalog(service, restaurantId);
    return changes;
  }
  const remote = await getVideoStatus(asset.provider_asset_id);
  const failed = remote.status.state === "error" || remote.duration > 45;
  const ready =
    remote.readyToStream &&
    Boolean(remote.playback?.hls) &&
    remote.duration > 0;
  const state = failed ? "failed" : ready ? "ready" : "processing";
  if (failed)
    logger.warn("video.rejected", {
      operation: "cloudflare.status",
      errorCode: "INVALID_VIDEO",
    });
  const changes = {
    state,
    duration_seconds: remote.duration || null,
    playback_url: state === "ready" ? remote.playback!.hls : null,
  };
  const { error } = await serviceClient()
    .from("product_media")
    .update(changes)
    .eq("id", asset.id)
    .eq("restaurant_id", restaurantId);
  if (error) throw error;
  if (changes.state === "ready")
    await invalidateCatalog(serviceClient(), restaurantId);
  return changes;
}
