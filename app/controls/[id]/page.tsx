import Link from "next/link";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ControlDetailsPage({
  params,
}: PageProps) {
  const { id } = await params;

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
          <Link
            href="/"
            style={menuStyle}
          >
            لوحة المتابعة
          </Link>

          <Link
            href="/controls"
            style={{
              ...menuStyle,
              background: "#e8f5f2",
              color: "#0f6f67",
              fontWeight: "bold",
            }}
          >
            الضوابط
          </Link>

          <div style={menuStyle}>التكليفات</div>
          <div style={menuStyle}>الأدلة</div>
          <div style={menuStyle}>التقييم والتحقق</div>
          <div style={menuStyle}>التقارير</div>
          <div style={menuStyle}>الإعدادات</div>
        </aside>

        {/* Main Content */}
        <section
          style={{
            flex: 1,
            padding: "40px",
            minWidth: 0,
          }}
        >
          {/* Breadcrumb */}
          <div
            style={{
              fontSize: "13px",
              color: "#7a8794",
              marginBottom: "14px",
            }}
          >
            الضوابط / {id}
          </div>

          {/* Title */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "20px",
              marginBottom: "26px",
            }}
          >
            <div>
              <div
                style={{
                  color: "#0f7d73",
                  fontSize: "13px",
                  fontWeight: "bold",
                  marginBottom: "8px",
                }}
              >
                NCA ECC
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: "32px",
                }}
              >
                {id}
              </h1>

              <p
                style={{
                  marginTop: "10px",
                  color: "#5f6b76",
                  fontSize: "16px",
                }}
              >
                تطوير استراتيجية الأمن السيبراني واعتمادها ومراجعتها بشكل دوري
              </p>
            </div>

            <span
              style={{
                background: "#fff4e5",
                color: "#b76500",
                padding: "8px 12px",
                borderRadius: "999px",
                fontSize: "13px",
                fontWeight: "bold",
              }}
            >
              ملتزم جزئيًا
            </span>
          </div>

          {/* Status Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "16px",
              marginBottom: "22px",
            }}
          >
            <StatusCard
              title="حالة التنفيذ"
              value="قيد التنفيذ"
              color="#b76500"
              background="#fff4e5"
            />

            <StatusCard
              title="حالة الدليل"
              value="قيد المراجعة"
              color="#2563eb"
              background="#eaf2ff"
            />

            <StatusCard
              title="التحقق"
              value="غير متحقق"
              color="#5f6b76"
              background="#eef1f3"
            />

            <StatusCard
              title="تاريخ الاستحقاق"
              value="2026-09-20"
              color="#0f6f67"
              background="#e8f5f2"
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr",
              gap: "20px",
            }}
          >
            {/* Left Side */}
            <div>
              {/* Requirement */}
              <div style={panelStyle}>
                <h2 style={panelTitleStyle}>
                  متطلب الضابط
                </h2>

                <p
                  style={{
                    color: "#44515c",
                    lineHeight: 1.8,
                    marginBottom: 0,
                  }}
                >
                  يجب على الجهة تطوير وتوثيق واعتماد استراتيجية
                  للأمن السيبراني، وربطها بأهداف الجهة ومتطلباتها
                  التنظيمية، ومراجعتها وفق فترات دورية معتمدة.
                </p>
              </div>

              {/* Implementation */}
              <div
                style={{
                  ...panelStyle,
                  marginTop: "18px",
                }}
              >
                <h2 style={panelTitleStyle}>
                  التطبيق
                </h2>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "14px",
                  }}
                >
                  <InfoBox
                    title="مالك الضابط"
                    value="إدارة الأمن السيبراني"
                  />

                  <InfoBox
                    title="مسؤول الدليل"
                    value="إدارة الحوكمة"
                  />

                  <InfoBox
                    title="حالة التنفيذ"
                    value="قيد التنفيذ"
                  />

                  <InfoBox
                    title="آخر مراجعة"
                    value="2026-08-25"
                  />
                </div>

                <div
                  style={{
                    marginTop: "18px",
                  }}
                >
                  <div
                    style={{
                      color: "#7a8794",
                      fontSize: "13px",
                      marginBottom: "8px",
                    }}
                  >
                    ملاحظات التطبيق
                  </div>

                  <div
                    style={{
                      border: "1px solid #e2e7eb",
                      borderRadius: "10px",
                      padding: "14px",
                      background: "#fafbfc",
                      color: "#44515c",
                      lineHeight: 1.7,
                    }}
                  >
                    تم إعداد المسودة الأولى للاستراتيجية، والعمل
                    جارٍ على اعتمادها من صاحب الصلاحية.
                  </div>
                </div>
              </div>

              {/* Evidence */}
              <div
                style={{
                  ...panelStyle,
                  marginTop: "18px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    marginBottom: "18px",
                  }}
                >
                  <h2
                    style={{
                      ...panelTitleStyle,
                      marginBottom: 0,
                    }}
                  >
                    الأدلة
                  </h2>

                  <button
                    style={{
                      background: "#0f7d73",
                      color: "white",
                      border: 0,
                      padding: "10px 14px",
                      borderRadius: "8px",
                      fontWeight: "bold",
                    }}
                  >
                    + رفع دليل
                  </button>
                </div>

                <EvidenceRow
                  name="Cybersecurity_Strategy_v3.pdf"
                  owner="إدارة الحوكمة"
                  status="قيد المراجعة"
                />

                <EvidenceRow
                  name="Approval_Memo.pdf"
                  owner="مكتب الإدارة"
                  status="مقبول"
                />
              </div>
            </div>

            {/* Right Side */}
            <div>
              {/* Assignment */}
              <div style={panelStyle}>
                <h2 style={panelTitleStyle}>
                  التكليف
                </h2>

                <InfoBox
                  title="Control Owner"
                  value="Cybersecurity Governance"
                />

                <div style={{ height: "12px" }} />

                <InfoBox
                  title="Evidence Owner"
                  value="IT Governance"
                />

                <div style={{ height: "12px" }} />

                <InfoBox
                  title="الأولوية"
                  value="عالية"
                />
              </div>

              {/* Workflow */}
              <div
                style={{
                  ...panelStyle,
                  marginTop: "18px",
                }}
              >
                <h2 style={panelTitleStyle}>
                  سير العمل
                </h2>

                <WorkflowStep
                  number="1"
                  title="تم إنشاء التكليف"
                  active
                />

                <WorkflowStep
                  number="2"
                  title="تم رفع الدليل"
                  active
                />

                <WorkflowStep
                  number="3"
                  title="قيد مراجعة الأمن السيبراني"
                  active
                />

                <WorkflowStep
                  number="4"
                  title="التحقق والإغلاق"
                />
              </div>

              {/* Audit */}
              <div
                style={{
                  ...panelStyle,
                  marginTop: "18px",
                }}
              >
                <h2 style={panelTitleStyle}>
                  سجل النشاط
                </h2>

                <AuditItem
                  date="2026-08-30"
                  text="تم رفع Cybersecurity_Strategy_v3.pdf"
                />

                <AuditItem
                  date="2026-08-29"
                  text="تم تعيين Evidence Owner"
                />

                <AuditItem
                  date="2026-08-28"
                  text="تم إنشاء التكليف"
                />
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: "22px",
            }}
          >
            <Link
              href="/controls"
              style={{
                color: "#0f7d73",
                fontWeight: "bold",
                textDecoration: "none",
              }}
            >
              ← العودة إلى الضوابط
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusCard({
  title,
  value,
  color,
  background,
}: {
  title: string;
  value: string;
  color: string;
  background: string;
}) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e2e7eb",
        borderRadius: "12px",
        padding: "18px",
      }}
    >
      <div
        style={{
          color: "#7a8794",
          fontSize: "13px",
          marginBottom: "9px",
        }}
      >
        {title}
      </div>

      <span
        style={{
          display: "inline-block",
          color,
          background,
          padding: "6px 10px",
          borderRadius: "999px",
          fontSize: "13px",
          fontWeight: "bold",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function InfoBox({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #e2e7eb",
        borderRadius: "10px",
        padding: "14px",
        background: "#fafbfc",
      }}
    >
      <div
        style={{
          color: "#7a8794",
          fontSize: "12px",
          marginBottom: "6px",
        }}
      >
        {title}
      </div>

      <div
        style={{
          color: "#26323d",
          fontSize: "14px",
          fontWeight: "bold",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function EvidenceRow({
  name,
  owner,
  status,
}: {
  name: string;
  owner: string;
  status: string;
}) {
  const accepted = status === "مقبول";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr auto",
        gap: "12px",
        alignItems: "center",
        padding: "14px 0",
        borderBottom: "1px solid #edf0f2",
      }}
    >
      <strong style={{ fontSize: "14px" }}>
        {name}
      </strong>

      <span
        style={{
          color: "#5f6b76",
          fontSize: "13px",
        }}
      >
        {owner}
      </span>

      <span
        style={{
          color: accepted ? "#0f6f67" : "#2563eb",
          background: accepted ? "#e8f5f2" : "#eaf2ff",
          borderRadius: "999px",
          padding: "6px 10px",
          fontSize: "12px",
          fontWeight: "bold",
        }}
      >
        {status}
      </span>
    </div>
  );
}

function WorkflowStep({
  number,
  title,
  active = false,
}: {
  number: string;
  title: string;
  active?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        marginBottom: "14px",
      }}
    >
      <div
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background: active ? "#0f7d73" : "#eef1f3",
          color: active ? "white" : "#7a8794",
          fontSize: "12px",
          fontWeight: "bold",
        }}
      >
        {number}
      </div>

      <div
        style={{
          fontSize: "13px",
          color: active ? "#26323d" : "#7a8794",
        }}
      >
        {title}
      </div>
    </div>
  );
}

function AuditItem({
  date,
  text,
}: {
  date: string;
  text: string;
}) {
  return (
    <div
      style={{
        padding: "11px 0",
        borderBottom: "1px solid #edf0f2",
      }}
    >
      <div
        style={{
          fontSize: "12px",
          color: "#7a8794",
          marginBottom: "4px",
        }}
      >
        {date}
      </div>

      <div
        style={{
          fontSize: "13px",
          color: "#44515c",
        }}
      >
        {text}
      </div>
    </div>
  );
}

const menuStyle = {
  display: "block",
  padding: "15px 18px",
  marginBottom: "7px",
  borderRadius: "10px",
  textDecoration: "none",
  fontSize: "15px",
  color: "#44515c",
};

const panelStyle = {
  background: "white",
  border: "1px solid #e2e7eb",
  borderRadius: "14px",
  padding: "22px",
};

const panelTitleStyle = {
  marginTop: 0,
  marginBottom: "18px",
  fontSize: "19px",
  color: "#0b1f33",
};