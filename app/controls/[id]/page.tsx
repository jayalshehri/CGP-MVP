import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Control = {
  id: number;
  framework_id: number;
  control_code: string;
  title_ar: string;
  description_ar: string | null;
  domain_ar: string;
  implementation_status: string;
  evidence_status: string;
  verification_status: string;
  due_date: string | null;
  last_review_date: string | null;
  control_owner: string | null;
  evidence_owner: string | null;
  implementation_notes: string | null;
};

export default async function ControlDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const controlId = Number(id);

  if (!Number.isInteger(controlId)) {
    notFound();
  }

  const { data, error } = await supabase
    .from("controls")
    .select("*")
    .eq("id", controlId)
    .single();

  if (error || !data) {
    notFound();
  }

  const control = data as Control;

  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100vh",
        background: "#f5f7f9",
        fontFamily: "Arial, sans-serif",
        color: "#0b1f33",
      }}
    >
      {/* Header */}
      <header
        style={{
          height: "86px",
          background: "#0b1f33",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 38px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: "bold",
            }}
          >
            Cyber Governance Platform
          </div>

          <div
            style={{
              fontSize: "13px",
              opacity: 0.7,
              marginTop: "5px",
            }}
          >
            منصة حوكمة الأمن السيبراني
          </div>
        </div>

        <div style={{ fontSize: "14px" }}>
          دورة التقييم: 2026
        </div>
      </header>

      <div
        style={{
          maxWidth: "1250px",
          margin: "0 auto",
          padding: "38px 30px 60px",
        }}
      >
        {/* Navigation */}
        <div style={{ marginBottom: "25px" }}>
          <Link
            href="/controls"
            style={{
              color: "#0f7d73",
              textDecoration: "none",
              fontWeight: "bold",
            }}
          >
            ← العودة إلى الضوابط
          </Link>
        </div>

        {/* Control Heading */}
        <div
          style={{
            background: "white",
            border: "1px solid #e2e7eb",
            borderRadius: "16px",
            padding: "28px",
            marginBottom: "22px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "20px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  color: "#0f7d73",
                  fontSize: "14px",
                  fontWeight: "bold",
                  marginBottom: "8px",
                }}
              >
                {control.control_code}
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: "30px",
                  lineHeight: 1.5,
                }}
              >
                {control.title_ar}
              </h1>

              <div
                style={{
                  marginTop: "12px",
                  color: "#687581",
                }}
              >
                {control.domain_ar}
              </div>
            </div>

            <Badge
              text={implementationLabel(
                control.implementation_status
              )}
              type={implementationBadgeType(
                control.implementation_status
              )}
            />
          </div>

          {control.description_ar && (
            <div
              style={{
                marginTop: "24px",
                paddingTop: "22px",
                borderTop: "1px solid #edf0f2",
                color: "#4c5964",
                lineHeight: 1.9,
              }}
            >
              {control.description_ar}
            </div>
          )}
        </div>

        {/* Status Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(210px, 1fr))",
            gap: "16px",
            marginBottom: "22px",
          }}
        >
          <InfoCard
            title="حالة التنفيذ"
            content={
              <Badge
                text={implementationLabel(
                  control.implementation_status
                )}
                type={implementationBadgeType(
                  control.implementation_status
                )}
              />
            }
          />

          <InfoCard
            title="حالة الدليل"
            content={
              <Badge
                text={evidenceLabel(control.evidence_status)}
                type={evidenceBadgeType(
                  control.evidence_status
                )}
              />
            }
          />

          <InfoCard
            title="حالة التحقق"
            content={
              <Badge
                text={verificationLabel(
                  control.verification_status
                )}
                type={verificationBadgeType(
                  control.verification_status
                )}
              />
            }
          />

          <InfoCard
            title="تاريخ الاستحقاق"
            content={control.due_date || "غير محدد"}
          />
        </div>

        {/* Ownership */}
        <div
          style={{
            background: "white",
            border: "1px solid #e2e7eb",
            borderRadius: "16px",
            padding: "26px",
            marginBottom: "22px",
          }}
        >
          <h2
            style={{
              margin: "0 0 22px",
              fontSize: "20px",
            }}
          >
            المسؤوليات
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "25px",
            }}
          >
            <Field
              label="مالك الضابط"
              value={control.control_owner || "غير محدد"}
            />

            <Field
              label="مسؤول الدليل"
              value={control.evidence_owner || "غير محدد"}
            />

            <Field
              label="آخر مراجعة"
              value={
                control.last_review_date || "لم تتم المراجعة"
              }
            />
          </div>
        </div>

        {/* Implementation Notes */}
        <div
          style={{
            background: "white",
            border: "1px solid #e2e7eb",
            borderRadius: "16px",
            padding: "26px",
            marginBottom: "22px",
          }}
        >
          <h2
            style={{
              margin: "0 0 16px",
              fontSize: "20px",
            }}
          >
            ملاحظات التنفيذ
          </h2>

          <div
            style={{
              background: "#f8fafb",
              borderRadius: "10px",
              padding: "18px",
              color: "#56636f",
              lineHeight: 1.8,
              minHeight: "65px",
            }}
          >
            {control.implementation_notes ||
              "لا توجد ملاحظات تنفيذ مسجلة حاليًا."}
          </div>
        </div>

        {/* Evidence */}
        <div
          style={{
            background: "white",
            border: "1px solid #e2e7eb",
            borderRadius: "16px",
            padding: "26px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "15px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "20px",
                }}
              >
                الأدلة
              </h2>

              <p
                style={{
                  margin: "8px 0 0",
                  color: "#7a8794",
                  fontSize: "14px",
                }}
              >
                سيتم ربط مستودع الأدلة بهذا الضابط في
                المرحلة التالية.
              </p>
            </div>

            <Badge
              text={evidenceLabel(control.evidence_status)}
              type={evidenceBadgeType(
                control.evidence_status
              )}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

