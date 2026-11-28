"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { formatRiyadhDateTime, riyadhIsoDate } from "@/lib/dates";
import { httpLink, legacyLevel, recordId, severityValues } from "@/lib/register-methods";
import { downloadRegister, vulnerabilityHeaders } from "@/lib/register-exports";
import { supabase } from "@/lib/supabase";
import { readStrategyRows } from "@/lib/strategy-read";
import { Area, Badge, DateCell, Drawer, Editor, Entry, Facts, Group, Input, RegisterScreen, Select, assetOptions, errorMessage, nullable, number, optionsFrom, opts, str, ui, useRegister, type RecordRow } from "@/components/registers/RegisterUI";

type Vuln = RecordRow & {
  vulnerability_code:string; title:string; description:string|null; vendor_url:string|null; cve_id:string|null; cvss_score:string|null;
  affected_technologies:string|null; affected_assets:string|null; threat_analysis:string|null; threat_severity:number|null;
  likelihood:number|null; risk_severity:number|null; risk_score:number|null; owner_name:string|null; status:string;
  first_observed_date:string; due_date:string|null; resolved_date:string|null; notes:string|null; linked_control_id:number|null; asset_id:number|null;
  discovery_source:string|null; remediation_priority:string|null; priority_reason:string|null; remediation_summary:string|null;
  verification_method:string|null; verification_reference:string|null; verification_notes:string|null; verified_at:string|null;
  exception_reference:string|null; exception_reason:string|null; exception_expiry_date:string|null; hold_until:string|null; hold_reason:string|null;
};
type Mode = "new"|"details"|"edit"|"assign"|"send"|"verify"|"hold"|"exception"|"reopen";
const states:Record<string,string>={open:"مفتوحة",in_progress:"قيد المعالجة",on_hold:"معلّقة مؤقتًا",awaiting_verification:"بانتظار التحقق",resolved:"مغلقة",exception:"استثناء معتمد"};
const exportStates:Record<string,string>={open:"مفتوح",in_progress:"جار العمل علي",on_hold:"معلّق",awaiting_verification:"جار العمل علي",resolved:"مغلق",exception:"معلّق"};
const priorities:Record<string,string>={urgent:"عاجلة",high:"عالية",medium:"متوسطة",low:"منخفضة"};
const sources:Record<string,string>={scan:"فحص ثغرات",pentest:"اختبار اختراق",report:"بلاغ",review:"مراجعة داخلية",other:"مصدر آخر"};
const methods:Record<string,string>={retest:"إعادة اختبار",rescan:"إعادة فحص",approved_alternative:"وسيلة تحقق معتمدة أخرى"};
const likelihood: [string,string][] = ["1","2","3","4","5"].map((x,i)=>[x,`${x} — ${["نادر","غير محتمل","محتمل","مرجّح","شبه مؤكد"][i]}`]);
const headings:Record<Mode,string>={new:"تسجيل ثغرة",details:"",edit:"تعديل بيانات الثغرة",assign:"بدء المعالجة أو إسنادها",send:"إرسال للتحقق",verify:"التحقق وإغلاق الثغرة",hold:"تعليق مؤقت",exception:"توثيق استثناء معتمد",reopen:"إعادة فتح الثغرة"};
const rank:Record<string,number>={urgent:4,high:3,medium:2,low:1};
const active=(v:Vuln)=>!["resolved","exception"].includes(v.status);
const higher=(v:Vuln)=>active(v)&&["urgent","high"].includes(v.remediation_priority??"");
const stateTone=(status:string)=>status==="resolved"?"good":status==="awaiting_verification"||status==="on_hold"||status==="exception"?"warn":status==="in_progress"?"info":"neutral";
const priorityTone=(priority:string|null)=>priority==="urgent"?"danger":priority==="high"?"warn":"neutral";

