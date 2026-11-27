import { redirect } from 'next/navigation';
import AssessmentWorkspace from '@/components/AssessmentWorkspace';
import { dccCycleHref, dccCycleId } from '@/lib/dcc-assessment-navigation';

export default async function Page({ searchParams }: { searchParams: Promise<{ cycle?: string | string[] }> }) {
  const { cycle } = await searchParams;
  const id = typeof cycle === 'string' ? dccCycleId(cycle) : null;
  if (id !== null) redirect(dccCycleHref(id));
  return <AssessmentWorkspace key="dcc-index" frameworkCode="DCC"/>;
}
