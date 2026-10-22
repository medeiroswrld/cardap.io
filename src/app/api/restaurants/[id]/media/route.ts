import { withRequestLogging } from "@/lib/observability/logger";
import { z } from "zod";
import { requireMember, serviceClient } from "@/lib/supabase/server";
import { syncVideoAsset } from "@/lib/sync-video";
import {
  VIDEO_BUCKET,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SECONDS,
  VIDEO_TYPES,
  STORAGE_VIDEO_PREFIX,
} from "@/lib/video-config";
import { apiError, checkOrigin, noStore } from "@/lib/server-security";
async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const id = z.uuid().parse((await params).id);
    const { supabase } = await requireMember(id, true);
    const { productId, contentType, duration } = z
      .object({
        productId: z.uuid(),
        contentType: z.enum(VIDEO_TYPES),
        size: z.number().int().positive().max(VIDEO_MAX_BYTES),
        duration: z.number().positive().max(VIDEO_MAX_SECONDS),
      })
      .parse(await request.json());
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("restaurant_id", id)
      .single();
    if (productError && productError.code !== "PGRST116") throw productError;
    if (!product) throw new Error("FORBIDDEN");
    const service = serviceClient();
    const assetId = crypto.randomUUID();
    const path = `${id}/${productId}/${assetId}.${contentType === "video/mp4" ? "mp4" : "webm"}`;
    const { data: upload, error: uploadError } = await service.storage
      .from(VIDEO_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (uploadError || !upload) throw new Error("VIDEO_STORAGE_UNAVAILABLE");
    const { data: asset, error } = await service
      .from("product_media")
      .insert({
        id: assetId,
        restaurant_id: id,
        product_id: productId,
        provider_asset_id: STORAGE_VIDEO_PREFIX + path,
        duration_seconds: duration,
        state: "uploading",
        kind: "video",
      })
      .select("id")
      .single();
    if (error) throw error;
    return Response.json(
      { provider: "supabase", path, token: upload.token, assetId: asset.id },
      { headers: noStore },
    );
  } catch (error) {
    return apiError(error);
  }
}
async function handlePATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const id = z.uuid().parse((await params).id);
    const { supabase } = await requireMember(id, true);
    const { assetId } = z
      .object({ assetId: z.uuid() })
      .parse(await request.json());
    const { data: asset, error: assetError } = await supabase
      .from("product_media")
      .select("*")
      .eq("id", assetId)
      .eq("restaurant_id", id)
      .single();
    if (assetError && assetError.code !== "PGRST116") throw assetError;
    if (!asset?.provider_asset_id) throw new Error("FORBIDDEN");
    const { state } = await syncVideoAsset(id, asset);
    return Response.json({ state }, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const POST = withRequestLogging(
  "/api/restaurants/[id]/media",
  handlePOST,
);

export const PATCH = withRequestLogging(
  "/api/restaurants/[id]/media",
  handlePATCH,
);