export default function VulnerabilitiesPage(){
  return <Suspense fallback={<p role="status">جارٍ تحميل سجل الثغرات…</p>}><VulnerabilityRegister/></Suspense>;
}
function VulnerabilityRegister(){
  const assetId=recordId(useSearchParams().get("asset"));
  const register=useRegister<Vuln>("vulnerabilities");
  const [selected,setSelected]=useState<number|null>(null);
  const [mode,setMode]=useState<Mode|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const chosen=register.rows.find(v=>v.id===selected);
  const start=(next:Mode,id=selected)=>{setMode(next);setSelected(id);setError("");};
  const dismiss=()=>{setMode(null);setSelected(null);setError("");};
  const today=riyadhIsoDate();
  const past=(value:string|null)=>Boolean(value&&value<today);
  const overdue=(v:Vuln)=>v.status==="exception" ? past(v.exception_expiry_date)
    : active(v)&&(past(v.due_date)||(v.status==="on_hold"&&past(v.hold_until)));
  const nextDate=(v:Vuln)=>v.status==="exception"?v.exception_expiry_date:v.status==="resolved"?v.resolved_date
    : v.status==="on_hold"&&v.hold_until&&(!v.due_date||v.hold_until<v.due_date)?v.hold_until:v.due_date;
  const asset=(id:number|null)=>register.assets.find(a=>a.id===id);
  const assetName=(v:Vuln)=>asset(v.asset_id)?.name_ar??(v.affected_assets|| (v.asset_id ? "أصل مرتبط" : "غير محدد"));
  const rows=register.rows.filter(v=>!assetId||v.asset_id===assetId).sort((a,b)=>Number(overdue(b))-Number(overdue(a))||
    Number(active(b))-Number(active(a))||(rank[b.remediation_priority??""]??0)-(rank[a.remediation_priority??""]??0)||
    (a.due_date??"9999").localeCompare(b.due_date??"9999")||a.id-b.id);
  const locked=chosen?.status==="resolved"||chosen?.status==="exception";
  const vendor=chosen?httpLink(chosen.vendor_url):null;
  const canRecordException=register.role==="admin";

  async function save(d:FormData) {
    if(!mode||mode==="details"||(mode!=="new"&&!chosen))return;
    const payload:Record<string,unknown>={};
    if(mode==="new"||mode==="edit"){
      const linked=register.assetError?chosen?.asset_id??null:number(d,"asset");
      const scope=nullable(d,"scope");
      const url=nullable(d,"vendor_url");
      if(!linked&&!scope){setError("اختر الأصل المتأثر أو اكتب نطاق التأثر.");return;}
      if(url&&!httpLink(url)){setError("أدخل رابطًا صالحًا يبدأ بـ https أو http.");return;}
      const cvss=nullable(d,"cvss_score");
      if(cvss&&!/^(?:CVSS:\d(?:\.\d)?\s+)?(?:\d(?:\.\d)?|10(?:\.0)?)$/i.test(cvss)&&cvss!==chosen?.cvss_score){setError("أدخل درجة CVSS من 0 إلى 10، ويمكن إضافة الإصدار قبلها.");return;}
      Object.assign(payload,{title:str(d,"title"),description:str(d,"description"),discovery_source:str(d,"source"),
        first_observed_date:str(d,"observed"),vendor_url:url,cvss_score:cvss,cve_id:nullable(d,"cve_id"),
        affected_technologies:nullable(d,"affected_technologies"),
        affected_assets:linked&&linked!==chosen?.asset_id ? null : scope,
        threat_analysis:nullable(d,"threat_analysis"),threat_severity:number(d,"threat_severity"),
        likelihood:number(d,"likelihood"),risk_severity:number(d,"risk_severity"),notes:nullable(d,"notes")});
      if(!register.assetError)payload.asset_id=linked;
      if(d.has("linked_control_id"))payload.linked_control_id=number(d,"linked_control_id");
    }
    if(mode==="assign")Object.assign(payload,{status:"in_progress",owner_name:str(d,"owner"),due_date:str(d,"due"),remediation_priority:str(d,"priority"),priority_reason:str(d,"reason")});
    if(mode==="send")Object.assign(payload,{status:"awaiting_verification",remediation_summary:str(d,"remediation")});
    if(mode==="verify")Object.assign(payload,{status:"resolved",verification_method:str(d,"method"),verification_reference:str(d,"reference"),verification_notes:str(d,"result")});
    if(mode==="hold")Object.assign(payload,{status:"on_hold",hold_until:str(d,"until"),hold_reason:str(d,"reason")});
    if(mode==="exception")Object.assign(payload,{status:"exception",exception_reference:str(d,"reference"),exception_reason:str(d,"reason"),exception_expiry_date:str(d,"until")});
    if(mode==="reopen")Object.assign(payload,{status:"open",notes:[chosen?.notes,`إعادة فتح (${today}): ${str(d,"reason")}`].filter(Boolean).join("\n")});
    setBusy(true);setError("");
    try{const next=await register.save(payload,mode==="new"?undefined:chosen);start("details",next.id);setNotice("تم حفظ سجل الثغرة.");}
    catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }
  function exportData(){
    downloadRegister("سجل الثغرات",`CGP-NCA-Vulnerabilities-${today}.xlsx`,[vulnerabilityHeaders,...rows.map(v=>[
      v.vulnerability_code,v.title,v.description,v.vendor_url,v.cve_id,v.cvss_score,v.affected_technologies,
      v.asset_id&&!asset(v.asset_id)?v.affected_assets:assetName(v),v.threat_analysis,v.threat_severity,v.likelihood,v.risk_severity,
      v.risk_score===null?null:legacyLevel(v.risk_score,"مرتفع جدا"),v.owner_name,exportStates[v.status],v.first_observed_date,v.due_date,v.resolved_date,
      [v.notes,v.status==="awaiting_verification"?"بانتظار التحقق":null,v.status==="exception"?`استثناء معتمد حتى ${v.exception_expiry_date??"غير محدد"}`:null,v.status==="on_hold"&&v.hold_until?`معلق حتى ${v.hold_until}`:null].filter(Boolean).join("\n")
    ])]);
  }

  return <RegisterScreen key={assetId??"all"} title="سجل الثغرات" description="تابع أولوية المعالجة والاستحقاق والتحقق لكل أصل متأثر."
    rows={rows} loading={register.loading} error={register.error} reload={register.reload} notice={notice}
    add={register.manage?{label:"تسجيل ثغرة",run:()=>start("new",null)}:undefined}
    tools={<button type="button" className={ui.secondary} disabled={!rows.length} onClick={exportData}>تصدير قالب الهيئة</button>}
    context={assetId?<p className={ui.context}>ثغرات الأصل {asset(assetId)?.name_ar??""} · <Link href="/vulnerabilities">عرض السجل الكامل</Link></p>:undefined}
    initialQuick="active"
    quick={[{key:"active",label:"قيد المتابعة",match:active},{key:"high",label:"أولوية عالية",match:higher},{key:"overdue",label:"متأخرة",match:overdue},{key:"verification",label:"بانتظار التحقق",match:v=>v.status==="awaiting_verification"}]}
    filters={[{label:"الحالة",options:opts(states),value:v=>v.status},{label:"الأولوية",options:[...opts(priorities),["unknown","لم تُحدد"]],value:v=>v.remediation_priority??"unknown"},{label:"المسؤول",options:optionsFrom(rows,v=>v.owner_name),value:v=>v.owner_name??""},{label:"الأصل المتأثر",options:optionsFrom(rows,assetName),value:assetName}]}
    searchHint="الثغرة أو رقمها أو الأصل المتأثر" searchText={v=>[v.title,v.vulnerability_code,v.cve_id,v.owner_name,assetName(v)].join(" ")}
    columns={[
      {label:"الثغرة",view:v=><Entry title={v.title} code={v.vulnerability_code} open={()=>start("details",v.id)}/>},
      {label:"الأصل المتأثر",view:assetName},
      {label:"مسؤول المعالجة",view:v=>v.owner_name??"غير معيّن"},
      {label:"الأولوية",view:v=><Badge value={priorities[v.remediation_priority??""]??"لم تُحدد"} tone={priorityTone(v.remediation_priority)}/>},
      {label:"الحالة",view:v=><Badge value={states[v.status]??v.status} tone={stateTone(v.status)}/>},
      {label:"الموعد",view:v=><DateCell value={nextDate(v)} late={overdue(v)} label={v.status==="exception"?"انتهاء الاستثناء":v.status==="resolved"?"تاريخ الإغلاق":undefined}/>},
    ]}>
    {mode==="details"&&chosen&&<Drawer title={chosen.title} subtitle={chosen.vulnerability_code} close={dismiss}>
      <Facts entries={[["الأصل المتأثر",assetName(chosen)],["مسؤول المعالجة",chosen.owner_name],["الأولوية",priorities[chosen.remediation_priority??""]??"لم تُحدد"],["الحالة",states[chosen.status]],["تاريخ الاكتشاف",<DateCell key="discovered" value={chosen.first_observed_date}/>],["الموعد",<DateCell key="due" late={overdue(chosen)} value={nextDate(chosen)}/>]]}/>
      {chosen.description&&<p>{chosen.description}</p>}
      {chosen.status==="resolved"&&!chosen.verified_at&&<p className={ui.note}>إغلاق سابق. لم يُسجل تحقق في المسار الجديد.</p>}
      {chosen.status==="exception"&&!chosen.exception_expiry_date&&<p className={ui.note}>استثناء من السجل السابق. لم يُحدد موعد انتهائه.</p>}
      <Group label="التقييم والتفاصيل الفنية"><div className={ui.wide}><Facts entries={[
        ["المصدر",sources[chosen.discovery_source??""]],["معرّف CVE",chosen.cve_id],["CVSS",chosen.cvss_score],
        ["التقنية المتأثرة",chosen.affected_technologies],["تحليل التهديدات",chosen.threat_analysis],["شدة التهديد",chosen.threat_severity],
        ["الاحتمالية",chosen.likelihood],["الأثر",chosen.risk_severity],["المستوى وفق قالب الهيئة",chosen.risk_score===null?null:legacyLevel(chosen.risk_score,"مرتفع جدًا")],
        ["سبب أولوية العمل",chosen.priority_reason],["مرجع المورد",vendor?<a href={vendor} target="_blank" rel="noreferrer">فتح المرجع</a>:null],
        ["الضابط المرتبط",chosen.linked_control_id?<Link href={`/controls/${chosen.linked_control_id}`}>عرض الضابط</Link>:null],
      ]}/></div></Group>
      <Group label="المعالجة والتحقق والاستثناء"><div className={ui.wide}><Facts entries={[
        ["المعالجة المنفذة",chosen.remediation_summary],["طريقة التحقق",methods[chosen.verification_method??""]],["مرجع التحقق",chosen.verification_reference],
        ["نتيجة التحقق",chosen.verification_notes],["تاريخ الإغلاق",<DateCell key="closed" value={chosen.resolved_date}/>],
        ["سبب التعليق المؤقت",chosen.hold_reason],["نهاية التعليق",<DateCell key="hold" value={chosen.hold_until}/>],
        ["مرجع اعتماد الاستثناء",chosen.exception_reference],["مبرر الاستثناء",chosen.exception_reason],["نهاية الاستثناء",<DateCell key="expires" value={chosen.exception_expiry_date}/>],["ملاحظات",chosen.notes]
      ]}/></div></Group>
      {register.manage&&<VulnerabilityHistory key={chosen.updated_at} id={chosen.id}/>}
      {register.manage&&<div className={ui.actions}>
        {!locked&&<button className={ui.secondary} onClick={()=>start("edit")}>تعديل البيانات</button>}
        {!locked&&chosen.status!=="awaiting_verification"&&<button className={ui.primary} onClick={()=>start("assign")}>{chosen.status==="in_progress"?"تعديل إسناد المعالجة":"بدء المعالجة"}</button>}
        {chosen.status==="in_progress"&&<button className={ui.primary} onClick={()=>start("send")}>إرسال للتحقق</button>}
        {chosen.status==="awaiting_verification"&&<button className={ui.primary} onClick={()=>start("verify")}>توثيق التحقق والإغلاق</button>}
        {!locked&&chosen.status!=="on_hold"&&<button className={ui.secondary} onClick={()=>start("hold")}>تعليق مؤقت</button>}
        {!locked&&canRecordException&&<button className={ui.secondary} onClick={()=>start("exception")}>توثيق استثناء</button>}
        {(locked||chosen.status==="awaiting_verification")&&<button className={ui.secondary} onClick={()=>start("reopen")}>إعادة فتح</button>}
      </div>}
    </Drawer>}
    {mode&&mode!=="details"&&(mode==="new"||chosen)&&<Drawer title={headings[mode]} subtitle={chosen?.vulnerability_code} busy={busy} close={dismiss}>
      <Editor submit={save} busy={busy} close={dismiss} label={mode==="verify"?"إغلاق بعد التحقق":"حفظ"} error={error}>
        {(mode==="new"||mode==="edit")&&<>
          <div className={ui.fields}>
            <Input label="عنوان الثغرة" name="title" value={chosen?.title} required/>
            {!register.assetError?<Select label="الأصل المتأثر" name="asset" options={assetOptions(register.assets)} value={chosen?.asset_id??assetId} empty="غير مسجل أو نطاق متعدد"/>:<p className={ui.note}>تعذر تحميل الأصول. يبقى أي ربط قائم دون تغيير.</p>}
            <Input label="وصف نطاق التأثر إذا لم يُربط أصل" name="scope" value={chosen?.affected_assets}/>
            <Select label="مصدر الاكتشاف" name="source" value={chosen?.discovery_source} options={opts(sources)} empty="اختر المصدر" required/>
            <Input label="تاريخ الاكتشاف" name="observed" value={chosen?.first_observed_date??today} type="date" required/>
            <Area label="الوصف" name="description" value={chosen?.description} required/>
          </div>
          <Group label="التقييم والتفاصيل الفنية">
            <Input label="معرّف CVE إن وجد" name="cve_id" value={chosen?.cve_id}/>
            <Input label="درجة CVSS (من 0 إلى 10)" name="cvss_score" value={chosen?.cvss_score}/>
            <Input label="رابط المورد" name="vendor_url" value={chosen?.vendor_url} type="url"/>
            <Input label="التقنيات المتأثرة" name="affected_technologies" value={chosen?.affected_technologies}/>
            <Select label="شدة التهديد" name="threat_severity" value={chosen?.threat_severity} options={severityValues} empty="غير مقيّمة"/>
            <Select label="الاحتمالية" name="likelihood" value={chosen?.likelihood} options={likelihood} empty="غير مقيّمة"/>
            <Select label="الأثر على الجهة" name="risk_severity" value={chosen?.risk_severity} options={severityValues} empty="غير مقيّم"/>
            <ControlPicker selected={chosen?.linked_control_id??null}/>
            <Area label="تحليل التهديدات" name="threat_analysis" value={chosen?.threat_analysis}/>
            <Area label="ملاحظات" name="notes" value={chosen?.notes}/>
          </Group>
        </>}
        {mode==="assign"&&<div className={ui.fields}><Input label="مسؤول المعالجة" name="owner" value={chosen?.owner_name} required/>
          <Input label="الموعد وفق اتفاقية مستوى الخدمة المعتمدة" name="due" value={chosen?.due_date} type="date" required/>
          <Select label="أولوية المعالجة" name="priority" options={opts(priorities)} value={chosen?.remediation_priority} empty="اختر الأولوية" required/>
          <Area label="سبب الأولوية، مثل حساسية الأصل أو مؤشر الاستغلال" name="reason" value={chosen?.priority_reason} required/></div>}
        {mode==="send"&&<Area label="الإصلاح المنفذ وما يجب التحقق منه" name="remediation" required/>}
        {mode==="verify"&&<div className={ui.fields}><Select label="طريقة التحقق" name="method" options={opts(methods)} empty="اختر الطريقة" required/><Input label="مرجع أو رقم تقرير التحقق" name="reference" required/><Area label="النتيجة التي تثبت الإغلاق" name="result" required/></div>}
        {mode==="hold"&&<div className={ui.fields}><Input label="موعد انتهاء التعليق" name="until" type="date" min={today} required/><Area label="السبب والإجراء المؤقت" name="reason" required/></div>}
        {mode==="exception"&&<div className={ui.fields}><Input label="مرجع اعتماد صاحب الصلاحية" name="reference" required/><Input label="تاريخ انتهاء الاستثناء" name="until" type="date" min={today} required/><Area label="مبرر الاستثناء والإجراءات البديلة" name="reason" required/></div>}
        {mode==="reopen"&&<Area label="سبب إعادة الفتح" name="reason" required/>}
      </Editor>
    </Drawer>}
  </RegisterScreen>;
}

