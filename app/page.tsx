import Link from "next/link";

const menuItems = [
  { name: "لوحة المتابعة", href: "/" },
  { name: "الضوابط", href: "/controls" },
  { name: "التكليفات", href: "#" },
  { name: "الأدلة", href: "#" },
  { name: "التقييم والتحقق", href: "#" },
  { name: "التقارير", href: "#" },
  { name: "الإعدادات", href: "#" },
];

const domainStatus = [
  { name: "حوكمة الأمن السيبراني", value: "82%" },
  { name: "تعزيز الأمن السيبراني", value: "64%" },
  { name: "صمود الأمن السيبراني", value: "70%" },
  { name: "الأطراف الخارجية والحوسبة السحابية", value: "55%" },
];

export default function Home() {
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
            const active = item.href === "/";

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
          <div style={{ marginBottom: "30px" }}>
            <h1
              style={{
                margin: 0,
                fontSize: "34px",
                color: "#0b1f33",
              }}
            >
              لوحة المتابعة التشغيلية
            </h1>

            <p
              style={{
                marginTop: "10px",
                color: "#7a8794",
                fontSize: "15px",
              }}
            >
              متابعة حالة الالتزام والضوابط والأدلة والمهام
            </p>
          </div>

          {/* KPI Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "18px",
              marginBottom: "28px",
            }}
          >
            <KpiCard title="نسبة الالتزام" value="68%" />
            <KpiCard title="إجمالي الضوابط" value="108" />
            <KpiCard title="بانتظار الأدلة" value="17" />
            <KpiCard title="مهام متأخرة" value="6" />
          </div>

          {/* Dashboard Panels */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr",
              gap: "20px",
            }}
          >
            {/* Compliance by Domain */}
            <div
              style={{
                background: "white",
                border: "1px solid #e2e7eb",
                borderRadius: "14px",
                padding: "28px",
              }}
            >
              <h2
                style={{
                  marginTop: 0,
                  marginBottom: "25px",
                  fontSize: "21px",
                }}
              >
                حالة الالتزام حسب المجال
              </h2>

              {domainStatus.map((domain) => (
                <div
                  key={domain.name}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "19px 0",
                    borderBottom: "1px solid #edf0f2",
                  }}
                >
                  <span style={{ fontSize: "15px" }}>
                    {domain.name}
                  </span>

                  <strong
                    style={{
                      color: "#0f7d73",
                      fontSize: "18px",
                    }}
                  >
                    {domain.value}
                  </strong>
                </div>
              ))}
            </div>

            {/* Attention Panel */}
            <div
              style={{
                background: "white",
                border: "1px solid #e2e7eb",
                borderRadius: "14px",
                padding: "28px",
              }}
            >
              <h2
                style={{
                  marginTop: 0,
                  marginBottom: "25px",
                  fontSize: "21px",
                }}
              >
                تحتاج انتباهك
              </h2>

              <AlertItem icon="🔴" text="6 مهام متأخرة" />
              <AlertItem icon="🟠" text="17 دليلاً بانتظار الرفع" />
              <AlertItem icon="🔵" text="9 أدلة بانتظار المراجعة" />
              <AlertItem icon="🟢" text="34 ضابطاً تم التحقق منها" />
            </div>
          </div>

          {/* Quick Action */}
          <div
            style={{
              marginTop: "24px",
            }}
          >
            <Link
              href="/controls"
              style={{
                display: "inline-block",
                background: "#0f7d73",
                color: "white",
                textDecoration: "none",
                padding: "13px 20px",
                borderRadius: "9px",
                fontWeight: "bold",
                fontSize: "14px",
              }}
            >
              عرض جميع الضوابط ←
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function KpiCard({
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
        padding: "24px",
        minHeight: "82px",
      }}
    >
      <div
        style={{
          color: "#7a8794",
          fontSize: "14px",
          marginBottom: "10px",
        }}
      >
        {title}
      </div>

      <div
        style={{
          color: "#0f7d73",
          fontSize: "32px",
          fontWeight: "bold",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function AlertItem({
  icon,
  text,
}: {
  icon: string;
  text: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "14px 0",
        fontSize: "15px",
      }}
    >
      <span style={{ fontSize: "20px" }}>
        {icon}
      </span>

      <span>{text}</span>
    </div>
  );
}