import Link from "next/link";

const controls = [
  {
    id: "1-1-1",
    title: "تحديد وتوثيق واعتماد استراتيجية الأمن السيبراني",
    domain: "حوكمة الأمن السيبراني",
    owner: "إدارة الأمن السيبراني",
    implementation: "مطبق",
    evidence: "مقبول",
    verification: "تم التحقق",
    dueDate: "2026-09-15",
  },
  {
    id: "1-1-2",
    title: "تنفيذ خطة عمل لتطبيق استراتيجية الأمن السيبراني",
    domain: "حوكمة الأمن السيبراني",
    owner: "إدارة الأمن السيبراني",
    implementation: "قيد التنفيذ",
    evidence: "بانتظار الرفع",
    verification: "غير متحقق",
    dueDate: "2026-09-20",
  },
  {
    id: "1-2-1",
    title: "إنشاء إدارة مستقلة للأمن السيبراني",
    domain: "حوكمة الأمن السيبراني",
    owner: "الموارد البشرية",
    implementation: "مطبق",
    evidence: "قيد المراجعة",
    verification: "غير متحقق",
    dueDate: "2026-09-10",
  },
];

const menuItems = [
  { name: "لوحة المتابعة", href: "/" },
  { name: "الضوابط", href: "/controls" },
  { name: "التكليفات", href: "#" },
  { name: "الأدلة", href: "#" },
  { name: "التقييم والتحقق", href: "#" },
  { name: "التقارير", href: "#" },
  { name: "الإعدادات", href: "#" },
];

export default function ControlsPage() {
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

        {/* Content */}
        <section
          style={{
            flex: 1,
            padding: "40px",
            minWidth: 0,
          }}
        >
          {/* Page Heading */}
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
            <Kpi title="إجمالي الضوابط" value="108" />
            <Kpi title="ملتزم" value="54" />
            <Kpi title="قيد التنفيذ" value="37" />
            <Kpi title="غير ملتزم" value="17" />
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
            {/* Search and Filter */}
            <div
              style={{
                padding: "18px",
                borderBottom: "1px solid #e8ecef",
                display: "flex",
                justifyContent: "space-between",
                gap: "14px",
              }}
            >
              <input
                type="text"
                placeholder="ابحث برقم الضابط أو اسمه..."
                style={{
                  width: "100%",
                  maxWidth: "430px",
                  padding: "12px 14px",
                  border: "1px solid #d9dee3",
                  borderRadius: "9px",
                  outline: "none",
                  fontSize: "14px",
                }}
              />

              <select
                style={{
                  padding: "11px 14px",
                  border: "1px solid #d9dee3",
                  borderRadius: "9px",
                  background: "white",
                  fontSize: "14px",
                }}
              >
                <option>جميع الحالات</option>
                <option>ملتزم</option>
                <option>قيد التنفيذ</option>
                <option>غير ملتزم</option>
              </select>
            </div>

            {/* Table */}
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
                        <strong>{control.id}</strong>
                      </Td>

                      <Td>{control.title}</Td>

                      <Td>{control.domain}</Td>

                      <Td>{control.owner}</Td>

                      <Td>
                        <Badge
                          text={control.implementation}
                          type={
                            control.implementation === "مطبق"
                              ? "success"
                              : "warning"
                          }
                        />
                      </Td>

                      <Td>
                        <Badge
                          text={control.evidence}
                          type={
                            control.evidence === "مقبول"
                              ? "success"
                              : control.evidence === "قيد المراجعة"
                                ? "info"
                                : "warning"
                          }
                        />
                      </Td>

                      <Td>
                        <Badge
                          text={control.verification}
                          type={
                            control.verification === "تم التحقق"
                              ? "success"
                              : "neutral"
                          }
                        />
                      </Td>

                      <Td>{control.dueDate}</Td>

                      {/* Open Control Details */}
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
          </div>

          {/* Back to Dashboard */}
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