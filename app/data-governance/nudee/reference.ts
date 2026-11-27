export const governanceDomain = "حوكمة البيانات";
export const localLevels = ["المستوى 1: البناء", "المستوى 2: التعريف", "المستوى 3: التفعيل"];
export const sdaiaFramework = "https://sdaia.gov.sa/ar/Research/Documents/National-Data-Index_v1.0_AR.PDF";
export const frameworkCopy = "https://dmo.kku.edu.sa/sites/dmo.kku.edu.sa/files/2026-10/National-Data-Index_v1.0_AR.pdf";

export type EvidenceRequirement = {
  id: number; source_row: number; domain_name: string; standard_code: string; requirement_title: string;
  maturity_level: string; evidence_name: string; evidence_description: string | null; source_compliance: string | null;
  specification_code: string | null; responsible_department: string | null; planned_end: string | null;
};