function implementationLabel(status: string) {
  switch (status.toLowerCase()) {
    case "implemented":
      return "مطبق";
    case "in_progress":
      return "قيد التنفيذ";
    case "not_applicable":
      return "غير منطبق";
    default:
      return "لم يبدأ";
  }
}

function evidenceLabel(status: string) {
  switch (status.toLowerCase()) {
    case "accepted":
      return "مقبول";
    case "pending_review":
      return "قيد المراجعة";
    case "rejected":
      return "مرفوض";
    default:
      return "لم يرفع";
  }
}

function verificationLabel(status: string) {
  switch (status.toLowerCase()) {
    case "verified":
      return "تم التحقق";
    case "under_review":
      return "قيد التحقق";
    case "failed":
      return "لم يجتز";
    default:
      return "غير متحقق";
  }
}

function implementationBadgeType(
  status: string
): "success" | "warning" | "info" | "neutral" {
  switch (status.toLowerCase()) {
    case "implemented":
      return "success";
    case "in_progress":
      return "warning";
    default:
      return "neutral";
  }
}

function evidenceBadgeType(
  status: string
): "success" | "warning" | "info" | "neutral" {
  switch (status.toLowerCase()) {
    case "accepted":
      return "success";
    case "pending_review":
      return "info";
    case "rejected":
      return "warning";
    default:
      return "neutral";
  }
}

function verificationBadgeType(
  status: string
): "success" | "warning" | "info" | "neutral" {
  switch (status.toLowerCase()) {
    case "verified":
      return "success";
    case "under_review":
      return "info";
    case "failed":
      return "warning";
    default:
      return "neutral";
  }
}

function InfoCard({
  title,
  content,
}: {
  title: string;
  content: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e2e7eb",
        borderRadius: "14px",
        padding: "20px",
      }}
    >
      <div
        style={{
          color: "#7a8794",
          fontSize: "13px",
          marginBottom: "12px",
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontWeight: "bold",
          color: "#26323d",
        }}
      >
        {content}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div
        style={{
          color: "#7a8794",
          fontSize: "13px",
          marginBottom: "8px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontWeight: "bold",
          color: "#26323d",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Badge({
  text,
  type,
}: {
  text: string;
  type: "success" | "warning" | "info" | "neutral";
}) {
  const styles = {
    success: {
      color: "#0f6f67",
      background: "#e8f5f2",
    },
    warning: {
      color: "#b76500",
      background: "#fff4e5",
    },
    info: {
      color: "#2563eb",
      background: "#eaf2ff",
    },
    neutral: {
      color: "#5f6b76",
      background: "#eef1f3",
    },
  };

  return (
    <span
      style={{
        display: "inline-block",
        padding: "7px 11px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: "bold",
        whiteSpace: "nowrap",
        ...styles[type],
      }}
    >
      {text}
    </span>
  );
}