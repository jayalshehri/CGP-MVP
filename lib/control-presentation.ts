import { getEccCatalogLabel } from './ecc-catalog-labels';

export function controlHeading(frameworkCode: string, code: string, title: string) {
  const officialLabel = frameworkCode === 'ECC' ? getEccCatalogLabel(code) : undefined;
  const shortTitle = title.replace(/\s+[-–—]\s+[\d٠-٩-]+\s*$/, '').trim();
  if (officialLabel) return officialLabel;
  if (!shortTitle) return 'تفاصيل الضابط';
  if (shortTitle.length <= 88) return shortTitle;
  const brief = shortTitle.slice(0, 84).replace(/\s+\S*$/, '').trim();
  return `${brief || shortTitle.slice(0, 84)}…`;
}

export function controlFrameworkLabel(code: string, version?: string | null) {
  if (!version) return code;
  return /^\d+-\d{4}$/.test(version) ? `${code}-${version.replace('-', ':')}` : `${code} ${version}`;
}

type ActionInput = { archived?: boolean; implementation: string; evidence: string; verification: string };
export function controlFollowUp({ archived, implementation, evidence, verification }: ActionInput) {
  if (archived) return 'archive';
  if (implementation === 'not_applicable') return 'record';
  if (['not_uploaded', 'rejected', 'expired', 'changes_requested'].includes(evidence)) return 'evidence';
  if (['uploaded', 'pending_review', 'under_review', 'submitted'].includes(evidence)) return 'evidence_review';
  if (!['verified', 'approved', 'accepted', 'compliant'].includes(verification)) return 'verification';
  return 'periodic';
}

export const followUpText: Record<ReturnType<typeof controlFollowUp>, string> = {
  archive: 'عرض السجل التاريخي',
  record: 'مراجعة قرار عدم الانطباق',
  evidence: 'استكمال الدليل',
  evidence_review: 'مراجعة الدليل',
  verification: 'التحقق من التطبيق',
  periodic: 'مراجعة دورية',
};
