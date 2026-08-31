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

export default function ControlsPage() {
  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100vh",
        background: "#f5f7f9",
        fontFamily: "Arial, sans-serif",
        padding: "32px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "13px",
              color: "#0f6f67",
              marginBottom: "8px",
            }}
          >
            NCA ECC 2-2024
          </div>

          <h1
            style={{
              margin: 0,
              color: "#0b1f33",
              fontSize: "30px",
            }}
          >
            الضوابط
          </h1>

          <p
            style={{
              color: "#6b7785",
              marginTop: "8px",
            }}
          >
            إدارة ومتابعة حالة الضوابط والأدلة والتحقق
          </p>
        </div>

        <button
          style={{
            background: "#0f6f67",
            color: "white",
            border: 0,
            borderRadius: "10px",
            padding: "12px 18px",
            fontWeight: "bold",
          }}
        >
          + إضافة ضابط
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "14px",
          marginBottom: "22px",
        }}
      >
        <Kpi title="إجمالي الضوابط" value="108" />
        <Kpi title="ملتزم" value="54" />
        <Kpi title="قيد التنفيذ" value="37" />
        <Kpi title="غير ملتزم" value="17" />
      </div>

      <div
        style={{
          background: "white",
          border: "1px solid #e4e8ec",
          borderRadius: "14px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid #e8ecef",
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <input
            placeholder="ابحث برقم الضابط أو اسمه..."
            style={{
              flex: 1,
              maxWidth: "420px",
              padding: "11px 14px",
              border: "1px solid #d9dee3",
              borderRadius: "9px",
            }}
          />

          <select
            style={{
              padding: "11px 14px",
              border: "1px solid #d9dee3",
              borderRadius: "9px",
              background: "white",
            }}
          >
            <option>جميع الحالات</option>
            <option>ملتزم</option>
            <option>قيد التنفيذ</option>
            <option>غير ملتزم</option>
          </select>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: "1000px",
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
                <Th>إجراء</Th>
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
                      color={
                        control.implementation === "مطبق"
                          ? "#0f6f67"
                          : "#d97706"
                      }
                      bg={
                        control.implementation === "مطبق"
                          ? "#e8f5f2"
                          : "#fff4e5"
                      }
                    />
                  </Td>
                  <Td>
                    <Badge
                      text={control.evidence}
                      color={
                        control.evidence === "مقبول"
                          ? "#0f6f67"
                          : control.evidence === "قيد المراجعة"
                            ? "#2563eb"
                            : "#d97706"
                      }
                      bg={
                        control.evidence === "مقبول"
                          ? "#e8f5f2"
                          : control.evidence === "قيد المراجعة"
                            ? "#eaf2ff"
                            : "#fff4e5"
                      }
                    />
                  </Td>
                  <Td>{control.verification}</Td>
                  <Td>{control.dueDate}</Td>
                  <Td>
                    <button
                      style={{
                        border: "1px solid #d9dee3",
                        background: "white",
                        borderRadius: "8px",
                        padding: "8px 12px",
                      }}
                    >
                      فتح
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
        border: "1px solid #e4e8ec",
        borderRadius: "12px",
        padding: "18px",
      }}
    >
      <div
        style={{
          color: "#6b7785",
          fontSize: "14px",
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop: "8px",
          fontSize: "28px",
          fontWeight: "bold",
          color: "#0f6f67",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Badge({
  text,
  color,
  bg,
}: {
  text: string;
  color: string;
  bg: string;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "6px 10px",
        borderRadius: "999px",
        color,
        background: bg,
        fontSize: "12px",
        fontWeight: "bold",
        whiteSpace: "nowrap",
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
        padding: "14px",
        textAlign: "right",
        color: "#46515b",
        fontSize: "13px",
        borderBottom: "1px solid #e8ecef",
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
        padding: "14px",
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