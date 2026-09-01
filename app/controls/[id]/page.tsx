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

type Evidence = {
  id: number;
  control_id: number;

  evidence_name?: string | null;
  description?: string | null;
  file_name?: string | null;
  file_path?: string | null;
  file_url?: string | null;
  mime_type?: string | null;
  file_size?: number | null;

  status?: string | null;

  uploaded_by?: string | null;
  uploaded_at?: string | null;

  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;

  is_current?: boolean | null;

  created_at?: string | null;
  updated_at?: string | null;
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

  // Load control
  const { data: controlData, error: controlError } =
    await supabase
      .from("controls")
      .select("*")
      .eq("id", controlId)
      .single();

  if (controlError || !controlData) {
    notFound();
  }

  // Load evidence linked to this control
  const { data: evidenceData, error: evidenceError } =
    await supabase
      .from("evidence")
      .select("*")
      .eq("control_id", controlId);

  const control = controlData as Control;

  const evidence: Evidence[] =
    evidenceError || !evidenceData
      ? []
      : (evidenceData as Evidence[]);

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
        {/* Back */}
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

        {/* Control Header */}
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
                text={evidenceStatusLabel(
                  control.evidence_status
                )}
                type={evidenceStatusBadgeType(
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
              value={
                control.control_owner || "غير محدد"
              }
            />

            <Field
              label="مسؤول الدليل"
              value={
                control.evidence_owner || "غير محدد"
              }
            />

            <Field
              label="آخر مراجعة"
              value={
                control.last_review_date ||
                "لم تتم المراجعة"
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

        {/* Evidence Section */}
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
              marginBottom: "22px",
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
                الأدلة المرتبطة بهذا الضابط
              </p>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <span
                style={{
                  background: "#e8f5f2",
                  color: "#0f6f67",
                  padding: "7px 11px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: "bold",
                }}
              >
                {evidence.length} دليل
              </span>

              <button
                type="button"
                style={{
                  border: 0,
                  background: "#0f7d73",
                  color: "white",
                  padding: "10px 15px",
                  borderRadius: "9px",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                + رفع دليل
              </button>
            </div>
          </div>

          {evidenceError ? (
            <div
              style={{
                background: "#fff4e5",
                color: "#9a5700",
                borderRadius: "10px",
                padding: "16px",
              }}
            >
              تعذر تحميل الأدلة حاليًا:
              {" "}
              {evidenceError.message}
            </div>
          ) : evidence.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 20px",
                background: "#f8fafb",
                borderRadius: "12px",
                color: "#7a8794",
              }}
            >
              <div
                style={{
                  fontSize: "17px",
                  fontWeight: "bold",
                  color: "#44515c",
                  marginBottom: "8px",
                }}
              >
                لا توجد أدلة مرفوعة
              </div>

              <div
                style={{
                  fontSize: "14px",
                }}
              >
                سيتم عرض الأدلة المرتبطة بهذا الضابط هنا.
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "12px",
              }}
            >
              {evidence.map((item) => (
                <EvidenceRow
                  key={item.id}
                  evidence={item}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function EvidenceRow({
  evidence,
}: {
  evidence: Evidence;
}) {
  const title =
    evidence.evidence_name ||
    evidence.file_name ||
    `دليل رقم ${evidence.id}`;

  const status = evidence.status || "not_uploaded";

  return (
    <div
      style={{
        border: "1px solid #e5e9ec",
        borderRadius: "12px",
        padding: "17px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "15px",
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: "bold",
            color: "#26323d",
            marginBottom: "6px",
          }}
        >
          {title}
        </div>

        {evidence.description && (
          <div
            style={{
              color: "#7a8794",
              fontSize: "13px",
              marginBottom: "5px",
            }}
          >
            {evidence.description}
          </div>
        )}

        <div
          style={{
            color: "#8a959e",
            fontSize: "12px",
          }}
        >
          رقم السجل: {evidence.id}
        </div>
      </div>

      <EvidenceBadge status={status} />
    </div>
  );
}

function EvidenceBadge({
  status,
}: {
  status: string;
}) {
  const normalized = normalizeStatus(status);

  if (normalized === "accepted") {
    return (
      <Badge
        text="مقبول"
        type="success"
      />
    );
  }

  if (
    normalized === "pending_review" ||
    normalized === "under_review"
  ) {
    return (
      <Badge
        text="قيد المراجعة"
        type="info"
      />
    );
  }

  if (normalized === "rejected") {
    return (
      <Badge
        text="مرفوض"
        type="warning"
      />
    );
  }

  return (
    <Badge
      text="لم يرفع"
      type="neutral"
    />
  );
}

function normalizeStatus(status: string | null | undefined) {
  return (status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

function implementationLabel(status: string) {
  const value = normalizeStatus(status);

  switch (value) {
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

function evidenceStatusLabel(status: string) {
  const value = normalizeStatus(status);

  switch (value) {
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
  const value = normalizeStatus(status);

  switch (value) {
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
  const value = normalizeStatus(status);

  if (value === "implemented") {
    return "success";
  }

  if (value === "in_progress") {
    return "warning";
  }

  return "neutral";
}

function evidenceStatusBadgeType(
  status: string
): "success" | "warning" | "info" | "neutral" {
  const value = normalizeStatus(status);

  if (value === "accepted") {
    return "success";
  }

  if (value === "pending_review") {
    return "info";
  }

  if (value === "rejected") {
    return "warning";
  }

  return "neutral";
}

function verificationBadgeType(
  status: string
): "success" | "warning" | "info" | "neutral" {
  const value = normalizeStatus(status);

  if (value === "verified") {
    return "success";
  }

  if (value === "under_review") {
    return "info";
  }

  if (value === "failed") {
    return "warning";
  }

  return "neutral";
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