function ControlPicker({selected}:{selected:number|null}){
  const [controls,setControls]=useState<{id:number;control_code:string;title_ar:string}[]|null>(null);
  const [failed,setFailed]=useState(false);
  const [query,setQuery]=useState(""),[choice,setChoice]=useState(String(selected??""));
  async function load(){
    const r=await readStrategyRows((a,b)=>supabase.from("controls").select("id,control_code,title_ar,frameworks!inner(is_active)",{count:"exact"}).eq("frameworks.is_active",true).order("id").range(a,b),x=>x.id);
    if(r.status==="COMPLETE")setControls(r.data);else setFailed(true);
  }
  if(!controls)return <div><button type="button" className={ui.secondary} onClick={()=>void load()}>عرض خيارات ربط الضوابط</button>{failed&&<p role="status">تعذر تحميل الضوابط. لم يتغير الربط الحالي.</p>}</div>;
  return <div className={ui.wide}><label>بحث عن ضابط<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="الرقم أو الاسم"/></label><label>الضابط المرتبط<select name="linked_control_id" value={choice} onChange={e=>setChoice(e.target.value)}><option value="">بدون ربط</option>
    {choice&&!controls.some(c=>String(c.id)===choice)&&<option value={choice}>الضابط المرتبط سابقًا</option>}
    {controls.filter(c=>String(c.id)===choice||`${c.control_code} ${c.title_ar}`.toLowerCase().includes(query.trim().toLowerCase())).map(c=><option key={c.id} value={c.id}>{c.control_code} · {c.title_ar.slice(0,100)}</option>)}
  </select></label></div>;
}

