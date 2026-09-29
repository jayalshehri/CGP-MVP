import { workTypeLabels, type CategoryResult, type ReviewWorkItem, type WorkType } from './review-work-queue';

// Preview-only presentation fixtures. No database IDs, route targets or commands are used.
const mockRoute = '/review/qa-b53-visual';
const longReference = 'P2B53-VISUAL-MOCK-DCC-FINDING-2026-0000000000000031';
const longTitle = 'التحقق المستقل من معالجة الملاحظة المرتبطة بإجراءات حماية البيانات والتأكد من اكتمال الأدلة لجميع الوحدات التنظيمية والأنظمة المشمولة بالنطاق';

function item(type: WorkType, sourceId: number, fields: Partial<ReviewWorkItem>): ReviewWorkItem {
  return {
    key: `${type}:visual-${sourceId}`, type, sourceId,
    sourceModel: 'grc_findings', framework: 'DCC', controlId: 900007, controlCode: 'DCC-MOCK-7',
    itemId: null, cycleId: null, title: `${longReference} — ${longTitle}`, state: 'pending',
    responsibility: 'independent_team', assignee: null, dueDate: '2020-01-01',
    ownerLabel: 'مالك تجريبي', reviewerLabel: 'فريق تحقق مستقل', severityLabel: 'عالية',
    sourceRoute: mockRoute, returnContext: 'review', actionLabel: 'فتح السجل',
    reason: 'محاكاة لعمل متاح لفريق مستقل؛ لا يوجد سجل أعمال فعلي.',
    ...fields,
  };
}

export type B53VisualScenario = 'populated' | 'zero' | 'unavailable';

export function b53VisualCategories(scenario: B53VisualScenario, actorId: string): CategoryResult[] {
  const categories: CategoryResult[] = (Object.keys(workTypeLabels) as WorkType[]).map(type => ({
    type, status: 'ready', error: null, items: [],
  }));
  if (scenario === 'zero') return categories;
  if (scenario === 'unavailable') {
    const category = categories.find(row => row.type === 'FINDING_VERIFICATION')!;
    category.status = 'unavailable';
    category.error = 'محاكاة فشل قراءة؛ ليست نتيجة صفرية.';
    return categories;
  }
  const rows = [
    item('CORRECTIVE_ACTION_VERIFICATION', 900901, {
      sourceModel: 'grc_corrective_actions', title: `إجراء تجريبي — ${longTitle}`,
      actionLabel: 'فتح تحقق الإجراء', state: 'pending',
      reason: 'إجراء مكتمل؛ متاح لفريق تحقق مستقل.',
    }),
    item('FINDING_VERIFICATION', 900302, {
      actionLabel: 'فتح تحقق الملاحظة', state: 'pending', dueDate: '2099-10-21',
      reason: 'إجراءات تجريبية مقبولة؛ التحقق مستقل.',
    }),
    item('FINDING_CLOSURE', 900303, {
      actionLabel: 'فتح قرار الإغلاق', state: 'accepted', dueDate: null,
      responsibility: 'assigned', assignee: actorId, reviewerLabel: 'أنت',
      reason: 'أنت المتحقق المسجل؛ الإغلاق قرار صريح منفصل.',
    }),
    item('PERIODIC_REVIEW_FOLLOWUP', 900011, {
      sourceModel: 'control_review_cycles', framework: 'ECC', controlCode: 'ECC-MOCK-11',
      title: 'مراجعة دورية تجريبية #900011', state: 'open', cycleId: 900011,
      responsibility: 'assigned', assignee: actorId, reviewerLabel: 'أنت',
      severityLabel: undefined, actionLabel: 'متابعة المراجعة الدورية',
      reason: 'أنت المراجع المكلّف بدورة تجريبية مستحقة.',
    }),
  ];
  for (const row of rows) categories.find(category => category.type === row.type)!.items.push(row);
  return categories;
}
