import { frameworkCopy, sdaiaFramework } from "./reference";

export default function SourceReference() {
  return <details className="nr-reference">
    <summary>مرجع القياس ونطاق التغطية</summary>
    <p>المرجع هو المؤشر الوطني للبيانات «نُضيء» الصادر عن الهيئة السعودية للبيانات والذكاء الاصطناعي (سدايا)، الإصدار 1.0. يغطي سجل المكتب الحالي أدلة مستويات البناء والتعريف والتفعيل. تعبّر الجاهزية عن مراجعة المكتب للأدلة المسجلة.</p>
    <a href={sdaiaFramework} target="_blank" rel="noreferrer">وثيقة سدايا</a>{" · "}
    <a href={frameworkCopy} target="_blank" rel="noreferrer">نسخة الوثيقة لدى جامعة الملك خالد</a>
  </details>;
}
