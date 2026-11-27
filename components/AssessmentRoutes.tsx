import { notFound, redirect } from 'next/navigation';
import AssessmentWorkspace from '@/components/AssessmentWorkspace';
import { assessmentCycleHref, assessmentCycleId, compactAssessmentFrameworks, type CompactAssessmentCode } from '@/lib/assessment-navigation';

export function assessmentIndexPage(code: CompactAssessmentCode) {
  return async function Page({ searchParams }: { searchParams: Promise<{ cycle?: string | string[] }> }) {
    const { cycle } = await searchParams;
    const id = typeof cycle === 'string' ? assessmentCycleId(cycle) : null;
    if (id !== null) redirect(assessmentCycleHref(compactAssessmentFrameworks[code], id));
    return <AssessmentWorkspace key={`${code}-index`} frameworkCode={code}/>;
  };
}

export function assessmentCyclePage(code: CompactAssessmentCode) {
  return async function Page({ params }: { params: Promise<{ cycleId: string }> }) {
    const id = assessmentCycleId((await params).cycleId);
    if (id === null) notFound();
    return <AssessmentWorkspace key={`${code}-${id}`} frameworkCode={code} requestedCycle={id}/>;
  };
}
