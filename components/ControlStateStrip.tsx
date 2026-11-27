import StatusBadge from '@/components/StatusBadge';
import './control-state-strip.css';

export default function ControlStateStrip({ implementation, evidence, verification }: {
  implementation: string; evidence: string; verification: string;
}) {
  return <dl className="control-state-strip" aria-label="حالة الضابط">
    <div><dt>التطبيق</dt><dd><StatusBadge status={implementation}/></dd></div>
    <div><dt>الدليل</dt><dd><StatusBadge status={evidence}/></dd></div>
    <div><dt>التحقق</dt><dd><StatusBadge status={verification}/></dd></div>
  </dl>;
}
