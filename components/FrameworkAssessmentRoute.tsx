"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import AssessmentWorkspace from "@/components/AssessmentWorkspace";
import FrameworkWorkspaceShell from "@/components/FrameworkWorkspaceShell";

type FrameworkIdentity = { code: string; name_ar: string; version: string };
const assessmentRoles: UserRole[] = ["admin", "cybersecurity_team", "control_owner", "nca_external_auditor"];

export default function FrameworkAssessmentRoute({ frameworkCode }: { frameworkCode: string }) {
  return <Suspense fallback={<main className="workflow-page" dir="rtl" role="status">جاري تحميل مساحة الإطار…</main>}>
    <FrameworkAssessmentContent frameworkCode={frameworkCode} />
  </Suspense>;
}

function FrameworkAssessmentContent({ frameworkCode }: { frameworkCode: string }) {
  const router = useRouter();
  const [identity, setIdentity] = useState<{ framework: FrameworkIdentity; role: UserRole } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { profile } = await requireProfile(assessmentRoles);
        const result = await supabase.from("frameworks").select("code,name_ar,version").eq("code", frameworkCode).single();
        if (result.error) throw result.error;
        if (active) setIdentity({ framework: result.data as FrameworkIdentity, role: profile.role });
      } catch (cause) {
        if (!active) return;
        const message = cause instanceof Error ? cause.message : "تعذر تحميل مساحة الإطار.";
        if (message.includes("تسجيل الدخول")) router.replace("/login");
        else setError(message);
      }
    })();
    return () => { active = false; };
  }, [frameworkCode, router]);

  if (error) return <main className="workflow-page" dir="rtl" role="alert">{error}</main>;
  if (!identity) return <main className="workflow-page" dir="rtl" role="status">جاري تحميل مساحة الإطار…</main>;

  return <main className="workflow-page workspace-page ae-page" dir="rtl">
    <FrameworkWorkspaceShell
      code={identity.framework.code}
      name={identity.framework.name_ar}
      version={identity.framework.version}
      activeSection="assessment"
      role={identity.role}
    >
      <AssessmentWorkspace frameworkCode={frameworkCode} />
    </FrameworkWorkspaceShell>
  </main>;
}
