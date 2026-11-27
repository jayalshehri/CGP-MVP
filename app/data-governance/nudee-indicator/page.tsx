import IndicatorDashboard from "./IndicatorDashboard";
import styles from "../nudee-dashboard/nudee-dashboard.module.css";

import "../nudee/office-workspace.css";

export const metadata = { title: "مؤشر نُضيء | مكتب إدارة البيانات" };

export default function IndicatorPage() {
  return <main className={styles.root} dir="rtl">
    <header className="office-hero">
      <div><h1>مؤشر نُضيء</h1><p>تابع المجالات التي تحتاج تدخلك، وراجع نتائج الدورة من ملف التقييم.</p></div>
    </header>
    <IndicatorDashboard />
  </main>;
}
