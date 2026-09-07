import { redirect } from "next/navigation";

// Historical diagnostic URL. It intentionally exposes no diagnostics in any environment.
export default function DisabledSupabaseDiagnosticPage() {
  redirect("/");
}
