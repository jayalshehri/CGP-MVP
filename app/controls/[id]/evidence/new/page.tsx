"use client";

import { Suspense, FormEvent, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getEccOfficialTitle } from "@/lib/ecc-strategy-example";
import "./evidence-upload.css";
import { controlContext, controlHref } from "@/lib/control360";
import { myControlsReturn } from "@/lib/my-controls-context";
import EvidenceSubmissionOptions from "@/components/EvidenceSubmissionOptions";

export default function NewEvidencePage() {
  return <Suspense fallback={<p role="status">جاري تحميل رفع الدليل…</p>}><NewEvidenceContent/></Suspense>;
}
function NewEvidenceContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const context = controlContext(new URLSearchParams(searchParams.toString())).toString();
  const personalReturn = myControlsReturn(new URLSearchParams(context));

  const controlId = Number(params.id);

  const [versions,setVersions]=useState<Array<{id:number;file_name:string;version_number:number}>>([]);
  const [replaceId,setReplaceId]=useState('');
  const [requestId,setRequestId]=useState('');
  const [validUntil,setValidUntil]=useState('');
  const [coverageStart,setCoverageStart]=useState('');
  const [coverageEnd,setCoverageEnd]=useState('');
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [controlRequirement,setControlRequirement]=useState("");
  const [controlCode,setControlCode]=useState("");
  const [frameworkCode,setFrameworkCode]=useState("");
  const [mappedControls,setMappedControls]=useState<Array<{control_id:number;framework_code:string;control_code:string;control_title:string}>>([]);
  const [selectedTargets,setSelectedTargets]=useState<number[]>([]);
  const [ready,setReady]=useState(false);
  const [archived,setArchived]=useState(false);
  useEffect(()=>{let active=true;(async()=>{try{
    const {profile}=await requireProfile(['admin','cybersecurity_team','control_owner']);
    const query=new URLSearchParams(window.location.search);if(active){setRequestId(query.get('request')||'');setReplaceId(query.get('replace')||'');}
    const {data:old}=await supabase.from('evidence').select('id,file_name,version_number').eq('control_id',controlId).eq('is_current',true);
    if(active)setVersions(old??[]);
    const {data,error}=await supabase.from("controls").select("id,control_code,title_ar,description_ar,frameworks(code,is_active)").eq("id",controlId).single();
    if(error||!data)throw new Error("الضابط غير موجود أو ليس ضمن صلاحيتك.");
    const framework=Array.isArray(data.frameworks)?data.frameworks[0]:data.frameworks;
    if(framework?.is_active===false){if(active)setArchived(true);return;}
    const code=framework?.code||"";
    const requirement = (code === "ECC" ? getEccOfficialTitle(data.control_code) : undefined) || data.description_ar || data.title_ar;
    if(active){setReady(true);setControlCode(data.control_code);setControlRequirement(requirement);setFrameworkCode(code);}
    if(profile.role!=="control_owner"){
      const {data:mappings}=await supabase.rpc("grc_control_mappings",{p_control_id:controlId});
      if(active)setMappedControls((mappings??[]) as Array<{control_id:number;framework_code:string;control_code:string;control_title:string}>);
    }
  }catch(e){if(active)setErrorMessage(e instanceof Error?e.message:"تعذر التحقق من الصلاحيات");
    const {data}=await supabase.auth.getSession();if(!data.session)router.replace("/login");
  }})();return()=>{active=false;};},[controlId,router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!ready || uploading || archived) return;
    setMessage("");
    setErrorMessage("");

    if ((!Number.isSafeInteger(controlId) || controlId<=0)) {
      setErrorMessage("رقم الضابط غير صحيح.");
      return;
    }

    const finalEvidenceName = controlCode.trim();
    if (!finalEvidenceName) {
      setErrorMessage("تعذر تحديد رقم الضابط للدليل.");
      return;
    }

    if (!file) {
      setErrorMessage("يرجى اختيار ملف.");
      return;
    }

    if (file.size === 0 || file.size > 20 * 1024 * 1024) {
      setErrorMessage("اختر ملفًا غير فارغ بحجم لا يتجاوز 20 MB.");
      return;
    }

    setUploading(true);

    try {
      await requireProfile();
      // Clean file name
      const safeFileName = file.name
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9._-]/g, "");

      // Every control gets its own folder
      const storagePath =
        `${controlId}/${crypto.randomUUID()}-${safeFileName}`;

      // 1. Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("evidence-files")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        throw new Error(
          `تعذر رفع الملف: ${uploadError.message}`
        );
      }

      // 2. Save evidence metadata in database
      const { error: insertError } = await supabase.rpc('cgp_grc_command',{
        p_action:'submit',p_control_id:controlId,p_data:{
          evidence_name:finalEvidenceName,description:description.trim()||null,file_name:file.name,
          file_path:storagePath,mime_type:file.type||null,file_size:file.size,
          replaces_id:replaceId?Number(replaceId):null,request_id:requestId?Number(requestId):null,
          valid_until:validUntil||null,coverage_start:coverageStart||null,coverage_end:coverageEnd||null,targets:selectedTargets
        }
      });

      if (insertError) {
        // If DB insert fails, remove uploaded file
        await supabase.storage
          .from("evidence-files")
          .remove([storagePath]);

        throw new Error(
          `تم رفع الملف ولكن تعذر تسجيل الدليل: ${insertError.message}`
        );
      }

      setMessage(selectedTargets.length?"تم رفع الدليل وإرساله للمراجعة في الضوابط المختارة.":"تم رفع الدليل وربطه بالضابط بنجاح.");

      router.push(controlHref(controlId, context, "evidence"));
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "حدث خطأ غير متوقع.";

      setErrorMessage(message);
    } finally {
      setUploading(false);
    }
  }

  if(archived)return <main dir="rtl" className="evidence-upload-page"><div className="evidence-upload-container"><h1>ضابط مؤرشف</h1><p>هذا الضابط محفوظ للسجل التاريخي فقط، ولا يقبل أدلة جديدة.</p><Link href={personalReturn??controlHref(controlId,context,"evidence")}>عرض السجل التاريخي ←</Link></div></main>;

  return (
    <main dir="rtl" className="evidence-upload-page">
      <div className="evidence-upload-container">
        <Link href={personalReturn??controlHref(controlId,context,"evidence")} className="evidence-upload-back">
          <span aria-hidden="true">←</span> {personalReturn?"العودة إلى ضوابطي":"العودة إلى الضابط"}
        </Link>

        <header className="evidence-upload-header">
          <div className="evidence-upload-header-main">
            <span className="evidence-upload-eyebrow">إضافة دليل امتثال</span>
            <div className="evidence-upload-title-row">
              <h1>رفع دليل</h1>
              <span className="evidence-upload-code" dir="ltr">
                {controlCode || `#${controlId}`}
              </span>
            </div>
            <p>ارفع الملف الداعم للضابط وأضف وصفًا مختصرًا يسهل مراجعته.</p>
          </div>

          {controlRequirement && (
            <details className="evidence-upload-requirement">
              <summary>عرض نص الضابط</summary>
              <p>{controlRequirement}</p>
            </details>
          )}
        </header>

        <form aria-busy={uploading} onSubmit={handleSubmit} className="evidence-upload-card">
          <section className="evidence-upload-section">
            <div className="evidence-upload-section-heading">
              <span className="evidence-upload-step">1</span>
              <div>
                <h2>إرفاق الملف <em>*</em></h2>
                <p>PDF أو Word أو Excel أو صورة، بحجم لا يتجاوز 20 MB.</p>
              </div>
            </div>

            <label className="cgp-file-choice evidence-upload-file-choice">
              <span className="evidence-upload-file-icon" aria-hidden="true">↑</span>
              <span className="evidence-upload-file-copy">
                <strong>{file ? file.name : "اختر ملفًا من جهازك"}</strong>
                <small>{file ? `الحجم: ${(file.size / 1024 / 1024).toFixed(2)} MB` : "اضغط هنا لفتح مستعرض الملفات"}</small>
              </span>
              <span className="evidence-upload-file-action">اختيار ملف</span>
              <input
                aria-label="ملف الدليل"
                disabled={uploading || !ready}
                id="evidence-file"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setErrorMessage("");
                }}
                className="cgp-file-input"
              />
            </label>
            <p className="evidence-upload-note">
              سيُسجل الدليل تلقائيًا تحت رقم الضابط <b dir="ltr">{controlCode}</b>.
            </p>
            {requestId&&<p className="evidence-upload-note">مرتبط بطلب الدليل #{requestId}</p>}
          </section>

          <section className="evidence-upload-section evidence-upload-file-section">
            <div className="evidence-upload-section-heading">
              <span className="evidence-upload-step">2</span>
              <div><h2>وصف الدليل</h2><p>اختياري، لتوضيح محتوى الملف عند الحاجة.</p></div>
            </div>
            <FieldLabel text="وصف الدليل" htmlFor="evidence-description" />
            <textarea disabled={uploading || !ready} id="evidence-description" value={description}
              onChange={event => setDescription(event.target.value)} placeholder="وصف مختصر يساعد المراجع على فهم الدليل."
              rows={2} className="evidence-upload-textarea"/>
          </section>

          <EvidenceSubmissionOptions disabled={uploading || !ready} versions={versions}
            replaceId={replaceId} replacementLocked={Boolean(searchParams.get('replace'))} onReplacement={setReplaceId}
            validUntil={validUntil} coverageStart={coverageStart} coverageEnd={coverageEnd}
            onValidity={setValidUntil} onCoverageStart={setCoverageStart} onCoverageEnd={setCoverageEnd}/>

          {frameworkCode === "ECC" && mappedControls.length > 0 && (
            <details className="evidence-upload-sharing">
              <summary>
                <span>مشاركة الدليل مع ضوابط مرتبطة</span>
                <b>{mappedControls.length}</b>
              </summary>
              <div className="evidence-upload-sharing-body">
                <p>يمكن استخدام الملف نفسه مع ضوابط مرتبطة. كل ضابط مختار يمر بمراجعة مستقلة قبل انعكاس النتيجة عليه.</p>
                <fieldset disabled={uploading || !ready}>
                  {mappedControls.map((item) => (
                    <label key={item.control_id} className="evidence-upload-sharing-option">
                      <input
                        type="checkbox"
                        checked={selectedTargets.includes(item.control_id)}
                        onChange={() => setSelectedTargets((current) => current.includes(item.control_id) ? current.filter((id) => id !== item.control_id) : [...current, item.control_id])}
                      />
                      <span>
                        <strong dir="ltr">{item.framework_code} · {item.control_code}</strong>
                        <small>{item.control_title}</small>
                      </span>
                    </label>
                  ))}
                </fieldset>
              </div>
            </details>
          )}

          {errorMessage && <div role="alert" className="evidence-upload-alert evidence-upload-alert-error">{errorMessage}</div>}
          {message && <div role="status" className="evidence-upload-alert evidence-upload-alert-success">{message}</div>}
          {uploading && <p role="status" className="evidence-upload-status">جاري إرسال الملف وتسجيله. انتظر حتى تظهر تفاصيل الضابط.</p>}

          <footer className="evidence-upload-actions">
            <div>
              <button type="submit" disabled={uploading || !ready} className="evidence-upload-submit">
                {uploading ? "جاري الرفع..." : "تقديم الدليل"}
              </button>
              <Link href={personalReturn??controlHref(controlId,context,"evidence")} className="evidence-upload-cancel">إلغاء</Link>
            </div>
            <p>يُسجَّل وقت الرفع تلقائيًا عند تقديم الدليل. تبقى الإصدارات السابقة محفوظة في السجل.</p>
          </footer>
        </form>
      </div>
    </main>
  );

}

function FieldLabel({
  text,
  htmlFor,
}: {
  text: string;
  htmlFor: string;
}) {
  return <label className="evidence-upload-label" htmlFor={htmlFor}>{text}</label>;
}
