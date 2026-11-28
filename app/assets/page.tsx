"use client";

import Link from "next/link";
import { useState } from "react";
import { riyadhIsoDate } from "@/lib/dates";
import { Area, Badge, DateCell, Drawer, Editor, Entry, Facts, Group, Input, RegisterScreen, Select, errorMessage, nullable, optionsFrom, opts, str, ui, useRegister, type RecordRow } from "@/components/registers/RegisterUI";

type Asset = RecordRow & {
  asset_code: string; name_ar: string; asset_type: string; business_owner: string; technical_owner: string | null;
  description: string | null; criticality: string | null; data_classification: string | null; status: string; environment: string;
  location: string | null; last_review_date: string | null; next_review_date: string | null;
  business_service: string | null; technical_identifier: string | null; make_model: string | null;
  dependencies: string | null; regulatory_scope: string | null;
};
const types = {application:"تطبيق",server:"خادم",database:"قاعدة بيانات",network:"شبكة",cloud_service:"خدمة سحابية",endpoint:"جهاز طرفي",ot_system:"نظام تشغيلي",social_account:"حساب تواصل اجتماعي",other:"أصل آخر"};
const environments = {production:"إنتاج",staging:"تهيئة",testing:"اختبار",development:"تطوير",other:"أخرى"};
const classifications = {public:"عام",internal:"داخلي",confidential:"سري",restricted:"سري للغاية"};
const strengths = {critical:"حرج",high:"عالٍ",medium:"متوسط",low:"منخفض"};
const states = {active:"نشط",maintenance:"تحت الصيانة",retired:"متقاعد",planned:"مخطط"};
const label = (labels: Record<string,string>, code: string | null) => code ? labels[code] ?? code : "غير محدد";
const assetTone = (value: string | null) => value==="critical"?"danger":value==="high"?"warn":"neutral";
const physical = new Set(["server","network","endpoint","ot_system"]);
const rank: Record<string,number> = { critical:4, high:3, medium:2, low:1 };

