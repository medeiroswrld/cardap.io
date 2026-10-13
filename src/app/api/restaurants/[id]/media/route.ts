import { z } from "zod";
import { requireMember, serviceClient } from "@/lib/supabase/server";
import { createVideoUpload, getVideoStatus } from "@/lib/cloudflare";
import { apiError, checkOrigin, noStore } from "@/lib/server-security";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const id = z.uuid().parse((await params).id);
    const { supabase } = await requireMember(id, true);
    const { productId } = z
      .object({ productId: z.uuid() })
      .parse(await request.json());
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("restaurant_id", id)
      .single();
    if (!product) throw new Error("FORBIDDEN");
    const upload = await createVideoUpload(id);
    const { data: asset, error } = await serviceClient()
      .from("product_media")
      .insert({
        restaurant_id: id,
        product_id: productId,
        provider_asset_id: upload.uid,
        state: "uploading",
        kind: "video",
      })
      .select("id")
      .single();
    if (error) throw error;
    return Response.json(
      { ...upload, assetId: asset.id },
      { headers: noStore },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(
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
    const { data: asset } = await supabase
      .from("product_media")
      .select("*")
      .eq("id", assetId)
      .eq("restaurant_id", id)
      .single();
    if (!asset?.provider_asset_id) throw new Error("FORBIDDEN");
    const remote = await getVideoStatus(asset.provider_asset_id);
    const state =
      remote.status.state === "error" || remote.duration > 45
        ? "failed"
        : remote.readyToStream
          ? "ready"
          : "processing";
    const { error } = await serviceClient()
      .from("product_media")
      .update({
        state,
        duration_seconds: remote.duration || null,
        playback_url: state === "ready" ? remote.playback?.hls : null,
      })
      .eq("id", assetId)
      .eq("restaurant_id", id);
    if (error) throw error;
    return Response.json({ state }, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}