function VulnerabilityHistory({id}:{id:number}) {
  type Event = { id:number; new_status:string; recorded_at:string; decision_details:Record<string,string> };
  const [opened,setOpened]=useState(false);
  const [events,setEvents]=useState<Event[]|null>(null);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    if(!opened)return;
    let live=true;
    void (async()=>{
      const a=await supabase.from("vulnerability_register_events").select("id,new_status,recorded_at,decision_details").eq("vulnerability_id",id).order("id",{ascending:false}).limit(20);
      if(live){if(a.error)setFailed(true);else setEvents(a.data as Event[]);}
    })();
    return ()=>{live=false;};
  },[opened,id]);
  return <details className={ui.group} onToggle={e=>{if(e.currentTarget.open)setOpened(true);}}><summary>سجل تغيّر الحالة</summary>
    {failed?<p role="alert">تعذر تحميل سجل الحالة.</p>:events===null?<p role="status">جارٍ التحميل…</p>:events.length===0?<p>لا توجد أحداث مسجلة في المسار الجديد.</p>:
      <ol className={ui.history}>{events.map(e=><li key={e.id}><Badge value={states[e.new_status]??e.new_status}/><small>{formatRiyadhDateTime(e.recorded_at)}</small>
        <p>{e.decision_details.verification_reference??e.decision_details.exception_reference??e.decision_details.hold_reason??e.decision_details.remediation_summary??""}</p></li>)}</ol>}
  </details>;
}
