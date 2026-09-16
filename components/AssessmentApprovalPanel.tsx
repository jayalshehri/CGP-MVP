import Link from 'next/link';
/** Compatibility boundary: assessment approval is exclusively server-validated. */
export function AssessmentApprovalPanel(){return <section className="assessment-approval"><h2>اعتماد التقييم</h2><p>اعتماد النتائج متاح ضمن دورة التقييم بعد مراجعة المتطلبات والأدلة.</p><Link href="/assessments">فتح دورات قياس الالتزام</Link></section>;}
