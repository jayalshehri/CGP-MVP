"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import QuestionOverview from "./QuestionOverview";
import type { QuestionRecord } from "./QuestionPreparation";
import shared from "../nudee-dashboard/nudee-dashboard.module.css";

const QuestionPreparation = dynamic(() => import("./QuestionPreparation"));

export default function EvidencePreparation({ records, domain }: { records: QuestionRecord[]; domain: string }) {
  const [expanded, setExpanded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState({ domain, code: "", serial: 0 });
  const editor = useRef<HTMLDetailsElement>(null);
  const [showEditor, setShowEditor] = useState(false);

  function openQuestion(domain: string, code: string) {
    setSelection(previous => ({ domain, code, serial: previous.serial + 1 }));
    setShowEditor(true);
    if (editor.current) {
      editor.current.open = true;
      editor.current.scrollIntoView({ block: "start" });
      editor.current.querySelector("summary")?.focus({ preventScroll: true });
    }
  }
  return <details className={shared.report} onToggle={e => { if (e.currentTarget.open) setExpanded(true); }}>
    <summary>جاهزية الأسئلة وحزمة المجال</summary>
    {expanded && <div className={shared.reportBody}>
      <QuestionOverview records={records} initialDomain={domain} revision={revision} onPrepare={openQuestion}/>
      <details ref={editor} className={shared.report} onToggle={e => { if (e.currentTarget.open) setShowEditor(true); }}>
        <summary>مراجعة السؤال وتنزيل الحزمة</summary>
        {showEditor && <QuestionPreparation key={selection.serial} records={records} initialDomain={selection.domain} initialCode={selection.code} onChange={() => setRevision(n => n + 1)}/>}
      </details>
    </div>}
  </details>;
}
