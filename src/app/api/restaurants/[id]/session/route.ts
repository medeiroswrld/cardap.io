import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";
import { apiError, checkOrigin, hash, noStore } from "@/lib/server-security";
import { z } from "zod";
import { cookies } from "next/headers";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const id = z.uuid().parse((await params).id);
    const client = serviceClient();
    const existing = (await cookies()).get(`guest_${id}`)?.value;
    if (existing) {
      const { data: session } = await client
        .from("guest_sessions")
        .select("id")
        .eq("restaurant_id", id)
        .eq("token_hash", hash(existing))
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (session) return NextResponse.json({ ok: true }, { headers: noStore });
    }
    const { data } = await client
      .from("restaurants")
      .select("id")
      .eq("id", id)
      .single();
    if (!data) throw new Error("NOT_FOUND");
    const token = randomBytes(32).toString("hex");
    const { error } = await client.from("guest_sessions").insert({
      restaurant_id: id,
      token_hash: hash(token),
      expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    });
    if (error) throw error;
    const response = NextResponse.json({ ok: true }, { headers: noStore });
    response.cookies.set(`guest_${id}`, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: `/api/restaurants/${id}`,
      maxAge: 43200,
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
