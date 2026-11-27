export const compactAssessmentFrameworks = {
  DCC: {
    code: 'DCC',
    title: 'ضوابط الأمن السيبراني للبيانات',
    version: '1-2022',
    path: '/dcc-assessment',
    measurementTool: 'https://cdn.nca.gov.sa/api/files/public/upload/5b7a98b4-a66f-43bd-95fd-ae8da5ef1c96_DCC_Assessment_and_Compliance_Tool_V1.0xlsx.xlsx',
  },
  TCC: {
    code: 'TCC',
    title: 'ضوابط الأمن السيبراني للعمل عن بعد',
    version: '1-2021',
    path: '/tcc-assessment',
    measurementTool: 'https://nca.gov.sa/NCA_TCC-1-2021_Assessment_and_Compliance_Tool_v2.0.xlsx',
  },
  OSMACC: {
    code: 'OSMACC',
    title: 'ضوابط الأمن السيبراني لحسابات التواصل الاجتماعي',
    version: '1-2021',
    path: '/osmacc-assessment',
    measurementTool: 'https://nca.gov.sa/osmacc_assessment_and_compliance_tool_v1.0.xlsx',
  },
} as const;

export type CompactAssessmentCode = keyof typeof compactAssessmentFrameworks;
export type CompactAssessmentFramework = (typeof compactAssessmentFrameworks)[CompactAssessmentCode];

export function compactAssessmentFramework(code: string): CompactAssessmentFramework | undefined {
  return Object.hasOwn(compactAssessmentFrameworks, code) ? compactAssessmentFrameworks[code as CompactAssessmentCode] : undefined;
}

export function compactAssessmentForPath(pathname: string) {
  return Object.values(compactAssessmentFrameworks).find(framework => pathname === framework.path || pathname.startsWith(framework.path + '/'));
}

export const assessmentCatalogHref = (code: CompactAssessmentCode) => `/controls?framework=${code}`;
export const assessmentCycleHref = (framework: CompactAssessmentFramework, id: number) => `${framework.path}/${id}`;

export function assessmentCycleId(value: string) {
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id) ? id : null;
}

export const assessmentStageLabels = ['تجهيز النطاق', 'التقييم والأدلة', 'المراجعة', 'الاعتماد'] as const;

export function assessmentStage(status: string) {
  switch (status) {
    case 'draft': return 0;
    case 'in_progress':
    case 'evidence_collection': return 1;
    case 'under_review': return 2;
    case 'completed':
    case 'approved':
    case 'closed': return 3;
    default: return -1;
  }
}

export function latestAssessmentCycle<T extends { id: number; status: string; imported: boolean }>(cycles: T[]) {
  const latest = [...cycles].sort((a, b) => b.id - a.id);
  return latest.find(cycle => !cycle.imported && !['approved', 'closed'].includes(cycle.status))
    ?? latest.find(cycle => ['approved', 'closed'].includes(cycle.status))
    ?? latest[0];
}
