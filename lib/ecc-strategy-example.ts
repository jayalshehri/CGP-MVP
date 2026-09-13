export const eccStrategyExample = {
  "1-1-1": {
    title: "إعداد واعتماد استراتيجية الأمن السيبراني",
    requirement:
      "تحديد وتوثيق واعتماد استراتيجية الأمن السيبراني للجهة، بدعم من رئيس الجهة أو من ينيبه، وبما يتماشى مع أهداف الجهة والمتطلبات ذات العلاقة.",
    internalSteps: [
      "تحليل سياق الجهة ومخاطرها والمتطلبات التنظيمية ذات العلاقة.",
      "صياغة الاستراتيجية وربط أهدافها بأهداف الجهة ومبادراتها.",
      "اعتماد الاستراتيجية من صاحب الصلاحية وتوثيق القرار.",
      "إعداد خارطة طريق ومسؤوليات ومؤشرات لمتابعة التنفيذ.",
    ],
  },
  "1-1-2": {
    title: "تنفيذ خطة عمل استراتيجية الأمن السيبراني",
    requirement:
      "إعداد وتنفيذ خطة عمل لتطبيق استراتيجية الأمن السيبراني ومتابعة مبادراتها ومسؤولياتها.",
    internalSteps: [
      "تحويل الاستراتيجية إلى مبادرات قابلة للقياس بمالكين ومواعيد استحقاق.",
      "تحديد الموارد والاعتمادات اللازمة لكل مبادرة.",
      "متابعة الإنجاز ومعالجة العوائق ورفع الحالة للإدارة المعنية.",
    ],
  },
  "1-1-3": {
    title: "المراجعة الدورية لاستراتيجية الأمن السيبراني",
    requirement:
      "مراجعة استراتيجية الأمن السيبراني ضمن فترات زمنية مخطط لها، وعند وجود تغييرات جوهرية أو متطلبات تنظيمية مؤثرة.",
    internalSteps: [
      "تحديد دورة مراجعة ومالك مسؤول عن تنفيذها.",
      "مراجعة التغييرات في المخاطر والأهداف والمتطلبات التنظيمية.",
      "توثيق نتائج المراجعة واعتماد التحديثات وإبلاغ الأطراف المعنية.",
    ],
  },
} as const;

export type EccStrategyCode = keyof typeof eccStrategyExample;

export function getEccStrategyExample(code: string) {
  return eccStrategyExample[code as EccStrategyCode];
}

export const eccOfficialControlsUrl =
  "https://cdn.nca.gov.sa/api/files/public/upload/072773cb-cdc0-439f-afaa-45fa42f17479_ECC-2-2024-AR-n.pdf";

export const eccImplementationGuideUrl =
  "https://cdn.nca.gov.sa/api/public/cms/files/1d3a5d95-3c0e-495f-8aa1-d7f288c5a856_Guide-to-Essential-Cybersecurity-Controls-Implementation-ar.pdf";
