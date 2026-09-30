import Link from 'next/link';
import { assessmentLabels, cycleLabels, reviewLabels } from '@/lib/assessment';
import { assessmentHrefFor } from '@/lib/compliance-frameworks';
import { findingStatusLabels, severityLabels } from '@/lib/findings';
import { formatComplianceDate, formatComplianceDateTime } from '@/lib/grc';
import { controlEventLabel, type ControlAuditEvent } from '@/lib/control360';
import type { ControlAction, ControlAssessment, ControlFinding } from '@/lib/control360-read';

export function Control360Assessments({ rows, framework, error }: { rows: ControlAssessment[]; framework: string; error?: string }) {
  const route = assessmentHrefFor(framework);
  return <section className="detail-card"><h2>تقييم الضابط حسب الدورة والنطاق</h2>
    <p className="detail-hint">كل نتيجة تخص نطاقها ودورتها، ولا تستبدل حالة التطبيق أو قرار المراجعة الدورية للضابط.</p>
    {error ? <p role="alert">تعذر تحميل التقييمات. أعد تحميل الصفحة.</p> : !rows.length ? <div className="control360-empty"><strong>{route ? 'لا توجد بنود تقييم متاحة ضمن صلاحياتك.' : 'التقييم غير مفعّل في CGP حاليًا'}</strong>{route && <Link href={route}>فتح مساحة تقييم {framework} ←</Link>}</div> :
      <div className="control360-table-wrap"><table className="workflow-table"><thead><tr><th>الدورة والنطاق</th><th>نتيجة البند</th><th>المراجعة</th><th>آخر تحديث</th><th>التفاصيل</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id}>
        <td><strong>{row.cycle?.scope_name ?? 'نطاق الدورة غير متاح ضمن صلاحياتك'}</strong><small>{index === 0 ? 'أحدث بند · ' : ''}دورة #{row.cycle_id} {row.cycle?.system_id ? '· نطاق نظام حساس' : ''}</small><small>{cycleLabels[row.cycle?.status ?? ''] ?? 'حالة الدورة غير متاحة'}</small></td>
        <td>{assessmentLabels[row.compliance_status ?? ''] ?? 'لم يُقيّم'}{row.cycle && !['approved', 'closed'].includes(row.cycle.status) && <small>نتيجة غير معتمدة</small>}</td>
        <td>{reviewLabels[row.review_status] ?? row.review_status}</td><td>{formatComplianceDate(row.updated_at)}</td>
        <td>{route ? <Link href={`${route}?cycle=${row.cycle_id}&item=${row.id}`}>فتح بند التقييم ←</Link> : 'مسار التقييم غير متاح'}</td>
      </tr>)}</tbody></table></div>}
    {rows.length === 50 && <p className="detail-hint">أحدث 50 بندًا؛ بقية التاريخ في مساحة التقييم.</p>}
  </section>;
}

export function Control360Findings({ rows, actions, href, error }: { rows: ControlFinding[]; actions: ControlAction[]; href: string; error?: string }) {
  const byFinding = new Map<number, ControlAction[]>();
  for (const action of actions) byFinding.set(action.finding_id, [...(byFinding.get(action.finding_id) ?? []), action]);
  return <section className="detail-card"><div className="control360-section-heading"><h2>الملاحظات والإجراءات</h2><Link href={href}>فتح السجل المرتبط بالضابط ←</Link></div>
    <p className="detail-hint">الملاحظات المشتركة المرتبطة بهذا الضابط ضمن صلاحياتك. فجوات التقييم السابقة تبقى مستقلة داخل بند التقييم.</p>
    {error ? <p role="alert">تعذر تحميل الملاحظات والإجراءات. أعد تحميل الصفحة.</p> : !rows.length ? <div className="control360-empty">لا توجد ملاحظات مرتبطة بهذا الضابط ضمن صلاحياتك.</div> :
      <div className="control360-table-wrap"><table className="workflow-table"><thead><tr><th>الملاحظة</th><th>الخطورة / الحالة</th><th>المالك</th><th>الاستحقاق</th><th>الإجراءات</th></tr></thead><tbody>{rows.map(row => {
        const linked = byFinding.get(row.id) ?? [];
        return <tr key={row.id}><td><Link href={`${href}&finding=${row.id}`}>{row.title}</Link><small dir="ltr">{row.reference_code}</small></td>
          <td>{severityLabels[row.severity]}<small>{findingStatusLabels[row.status]}</small></td>
          <td>{row.owner?.display_name ?? (row.owner_id ? 'الاسم غير متاح ضمن صلاحياتك' : 'غير معيّن')}</td><td>{formatComplianceDate(row.due_date)}</td>
          <td>{linked.length ? <>{linked.filter(action => action.status === 'completed').length} من {linked.length} مكتملة<small>{linked.filter(action => action.verification_status === 'accepted').length} تم التحقق منها</small></> : 'لا توجد إجراءات'}</td></tr>;
      })}</tbody></table></div>}
  </section>;
}

export function Control360Activity({ rows, canViewCentral, error }: { rows: ControlAuditEvent[]; canViewCentral: boolean; error?: string }) {
  return <section className="detail-card"><div className="control360-section-heading"><h2>النشاط الأخير</h2>{canViewCentral && <Link href="/audit">عرض سجل النشاط الكامل ←</Link>}</div>
    <p className="detail-hint">أحدث الأحداث المسجلة لهذا الضابط ضمن صلاحياتك؛ السجل الكامل محفوظ دون تغيير. تفاصيل أحداث الملاحظات والإجراءات متاحة للفريق المخوّل فقط.</p>
    {error ? <p role="alert">تعذر تحميل النشاط. أعد تحميل الصفحة.</p> : !rows.length ? <div className="control360-empty">لا توجد أحداث متاحة ضمن صلاحياتك.</div> :
      <ol className="detail-timeline">{rows.map(row => <li key={row.id}><strong>{controlEventLabel(row)}</strong><small>{row.actor_name || 'الاسم غير موثق'} · <time dateTime={row.occurred_at}>{formatComplianceDateTime(row.occurred_at)}</time></small></li>)}</ol>}
  </section>;
}
