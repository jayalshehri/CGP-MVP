// Arabic counted-noun phrases following the CLDR Arabic plural categories
// (Intl.PluralRules "ar"): 0 zero, 1 one, 2 two, 3–10 few, 11–99 many, 100+ other.
export type CountForms = {
  zero: string;   // "0 مشروع"
  one: string;    // "مشروع واحد"
  two: string;    // "مشروعان"
  few: string;    // "{n} مشاريع"
  many: string;   // "{n} مشروعًا"
  other: string;  // "{n} مشروع"
};

const rules = new Intl.PluralRules("ar");

export function arabicCount(n: number, forms: CountForms): string {
  const category = rules.select(n) as keyof CountForms;
  return (forms[category] ?? forms.other).replace("{n}", String(n));
}

export const projectForms: CountForms = {
  zero: "0 مشروع", one: "مشروع واحد", two: "مشروعان", few: "{n} مشاريع", many: "{n} مشروعًا", other: "{n} مشروع",
};
export const projectCount = (n: number) => arabicCount(n, projectForms);
