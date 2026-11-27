import IndicatorDashboard from "./IndicatorDashboard";
import styles from "../nudee-dashboard/nudee-dashboard.module.css";

export const metadata = { title: "مؤشر نُضيء | مكتب إدارة البيانات" };

export default function IndicatorPage() {
  return <main className={styles.root} dir="rtl">
    <header className={styles.heading}>
      <div><h1>مؤشر نُضيء</h1><p>جاهزية الأدلة الداعمة للمؤشر الوطني للبيانات حسب المجال.</p></div>
    </header>
    <IndicatorDashboard />
  </main>;
}
