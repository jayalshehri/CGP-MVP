import { notFound } from 'next/navigation';
import AssessmentWorkspace from '@/components/AssessmentWorkspace';
import { dccCycleId } from '@/lib/dcc-assessment-navigation';

export default async function Page({ params }: { params: Promise<{ cycleId: string }> }) {
  const id = dccCycleId((await params).cycleId);
  if (id === null) notFound();
  return <AssessmentWorkspace key={id} frameworkCode="DCC" requestedCycle={id}/>;
}
