'use client';

import { useState } from 'react';

type Props = {
  disabled: boolean;
  showAdministrativeMetadata: boolean;
  versions: Array<{ id: number; file_name: string; version_number: number }>;
  replaceId: string;
  replacementLocked: boolean;
  onReplacement: (value: string) => void;
  validUntil: string;
  coverageStart: string;
  coverageEnd: string;
  onValidity: (value: string) => void;
  onCoverageStart: (value: string) => void;
  onCoverageEnd: (value: string) => void;
};

// Presentation only: off switches clear optional values to the command's existing
// null representation. They never infer expiry/coverage from the upload date.
export default function EvidenceSubmissionOptions(props: Props) {
  const [hasValidity, setHasValidity] = useState(false);
  const [hasCoverage, setHasCoverage] = useState(false);
  const hasVersionChoice = props.versions.length > 0 && !props.replacementLocked;
  if (!props.showAdministrativeMetadata && !hasVersionChoice && !props.replacementLocked) return null;
  return <section className="evidence-upload-section evidence-upload-properties">
    {props.showAdministrativeMetadata && <h2>خصائص اختيارية</h2>}
    {props.replacementLocked ? <p className="evidence-upload-note">تقديم إصدار جديد للدليل #{props.replaceId}</p> : hasVersionChoice && <details className="evidence-upload-version-choice"><summary>إصدار الدليل</summary><label className="evidence-upload-property">نوع الإرسال
      <select disabled={props.disabled} value={props.replaceId} onChange={event => props.onReplacement(event.target.value)}>
        <option value="">مستند جديد مستقل</option>
        {props.versions.map(version => <option key={version.id} value={version.id}>إصدار جديد من: {version.file_name} (الإصدار {version.version_number})</option>)}
      </select>
    </label></details>}
    {props.showAdministrativeMetadata && <><div className="evidence-upload-option-group">
      <label className="evidence-upload-switch"><input type="checkbox" disabled={props.disabled} checked={hasValidity} aria-controls="evidence-validity" onChange={event => { setHasValidity(event.target.checked); if (!event.target.checked) props.onValidity(''); }}/>هل للدليل تاريخ انتهاء صلاحية؟</label>
      {hasValidity && <label id="evidence-validity" className="evidence-upload-property">صالح حتى<input type="date" disabled={props.disabled} value={props.validUntil} onChange={event => props.onValidity(event.target.value)}/></label>}
    </div>
    <div className="evidence-upload-option-group">
      <label className="evidence-upload-switch"><input type="checkbox" disabled={props.disabled} checked={hasCoverage} aria-controls="evidence-coverage" onChange={event => { setHasCoverage(event.target.checked); if (!event.target.checked) { props.onCoverageStart(''); props.onCoverageEnd(''); } }}/>هل يغطي الدليل فترة زمنية؟</label>
      {hasCoverage && <div id="evidence-coverage" className="evidence-upload-date-pair">
        <label className="evidence-upload-property">بداية فترة التغطية<input type="date" disabled={props.disabled} value={props.coverageStart} onChange={event => props.onCoverageStart(event.target.value)}/></label>
        <label className="evidence-upload-property">نهاية فترة التغطية<input type="date" disabled={props.disabled} min={props.coverageStart || undefined} value={props.coverageEnd} onChange={event => props.onCoverageEnd(event.target.value)}/></label>
      </div>}
    </div></>}
  </section>;
}
