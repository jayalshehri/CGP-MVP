// Suggested implementation aids; the original requirement remains authoritative.
export function controlPlan(code: string, description: string) {
  const normalize = (s: string) => s.replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
  const tokens = [...description.matchAll(/[٠-٩0-9]+(?:\s*[-–]\s*[٠-٩0-9]+){3}/g)]
    .filter(m => normalize(m[0]).replace(/\s/g, '').startsWith(code + '-'));
  const requirements = tokens.map((m, index) => ({
    key: normalize(m[0]).replace(/\s/g, ''),
    text: description.slice(m.index! + m[0].length, tokens[index + 1]?.index ?? description.length).trim(),
  }));
  const steps = code === '1-1-1' ? [
    {key:'context', text:'تحليل سياق الجهة والمخاطر والمتطلبات المرتبطة بإستراتيجية الأمن السيبراني.'},
    {key:'strategy', text:'إعداد وثيقة الإستراتيجية وربط أهدافها بأهداف الجهة والمتطلبات ذات العلاقة.'},
    {key:'approval', text:'توثيق اعتماد رئيس الجهة أو من ينيبه ودعمه للإستراتيجية.'},
    {key:'roadmap', text:'إعداد خارطة طريق للمبادرات والمسؤوليات ومؤشرات المتابعة.'},
  ] : requirements.length ? requirements : [
    {key:'scope', text:'تحديد نطاق تطبيق المتطلب والأصول والجهات المعنية به.'},
    {key:'implement', text:description},
    {key:'evidence', text:'توثيق ما نُفذ وإرفاق الأدلة التي تثبت استيفاء المتطلب.'},
    {key:'review', text:'مراجعة اكتمال التنفيذ ومعالجة الملاحظات قبل تقديم الدليل للاعتماد.'},
  ];
  const evidence = code === '1-1-1' ? ['وثيقة إستراتيجية الأمن السيبراني المعتمدة والسارية.', 'خطاب أو محضر اعتماد صاحب الصلاحية.', 'خارطة طريق المبادرات والمسؤوليات ومؤشرات المتابعة.'] :
    /مراجعة|دوري/.test(description) ? ['سجل المراجعة موضحًا التاريخ والنطاق والنتائج.', 'سجل معالجة الملاحظات وإثبات إغلاقها.'] :
    /تحديد وتوثيق|اعتماد|سياس/.test(description) ? ['وثيقة تغطي متطلبات الضابط ونطاقه ومسؤولياته.', 'إثبات الاعتماد والتعميم عند اشتراطهما في المتطلب.'] :
    ['سجلات أو تقارير أو إعدادات تثبت تنفيذ المتطلب في نطاقه.', 'نتائج التحقق من التنفيذ ومعالجة الملاحظات.'];
  return {requirements, steps, evidence};
}
