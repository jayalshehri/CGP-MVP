"use client";

import { useState, type FormEvent } from "react";
import { formatRiyadhDateTime, riyadhIsoDate } from "@/lib/dates";
import { evidenceMatches, requirements, type Action, type Evidence, type ContractFields, type CycleFields } from "@/lib/tpra";
import { Badge, DateCell, Group, Input, str, ui } from "@/components/registers/RegisterUI";
import s from "./third-parties.module.css";

type Actor = {id:string;role:string};
type Change = (table:string, values:Record<string,unknown>, prior?:{id:number;updated_at:string})=>Promise<void>;
type Cycle = CycleFields & {id:number;state:"draft"|"submitted"|"decided"};
function QuickForm({children,save,label}:{children:React.ReactNode;save:(d:FormData)=>Promise<void>;label:string}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[done,setDone]=useState("");
  async function run(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy)return;
    const form=e.currentTarget;
    const data=new FormData(form,(e.nativeEvent as SubmitEvent).submitter);
    setBusy(true);setError("");setDone("");
    try{await save(data);form.reset();setDone("تم الحفظ.");}
    catch(err){setError(err instanceof Error?err.message:"تعذّر حفظ التغيير.");}
    finally{setBusy(false);}
  }
  return <form className={s.itemForm} aria-label={label} onSubmit={run}>
    <fieldset className={ui.editor} disabled={busy}>{children}</fieldset>
    {error&&<p role="alert" className={ui.danger}>{error}</p>}
    {done&&<p role="status" className={ui.note}>{done}</p>}
  </form>;
}

export function EvidencePanel({a,party,items,actor,change}:{a:Cycle;party:ContractFields;items:Evidence[];actor:Actor;change:Change}){
  const required=requirements(a.scope,a.verified_likelihood!=null);
  const current=items.filter(e=>evidenceMatches(e,a,party));
  const accepted=required.filter(c=>current.some(e=>e.check_key===c.key&&e.state==="accepted")).length;
  const table="third_party_assessment_evidence";
  return <Group label={`الأدلة والتحقق · ${accepted} من ${required.length} موثّقة`} open>
    <div className={s.checks}>
      {a.state==="draft"&&<p className={ui.note}>اربط رقم الوثيقة أو مرجعها في مستودع الجهة. يراجع الدليل عضو آخر قبل توثيق الاعتماد.</p>}
      {required.map(c=>{
        const row=[...current].filter(e=>e.check_key===c.key).sort((a,b)=>b.id-a.id)[0];
        const state=row?.state;
        return <details className={s.check} key={c.key}>
          <summary className={s.itemSummary}>
            <span>{c.title}<small><bdi>{c.reference}</bdi></small></span>
            <Badge value={state==="accepted"?"تم التحقق":state==="pending"?"بانتظار التحقق":state==="rejected"?"أُعيد الدليل":"غير مرفق"} tone={state==="accepted"?"good":state?"warn":"neutral"}/>
          </summary>
          {row&&<div className={s.evidenceText}>
            <strong dir="auto">{row.document_title}</strong>
            <p dir="auto">{row.document_ref}</p>
            {row.verified_at&&<p className={ui.note}>{formatRiyadhDateTime(row.verified_at)} · {row.review_note}</p>}
          </div>}
          {(!row||row.state==="rejected")&&a.state==="draft"&&<QuickForm label={c.title} save={d=>change(table,{
            assessment_id:a.id,check_key:c.key,document_title:str(d,"title"),
            document_ref:c.key==="residual"?a.verified_reference:str(d,"ref"),
          })}>
            <div className={ui.fields}>
              <Input label="اسم الوثيقة" name="title" required maxLength={200}/>
              {c.key==="residual"?<p className={ui.note}>مرجع نتيجة التحقق المسجّل في التقييم · {a.verified_reference}</p>:
                <Input label="رقم الوثيقة أو مرجعها" name="ref" required/>}
            </div>
            <button className={ui.secondary} type="submit">ربط الدليل</button>
          </QuickForm>}
          {state==="pending"&&a.state!=="decided"&&(row.created_by===actor.id?<p className={ui.note}>بانتظار مراجعة عضو آخر.</p>:
            <QuickForm label={`مراجعة دليل ${c.title}`} save={d=>change(table,{state:str(d,"state"),review_note:str(d,"note")},row)}>
              <Input label="نتيجة مراجعة الدليل أو سبب الإعادة" name="note" required maxLength={1000}/>
              <div className={s.inlineButtons}>
                <button className={ui.primary} name="state" value="accepted" type="submit">توثيق التحقق</button>
                <button className={ui.secondary} name="state" value="rejected" type="submit">إعادة الدليل</button>
              </div>
            </QuickForm>)}
        </details>;
      })}
      {items.length>current.length&&<p className={ui.note}>توجد أدلة من نطاق سابق. لا تُحتسب لدورة التقييم الحالية.</p>}
      {current.some(e=>e.state==="rejected")&&<details className={s.check}>
        <summary>الأدلة المعادة سابقًا</summary>
        <ul className={s.priorEvidence}>{current.filter(e=>e.state==="rejected").map(e=><li key={e.id}>
          {e.document_title} · {e.document_ref} · {e.review_note}
        </li>)}</ul>
      </details>}
    </div>
  </Group>;
}

