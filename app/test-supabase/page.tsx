import { supabase } from "@/lib/supabase";

export default async function TestSupabasePage() {
  const { data, error } = await supabase
    .from("controls")
    .select("*")
    .limit(5);

  if (error) {
    return (
      <main style={{ padding: "40px", fontFamily: "Arial" }}>
        <h1>Supabase Connection Test</h1>
        <h2 style={{ color: "red" }}>Connection Error</h2>
        <pre>{error.message}</pre>
      </main>
    );
  }

  return (
    <main style={{ padding: "40px", fontFamily: "Arial" }}>
      <h1>Supabase Connection Test ✅</h1>

      <p>Records found: {data?.length ?? 0}</p>

      <pre
        style={{
          background: "#111",
          color: "#fff",
          padding: "20px",
          borderRadius: "10px",
          overflow: "auto",
        }}
      >
        {JSON.stringify(data, null, 2)}
      </pre>
    </main>
  );
}