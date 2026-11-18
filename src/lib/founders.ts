import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { FOUNDER_SLOTS } from "@/lib/plans";

// Founder slots left, for the public pages. Any failure hides the offer (0).
export async function founderSlotsLeft() {
  try {
    const { data, error } = await serviceClient().rpc("founder_slots_left");
    if (error || typeof data !== "number") return 0;
    return Math.max(0, Math.min(FOUNDER_SLOTS, Math.floor(data)));
  } catch {
    return 0;
  }
}
