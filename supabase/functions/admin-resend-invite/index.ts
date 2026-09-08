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
      global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    const { data: profile } = await caller.from("profiles").select("role,is_active").eq("user_id", userData.user.id).maybeSingle();
    if (!profile || profile.role !== "admin" || profile.is_active === false) {
      return Response.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
    }
    const { user_id: userId } = await req.json();
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: getError } = await admin.auth.admin.getUserById(String(userId));
    if (getError || !user?.email) return Response.json({ error: "User not found" }, { status: 404, headers: corsHeaders });
    const type = user.email_confirmed_at ? "recovery" : "invite";
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type, email: user.email, options: { redirectTo: `${allowedOrigin}/activate` },
    } as Parameters<typeof admin.auth.admin.generateLink>[0]);
    if (linkError || !link.properties?.action_link) {
      return Response.json({ error: linkError?.message || "Unable to generate activation link" }, { status: 400, headers: corsHeaders });
    }
    return Response.json({ ok: true, action_link: link.properties.action_link, email: user.email, type }, { headers: corsHeaders });
  } catch {
    return Response.json({ error: "Unexpected error" }, { status: 500, headers: corsHeaders });
  }
});
