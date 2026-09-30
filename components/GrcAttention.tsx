'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { requireProfile } from '@/lib/auth';
import { controlHref } from '@/lib/control360';
import { requestLabels, todayRiyadh, formatComplianceDate } from '@/lib/grc';
import { loadWorkRequests, requestAction, workQueueSummary, type QueueActor, type WorkRequest } from '@/lib/grc-work-queue';
import './grc-attention.css';

type Props = { controlId?: number; frameworkCode?: string; returnContext?: string; compact?: boolean };

export default function GrcAttention({ controlId, frameworkCode, returnContext = '', compact = false }: Props) {
 const [state, setState] = useState<{ requests: WorkRequest[]; actor: QueueActor; error: string } | null>(null);
 useEffect(() => {
  let live = true;
  async function load() {
   try {
    const { user, profile } = await requireProfile();
    const requests = await loadWorkRequests(controlId, frameworkCode);
    if (live) setState({ requests, actor: { id: user.id, role: profile.role }, error: '' });
   } catch (cause) {
    if (live) setState({ requests: [], actor: { id: '', role: 'nca_external_auditor' }, error: cause instanceof Error ? cause.message : 'تعذر تحميل الطلبات.' });
   }
  }
  void load();
  return () => { live = false; };
 }, [controlId, frameworkCode]);
 if (!state) return <p role="status">جاري تحميل قائمة العمل…</p>;
 if (state.error) return <p role="alert">تعذر تحميل قائمة العمل: {state.error}</p>;
 return <GrcWorkQueue requests={state.requests} actor={state.actor} compact={compact} returnContext={returnContext}/>;
}

export function GrcWorkQueue({ requests, actor, compact = false, returnContext = '' }: { requests: WorkRequest[]; actor: QueueActor; compact?: boolean; returnContext?: string }) {
 const [page, setPage] = useState(0);
 const today = todayRiyadh();
 const summary = workQueueSummary(requests, actor, today);
 const pageSize = compact ? 5 : 10;
 const pages = Math.max(1, Math.ceil(requests.length / pageSize));
 const currentPage = Math.min(page, pages - 1);
 const visible = requests.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
 return <section className="grc-work-queue" dir="rtl">
  <header><h2>طلبات الأدلة والمراجعات المطلوبة</h2><p>الطلبات ضمن صلاحياتك، مرتبة حسب الاستحقاق. المؤشرات تخص الطلبات المسندة إليك وتتطلب إجراءً منك.</p></header>
  {summary.required > 0 ? <div className="grc-queue-summary" aria-label="ملخص طلباتك">
   <span>مطلوب مني الآن <b>{summary.required}</b></span>
   <span>متأخر <b>{summary.overdue}</b></span>
   <span>خلال 30 يوم <b>{summary.dueSoon}</b></span>
  </div> : <p className="grc-queue-empty">لا توجد طلبات تتطلب إجراءً منك حاليًا.</p>}
  {visible.length > 0 && <div className="grc-queue-scroll" role="region" aria-label="قائمة طلبات الأدلة" tabIndex={0}>
   <table className="grc-queue-table"><caption>طلبات الأدلة لدورات المراجعة الدورية المفتوحة</caption><thead><tr>
    <th scope="col">الضابط</th><th scope="col">نوع الطلب</th><th scope="col">الحالة</th><th scope="col">الاستحقاق</th><th scope="col">الإجراء</th>
   </tr></thead><tbody>{visible.map(request => {
    const action = requestAction(request, actor, returnContext);
    const overdue = request.due_date < today;
    return <tr key={request.id}>
     <td className="grc-queue-control"><Link href={controlHref(request.control_id, returnContext)} title={request.control_title}><strong dir="ltr">{request.framework_code} · {request.control_code}</strong><span>{request.control_title}</span></Link>
      <details><summary>تفاصيل الطلب</summary><p>{request.requirement}</p><small>طلب #{request.id} · دورة مراجعة #{request.cycle_id}</small></details>
     </td>
     <td>مراجعة دورية</td>
     <td><span className={`grc-queue-status ${request.status === 'submitted' ? 'submitted' : ''}`}>{requestLabels[request.status] ?? request.status}</span></td>
     <td><time dateTime={request.due_date} dir="ltr">{formatComplianceDate(request.due_date, true)}</time>{overdue && <small className="grc-queue-overdue">متأخر</small>}</td>
     <td>{action ? <Link className="workflow-button workflow-primary" href={action.href}>{action.label}</Link> : <span className="grc-queue-waiting">{request.status === 'submitted' ? 'بانتظار المراجع المكلّف' : 'بانتظار المالك المكلّف'}</span>}</td>
    </tr>;
   })}</tbody></table>
  </div>}
  {pages > 1 && <nav className="grc-queue-pages" aria-label="صفحات قائمة العمل"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>السابق</button><span>صفحة {currentPage + 1} من {pages} · {requests.length} طلبًا</span><button disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>التالي</button></nav>}
 </section>;
}
