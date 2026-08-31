export default function Home() {
  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100vh",
        background: "#f5f7f9",
        fontFamily: "Arial, sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          height: "70px",
          background: "#0b1f33",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 32px",
        }}
      >
        <div>
          <strong style={{ fontSize: "20px" }}>
            Cyber Governance Platform
          </strong>
          <div style={{ fontSize: "12px", opacity: 0.7 }}>
            منصة حوكمة الأمن السيبراني
          </div>
        </div>

        <div style={{ fontSize: "14px" }}>
          دورة التقييم: 2026
        </div>
      </header>

      <div style={{ display: "flex", minHeight: "calc(100vh - 70px)" }}>
        {/* Sidebar */}
        <aside
          style={{
            width: "230px",
            background: "white",
            padding: "24px 16px",
            borderLeft: "1px solid #e3e7eb",
          }}
        >
          <div
            style={{
              background: "#e9f5f2",
              color: "#0f6f67",
              padding: "12px",
              borderRadius: "8px",
              marginBottom: "10px",
              fontWeight: "bold",
            }}
          >
            لوحة المتابعة
          </div>

          {[
            "الضوابط",
            "التكليفات",
            "الأدلة",
            "التقييم والتحقق",
            "التقارير",
            "الإعدادات",
          ].map((item) => (
            <div
              key={item}
              style={{
                padding: "12px",
                marginBottom: "5px",
                color: "#44515c",
              }}
            >
              {item}
            </div>
          ))}
        </aside>

        {/* Content */}
        <section style={{ flex: 1, padding: "30px" }}>
          <div style={{ marginBottom: "25px" }}>
            <h1 style={{ margin: 0, color: "#0b1f33" }}>
              لوحة المتابعة التشغيلية
            </h1>

            <p style={{ color: "#6b7785" }}>
              متابعة حالة الالتزام والضوابط والأدلة والمهام
            </p>
          </div>

          {/* KPI Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(150px, 1fr))",
              gap: "16px",
              marginBottom: "25px",
            }}
          >
            <Kpi title="نسبة الالتزام" value="68%" />
            <Kpi title="إجمالي الضوابط" value="108" />
            <Kpi title="بانتظار الأدلة" value="17" />
            <Kpi title="مهام متأخرة" value="6" />
          </div>

          {/* Main Panels */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr",
              gap: "16px",
            }}
          >
            <div style={panelStyle}>
              <h3 style={{ color: "#0b1f33" }}>
                حالة الالتزام حسب المجال
              </h3>

              <StatusRow
                name="حوكمة الأمن السيبراني"
                value="82%"
              />
              <StatusRow
                name="تعزيز الأمن السيبراني"
                value="64%"
              />
              <StatusRow
                name="صمود الأمن السيبراني"
                value="70%"
              />
              <StatusRow
                name="الأطراف الخارجية والحوسبة السحابية"
                value="55%"
              />
            </div>

            <div style={panelStyle}>
              <h3 style={{ color: "#0b1f33" }}>
                تحتاج انتباهك
              </h3>

              <p>🔴 6 مهام متأخرة</p>
              <p>🟠 17 دليلًا بانتظار الرفع</p>
              <p>🔵 9 أدلة بانتظار المراجعة</p>
              <p>🟢 34 ضابطًا تم التحقق منها</p>
            </div>
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
    <div style={panelStyle}>
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
          color: "#0f6f67",
          fontSize: "30px",
          fontWeight: "bold",
          marginTop: "8px",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatusRow({
  name,
  value,
}: {
  name: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "14px 0",
        borderBottom: "1px solid #edf0f2",
      }}
    >
      <span>{name}</span>

      <strong style={{ color: "#0f6f67" }}>
        {value}
      </strong>
    </div>
  );
}

const panelStyle = {
  background: "white",
  border: "1px solid #e4e8ec",
  borderRadius: "12px",
  padding: "20px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
};