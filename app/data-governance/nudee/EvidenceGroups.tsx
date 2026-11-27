import type { EvidenceRequirement } from "./reference";

type AssignmentInfo = { status: string; due_date: string | null };
const actions: Record<string,string> = {unassigned:"إسناد الدليل", assigned:"متابعة التكليف", submitted:"مراجعة الدليل", changes_requested:"متابعة التعديل", approved:"عرض الدليل المعتمد"};

export default function EvidenceGroups({rows, assignments, labels, expand, onOpen}:{
  rows: EvidenceRequirement[]; assignments: Map<number, AssignmentInfo>; labels: Record<string,string>;
  expand: boolean; onOpen: (row:EvidenceRequirement)=>void;
}) {
  const questions = new Map<string, EvidenceRequirement[]>();
  for (const row of rows) {
    const question=questions.get(row.standard_code);
    if (question) question.push(row); else questions.set(row.standard_code,[row]);
  }
  return <div className="nr-groups">{Array.from(questions, ([code, question]) => {
    const levels=Array.from(new Set(question.map(r=>r.maturity_level))).sort((a,b)=>a.localeCompare(b,"ar",{numeric:true}));
    return <details key={code} open={expand || undefined} className="nr-question-group">
      <summary><bdi>{code}</bdi><strong>{question[0].requirement_title}</strong><small>{question.length} من الأدلة</small></summary>
      {levels.map(level=><details key={level} open={expand || undefined} className="nr-level-group">
        <summary>{level}</summary>
        <ul>{question.filter(r=>r.maturity_level===level).map(r=>{
          const a=assignments.get(r.id);
          const status=a?.status||"unassigned";
          const due=a?.due_date||r.planned_end;
          return <li key={r.id}>
            <div><strong>{r.evidence_name}</strong><span className="nr-status" data-status={status}>{labels[status]||status}</span></div>
            <p>{r.responsible_department||"لم تُحدّد الإدارة"} · {a?.due_date?"استحقاق التكليف":"موعد الخطة"} {due?<time dir="ltr" dateTime={due}>{due}</time>:"غير محدد"}
              {r.specification_code&&<> · <bdi>{r.specification_code}</bdi></>}</p>
            <button type="button" className="nr-open" aria-haspopup="dialog" onClick={()=>onOpen(r)}>{actions[status]||"فتح الدليل"}</button>
          </li>;
        })}</ul>
      </details>)}
    </details>;
  })}</div>;
}
