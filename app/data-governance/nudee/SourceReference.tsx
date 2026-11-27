import { frameworkCopy, sdaiaFramework } from "./reference";

export default function SourceReference() {
  return <details className="nr-reference">
    <summary>مرجع القياس ونطاق التغطية</summary>
    <p>المرجع هو المؤشر الوطني للبيانات «نُضيء» الصادر عن الهيئة السعودية للبيانات والذكاء الاصطناعي (سدايا)، الإصدار ١٫١ (نوفمبر ٢٠٢٤). يشمل القياس ٤٢ سؤالًا في ١٤ مجالًا. يبدأ السلم بغياب القدرات (٠)، ثم البناء والتعريف والتفعيل والتمكّن والريادة (١–٥). تعبّر الجاهزية عن مراجعة المكتب للأدلة المسجلة.</p>
    <a href={sdaiaFramework} target="_blank" rel="noreferrer">وثيقة سدايا</a>{" · "}
    <a href={frameworkCopy} target="_blank" rel="noreferrer">نسخة الوثيقة لدى جامعة الملك خالد</a>
  </details>;
}