export default function AssetsPage() {
  const register = useRegister<Asset>("assets");
  const [detail, setDetail] = useState<Asset | null>(null);
  const [editing, setEditing] = useState<Asset | null | undefined>();
  const [type, setType] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const today = riyadhIsoDate();
  const due = (a: Asset) => a.status !== "retired" && !!a.next_review_date && a.next_review_date < today;
  const missing = (a: Asset) => a.status !== "retired" && (!a.criticality || !a.data_classification || !a.next_review_date
    || (physical.has(a.asset_type) && (!a.technical_identifier || !a.make_model || !a.location)));
  const rows = [...register.rows].sort((a,b) => Number(due(b)) - Number(due(a)) || (rank[b.criticality ?? ""] ?? 0) - (rank[a.criticality ?? ""] ?? 0) || a.name_ar.localeCompare(b.name_ar,"ar"));
  const begin = (a: Asset | null) => { setType(a?.asset_type ?? ""); setFormError(""); setNotice(""); setEditing(a); };
  const close = () => { setEditing(undefined); setDetail(null); };
  async function save(data: FormData) {
    setBusy(true); setFormError("");
    try {
      const row = await register.save({
        name_ar: str(data,"name_ar"), asset_type: str(data,"asset_type"), business_owner: str(data,"business_owner"),
        criticality: nullable(data,"criticality"), data_classification: nullable(data,"data_classification"),
        environment: str(data,"environment"), status: str(data,"status"),
        ...Object.fromEntries(["technical_owner","description","location","last_review_date","next_review_date","business_service","technical_identifier","make_model","dependencies","regulatory_scope"].map(k=>[k,nullable(data,k)])),
      }, editing ?? undefined);
      setEditing(undefined); setDetail(row); setNotice("تم حفظ الأصل.");
    } catch (e) { setFormError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <RegisterScreen title="سجل الأصول" description="جرد الأصول وملاكها وأولويات المراجعة." rows={rows} loading={register.loading} error={register.error} reload={register.reload} notice={notice}
    add={register.manage ? {label:"إضافة أصل",run:()=>begin(null)} : undefined}
    quick={[{key:"critical",label:"أصول حرجة",match:a=>a.criticality==="critical"&&a.status!=="retired"},{key:"overdue",label:"مراجعة متأخرة",match:due},{key:"missing",label:"بيانات ناقصة",match:missing}]}
    filters={[{label:"النوع",options:opts(types),value:a=>a.asset_type},{label:"مالك العمل",options:optionsFrom(rows,a=>a.business_owner),value:a=>a.business_owner},{label:"الأهمية",options:[...opts(strengths),["unknown","غير مقيّمة"]],value:a=>a.criticality??"unknown"},{label:"الحالة",options:opts(states),value:a=>a.status},{label:"البيئة",options:opts(environments),value:a=>a.environment}]}
    searchHint="الاسم أو الرمز أو المالك" searchText={a=>[a.name_ar,a.asset_code,a.business_owner,a.technical_owner,a.technical_identifier].join(" ")}
    columns={[
      {label:"الأصل",view:a=><Entry title={a.name_ar} code={a.asset_code} open={()=>setDetail(a)}/>},
      {label:"النوع",mobile:false,view:a=>label(types,a.asset_type)},
      {label:"مالك العمل",view:a=>a.business_owner},
      {label:"الأهمية",view:a=><Badge value={a.criticality ? label(strengths,a.criticality) : "غير مقيّمة"} tone={assetTone(a.criticality)}/>},
      {label:"الحالة",view:a=><Badge value={label(states,a.status)} tone={a.status==="active"?"good":"neutral"}/>},
      {label:"المراجعة القادمة",view:a=><DateCell value={a.next_review_date} late={due(a)}/>},
    ]}>
    {editing!==undefined && <Drawer title={editing?"تعديل الأصل":"إضافة أصل"} subtitle={editing?.asset_code} busy={busy} close={close}>
      <Editor submit={save} busy={busy} close={close} error={formError} label="حفظ الأصل">
        <div className={ui.fields}>
          <Input label="اسم الأصل" name="name_ar" value={editing?.name_ar} required maxLength={200}/>
          <label>نوع الأصل<select name="asset_type" required value={type} onChange={e=>setType(e.target.value)}><option value="">اختر النوع</option>{opts(types).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
          <Input label="مالك العمل" name="business_owner" value={editing?.business_owner} required maxLength={200}/>
          <Select label="الأهمية" name="criticality" options={opts(strengths)} value={editing?.criticality} empty="غير مقيّمة"/>
        </div>
        <Group label="الجرد والتصنيف">
          <Select label="تصنيف البيانات" name="data_classification" options={opts(classifications)} value={editing?.data_classification} empty="غير محدد"/>
          <Select label="البيئة" name="environment" options={opts(environments)} value={editing?.environment ?? "production"}/>
          <Select label="الحالة" name="status" options={opts(states)} value={editing?.status ?? "active"}/>
          <Input label="المالك الفني" name="technical_owner" value={editing?.technical_owner}/>
          <Input label="الموقع أو الاستضافة" name="location" value={editing?.location}/>
          <Input label="الخدمة أو العملية المدعومة" name="business_service" value={editing?.business_service}/>
          <Input label={physical.has(type)?"رقم الجهاز أو المعرّف الفني":"معرّف الأصل في الجرد الفني"} name="technical_identifier" value={editing?.technical_identifier}/>
          <div style={{display:physical.has(type)||editing?.make_model?undefined:"none"}}><Input label="المصنّع والطراز" name="make_model" value={editing?.make_model}/></div>
          <Area label="التبعيات" name="dependencies" value={editing?.dependencies}/>
          <Area label="النطاق التنظيمي المنطبق (مثل الأنظمة الحساسة)" name="regulatory_scope" value={editing?.regulatory_scope}/>
          <Area label="وصف الأصل والغرض منه" name="description" value={editing?.description}/>
        </Group>
        <Group label="مواعيد المراجعة">
          <Input label="آخر مراجعة" name="last_review_date" value={editing?.last_review_date} type="date"/>
          <Input label="المراجعة القادمة" name="next_review_date" value={editing?.next_review_date} type="date"/>
        </Group>
      </Editor>
    </Drawer>}
    {detail && editing===undefined && <Drawer title={detail.name_ar} subtitle={detail.asset_code} close={close}>
      <Facts entries={[["النوع",label(types,detail.asset_type)],["مالك العمل",detail.business_owner],["الأهمية",detail.criticality?label(strengths,detail.criticality):"غير مقيّمة"],["الحالة",label(states,detail.status)],["المراجعة القادمة",<DateCell key="review" value={detail.next_review_date} late={due(detail)}/>]]}/>
      {detail.description && <p>{detail.description}</p>}
      <Group label="تفاصيل الجرد">
        <div className={ui.wide}><Facts entries={[["المالك الفني",detail.technical_owner],["البيئة",label(environments,detail.environment)],["تصنيف البيانات",label(classifications,detail.data_classification)],["الموقع",detail.location],["الخدمة المدعومة",detail.business_service],["المعرّف الفني",detail.technical_identifier],["المصنّع والطراز",detail.make_model],["التبعيات",detail.dependencies],["النطاق التنظيمي",detail.regulatory_scope],["آخر مراجعة",<DateCell key="last" value={detail.last_review_date}/>]]}/></div>
      </Group>
      <section><h3>السجلات المرتبطة</h3><div className={ui.actions}><Link className={ui.secondary} href={`/risks?asset=${detail.id}`}>مخاطر الأصل</Link><Link className={ui.secondary} href={`/vulnerabilities?asset=${detail.id}`}>ثغرات الأصل</Link></div></section>
      {register.manage && <div><button className={ui.primary} onClick={()=>begin(detail)}>تعديل الأصل</button></div>}
    </Drawer>}
  </RegisterScreen>;
}