export function ActionsPanel({a,items,actor,change,prior=false}:{a:Cycle;items:Action[];actor:Actor;change:Change;prior?:boolean}){
  const table="third_party_assessment_actions";
  const openCount=items.filter(t=>t.state!=="closed").length;
  const sorted=[...items].sort((a,b)=>Number(a.state==="closed")-Number(b.state==="closed")||a.due_on.localeCompare(b.due_on));
  return <Group label={prior?`متابعة دورة سابقة #${a.id} · ${openCount} مفتوحة`:`إجراءات المعالجة · ${openCount} مفتوحة`} open={prior?undefined:true}>
    <div className={s.checks}>
      {!items.length&&<p className={ui.note}>لا توجد إجراءات مسجّلة لهذه الدورة.</p>}
      {sorted.map(t=><details className={s.check} key={t.id}>
        <summary className={s.itemSummary}>
          <span>{t.description}<small>{t.owner} · <DateCell value={t.due_on} late={t.state!=="closed"&&t.due_on<riyadhIsoDate()}/></small></span>
          <Badge value={t.state==="closed"?"مغلق بتحقق":t.state==="to_verify"?"بانتظار تحقق الإغلاق":"مفتوح"} tone={t.state==="closed"?"good":"warn"}/>
        </summary>
        {t.closure_ref&&<p className={s.evidenceText}>دليل التنفيذ · {t.closure_ref}</p>}
        {t.review_note&&<p className={ui.note}>{t.review_note}{t.verified_at?` · ${formatRiyadhDateTime(t.verified_at)}`:""}</p>}
        {t.state==="open"&&a.state!=="submitted"&&<QuickForm label="إرسال المعالجة للتحقق" save={d=>change(table,{state:"to_verify",closure_ref:str(d,"ref")},t)}>
          <Input label="مرجع دليل التنفيذ" name="ref" required/>
          <button className={ui.secondary} type="submit">إرسال للتحقق</button>
        </QuickForm>}
        {t.state==="to_verify"&&(actor.role!=="admin"||actor.id===t.completed_by?<p className={ui.note}>الإغلاق يتطلب تحقق مدير نظام غير مرسل التنفيذ.</p>:
          <QuickForm label="التحقق من تنفيذ المعالجة" save={d=>change(table,{state:str(d,"state"),review_note:str(d,"note")},t)}>
            <Input label="نتيجة التحقق أو سبب الإعادة" name="note" required maxLength={1000}/>
            <div className={s.inlineButtons}>
              <button type="submit" className={ui.primary} name="state" value="closed">إغلاق بعد التحقق</button>
              <button type="submit" className={ui.secondary} name="state" value="open">إعادة للتنفيذ</button>
            </div>
          </QuickForm>)}
      </details>)}
      {!prior&&a.state==="draft"&&<details className={s.check}>
        <summary>إضافة إجراء معالجة</summary>
        <QuickForm label="إضافة إجراء معالجة" save={d=>change(table,{assessment_id:a.id,description:str(d,"description"),owner:str(d,"owner"),due_on:str(d,"due")})}>
          <div className={ui.fields}>
            <Input label="الإجراء المطلوب" name="description" required maxLength={1000}/>
            <Input label="مسؤول التنفيذ" name="owner" required maxLength={200}/>
            <Input label="تاريخ الاستحقاق" name="due" type="date" min={riyadhIsoDate()} required/>
          </div>
          <button type="submit" className={ui.secondary}>حفظ الإجراء</button>
        </QuickForm>
      </details>}
    </div>
  </Group>;
}
