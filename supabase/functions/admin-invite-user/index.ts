import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const allowedOrigin = Deno.env.get("CGP_APP_ORIGIN") ?? "https://cgp-mvp-grc13.vercel.app";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Vary": "Origin",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    const { data: profile } = await caller.from("profiles").select("role,is_active").eq("user_id", userData.user.id).maybeSingle();
    if (!profile || profile.role !== "admin" || profile.is_active === false) {
      return Response.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
    }
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.full_name ?? "").trim();
    const role = String(body.role ?? "control_owner");
    if (!email || !email.includes("@")) return Response.json({ error: "Invalid email" }, { status: 400, headers: corsHeaders });
    if (!["admin", "cybersecurity_team", "control_owner"].includes(role)) {
      return Response.json({ error: "Invalid role" }, { status: 400, headers: corsHeaders });
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const redirectTo = `${allowedOrigin}/activate`;
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName }, redirectTo });
    if (inviteError || !invited.user) return Response.json({ error: inviteError?.message ?? "Invite failed" }, { status: 400, headers: corsHeaders });
    const { error: upsertError } = await admin.from("profiles").upsert({
      user_id: invited.user.id, display_name: fullName || email, role, is_active: true, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (upsertError) return Response.json({ error: upsertError.message }, { status: 500, headers: corsHeaders });
    return Response.json({ ok: true, user_id: invited.user.id }, { headers: corsHeaders });
  } catch {
    return Response.json({ error: "Unexpected error" }, { status: 500, headers: corsHeaders });
  }
});
