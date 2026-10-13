import "server-only";
import { getVideoStatus } from "./cloudflare";
import { serviceClient } from "./supabase/server";

export async function syncVideoAsset(
  restaurantId: string,
  asset: { id: string; provider_asset_id: string },
) {
  const remote = await getVideoStatus(asset.provider_asset_id);
  const failed = remote.status.state === "error" || remote.duration > 45;
  const ready =
    remote.readyToStream &&
    Boolean(remote.playback?.hls) &&
    remote.duration > 0;
  const state = failed ? "failed" : ready ? "ready" : "processing";
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
  return changes;
}
