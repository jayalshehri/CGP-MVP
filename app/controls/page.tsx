"use client";
import StatusBadge from "@/components/StatusBadge";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
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



export default function ControlsPage() {
  const router = useRouter();
  const [controls,setControls] = useState<Control[]>([]);

  const [error,setError] = useState<Error|null>(null);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{ let active=true; (async()=>{try {
    const {user,profile}=await requireProfile();
    if(!active)return;
    let query=supabase.from("controls").select("*").order("id");
    if(profile.role==="control_owner")query=query.eq("control_owner_id",user.id);
    const {data,error}=await query; if(error)throw error;
    if(active)setControls(data??[]);
  }catch(e){if(active)setError(new Error(e instanceof Error?e.message:"تعذر تحميل الضوابط"));
    const {data}=await supabase.auth.getSession();if(!data.session)router.replace("/login");
  }finally{if(active)setLoading(false);}})();return()=>{active=false;};},[router]);
  if(loading)return <main dir="rtl" style={{padding:40}}>جاري تحميل الضوابط...</main>;

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


      <div className="cgp-page-body"
        style={{
          display: "flex",
          minHeight: "calc(100vh - 86px)",
        }}
      >
        {/* Sidebar */}


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
                  color: "#586875",
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
              سجل الضوابط
            </div>
          </div>

          {/* KPI Cards */}
          <div className="cgp-responsive-grid cgp-kpi-grid"
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
                الضوابط ضمن نطاق صلاحياتك
              </div>
            </div>

            {controls.length === 0 ? (
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  color: "#586875",
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
                          <StatusBadge status={control.implementation_status}/>
                        </Td>

                        <Td>
                          <StatusBadge status={control.evidence_status}/>
                        </Td>

                        <Td>
                          <StatusBadge status={control.verification_status}/>
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
          color: "#586875",
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
