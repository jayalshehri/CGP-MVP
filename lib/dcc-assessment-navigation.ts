export const dccCatalogHref = "/controls?framework=DCC";
export const dccAssessmentsHref = "/dcc-assessment";
export const dccCycleHref = (id: number) => `${dccAssessmentsHref}/${id}`;
export const dccMeasurementTool =
  "https://cdn.nca.gov.sa/api/files/public/upload/5b7a98b4-a66f-43bd-95fd-ae8da5ef1c96_DCC_Assessment_and_Compliance_Tool_V1.0xlsx.xlsx";

export function dccCycleId(value: string) {
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id) ? id : null;
}

export const dccStageLabels = ["تجهيز النطاق", "التقييم والأدلة", "المراجعة", "الاعتماد"] as const;
export function dccStage(status: string) {
  switch (status) {
    case "draft": return 0;
    case "in_progress":
    case "evidence_collection": return 1;
    case "under_review": return 2;
    case "completed":
    case "approved":
    case "closed": return 3;
    default: return -1;
  }
}

export function latestDccCycle<T extends { id: number; status: string; imported: boolean }>(cycles: T[]) {
  const latest = [...cycles].sort((a, b) => b.id - a.id);
  return latest.find(cycle => !cycle.imported && !["approved", "closed"].includes(cycle.status))
    ?? latest.find(cycle => ["approved", "closed"].includes(cycle.status))
    ?? latest[0];
}
