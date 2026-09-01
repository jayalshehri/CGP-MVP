import Link from "next/link";
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

const menuItems = [
  { name: "لوحة المتابعة", href: "/" },
  { name: "الضوابط", href: "/controls" },
  { name: "التكليفات", href: "#" },
  { name: "الأدلة", href: "#" },
  { name: "التقييم والتحقق", href: "#" },
  { name: "التقارير", href: "#" },
  { name: "الإعدادات", href: "#" },
];

export default async function ControlsPage() {
  const { data, error } = await supabase
    .from("controls")
    .select("*")
    .order("id", { ascending: true });

  const controls: Control[] = data ?? [];

  if (error) {
    return (
      <main
        dir="rtl"
        style={{
          padding: "40px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <h1>تعذر تحميل الضوابط</h1>

        <p style={{ color: "#b42318" }}>
          {error.message}
        </p>

        <Link href="/">العودة إلى لوحة المتابعة</Link>
      </main>
    );
  }

  const implementedCount = controls.filter(
    (control) => control.implementation_status === "implemented"
  ).length;

  const inProgressCount = controls.filter(
    (control) => control.implementation_status === "in_progress"
  ).length;

  const notStartedCount = controls.filter(
    (control) => control.implementation_status === "not_started"
  ).length;

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
          display: "flex",
          minHeight: "calc(100vh - 86px)",
        }}
      >
        {/* Sidebar */}
        <aside
          style={{
            width: "260px",
            background: "white",
            borderLeft: "1px solid #e2e7eb",
            padding: "28px 20px",
            flexShrink: 0,
          }}
        >
          {menuItems.map((item) => {
            const active = item.href === "/controls";

            return (
              <Link
                key={item.name}
                href={item.href}
                style={{
                  display: "block",
                  padding: "15px 18px",
                  marginBottom: "7px",
                  borderRadius: "10px",
                  textDecoration: "none",
                  fontSize: "15px",
                  fontWeight: active ? "bold" : "normal",
                  background: active ? "#e8f5f2" : "transparent",
                  color: active ? "#0f6f67" : "#44515c",
                }}
              >
                {item.name}
              </Link>
            );
          })}
        </aside>

        {/* Main Content */}
        <section
          style={{
            flex: 1,
            padding: "40px",
            minWidth: 0,
          }}
        >
          {/* Heading */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "28px",
              gap: "20px",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "13px",
                  color: "#0f7d73",
                  fontWeight: "bold",
                  marginBottom: "8px",
                }}
              >
                NCA ECC
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: "34px",
                }}
              >
                الضوابط
              </h1>

              <p
                style={{
                  marginTop: "10px",
                  color: "#7a8794",
                }}
              >
                إدارة ومتابعة حالة الضوابط والأدلة والتحقق
              </p>
            </div>

            <div
              style={{
                background: "#e8f5f2",
                color: "#0f6f67",
                borderRadius: "10px",
                padding: "11px 16px",
                fontWeight: "bold",
                fontSize: "14px",
              }}
            >
              إطار العمل: ECC
            </div>
          </div>

          {/* KPI Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "18px",
              marginBottom: "25px",
            }}
          >
            <Kpi
              title="إجمالي الضوابط"
              value={controls.length.toString()}
            />

            <Kpi
              title="مطبق"
              value={implementedCount.toString()}
            />

            <Kpi
              title="قيد التنفيذ"
              value={inProgressCount.toString()}
            />

            <Kpi
              title="لم يبدأ"
              value={notStartedCount.toString()}
            />
          </div>

          {/* Controls Table */}
          <div
            style={{
              background: "white",
              border: "1px solid #e2e7eb",
              borderRadius: "14px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "18px",
                borderBottom: "1px solid #e8ecef",
              }}
            >
              <div
                style={{
                  fontSize: "14px",
                  color: "#5f6b76",
                }}
              >
                الضوابط المحملة من قاعدة بيانات Supabase
              </div>
            </div>

            {controls.length === 0 ? (
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  color: "#7a8794",
                }}
              >
                لا توجد ضوابط حاليًا.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    minWidth: "1050px",
                    borderCollapse: "collapse",
                  }}
                >
                  <thead>
                    <tr style={{ background: "#f8fafb" }}>
                      <Th>رقم الضابط</Th>
                      <Th>الضابط</Th>
                      <Th>المجال</Th>
                      <Th>المالك</Th>
                      <Th>حالة التنفيذ</Th>
                      <Th>حالة الدليل</Th>
                      <Th>التحقق</Th>
                      <Th>تاريخ الاستحقاق</Th>
                      <Th>الإجراء</Th>
                    </tr>
                  </thead>

                  <tbody>
                    {controls.map((control) => (
                      <tr key={control.id}>
                        <Td>
                          <strong>
                            {control.control_code}
                          </strong>
                        </Td>

                        <Td>{control.title_ar}</Td>

                        <Td>{control.domain_ar}</Td>

                        <Td>
                          {control.control_owner || "غير محدد"}
                        </Td>

                        <Td>
                          <Badge
                            text={implementationLabel(
                              control.implementation_status
                            )}
                            type={implementationBadgeType(
                              control.implementation_status
                            )}
                          />
                        </Td>

                        <Td>
                          <Badge
                            text={evidenceLabel(
                              control.evidence_status
                            )}
                            type={evidenceBadgeType(
                              control.evidence_status
                            )}
                          />
                        </Td>

                        <Td>
                          <Badge
                            text={verificationLabel(
                              control.verification_status
                            )}
                            type={verificationBadgeType(
                              control.verification_status
                            )}
                          />
                        </Td>

                        <Td>
                          {control.due_date || "غير محدد"}
                        </Td>

                        <Td>
                          <Link
                            href={`/controls/${control.id}`}
                            style={{
                              display: "inline-block",
                              border: "1px solid #d9dee3",
                              background: "white",
                              color: "#0b1f33",
                              borderRadius: "8px",
                              padding: "8px 13px",
                              textDecoration: "none",
                              fontWeight: "bold",
                            }}
                          >
                            فتح
                          </Link>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ marginTop: "22px" }}>
            <Link
              href="/"
              style={{
                color: "#0f7d73",
                textDecoration: "none",
                fontWeight: "bold",
              }}
            >
              ← العودة إلى لوحة المتابعة
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function implementationLabel(status: string) {
  switch (status) {
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
  switch (status) {
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
  switch (status) {
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
  if (status === "implemented") return "success";
  if (status === "in_progress") return "warning";
  if (status === "not_applicable") return "neutral";

  return "neutral";
}

function evidenceBadgeType(
  status: string
): "success" | "warning" | "info" | "neutral" {
  if (status === "accepted") return "success";
  if (status === "pending_review") return "info";
  if (status === "rejected") return "warning";

  return "neutral";
}

function verificationBadgeType(
  status: string
): "success" | "warning" | "info" | "neutral" {
  if (status === "verified") return "success";
  if (status === "under_review") return "info";
  if (status === "failed") return "warning";

  return "neutral";
}

function Kpi({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e2e7eb",
        borderRadius: "14px",
        padding: "22px",
      }}
    >
      <div
        style={{
          color: "#7a8794",
          fontSize: "14px",
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop: "9px",
          color: "#0f7d73",
          fontSize: "30px",
          fontWeight: "bold",
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
        padding: "6px 10px",
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

function Th({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <th
      style={{
        padding: "15px",
        textAlign: "right",
        color: "#46515b",
        fontSize: "13px",
        borderBottom: "1px solid #e8ecef",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <td
      style={{
        padding: "15px",
        borderBottom: "1px solid #eef1f3",
        color: "#26323d",
        fontSize: "13px",
        verticalAlign: "middle",
      }}
    >
      {children}
    </td>
  );
}