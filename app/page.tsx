import Link from "next/link";
import styles from "./portal.module.css";

export const metadata = { title: "بوابة الحوكمة | CGP" };

export default function Portal() {
  return <main className={styles.portal} dir="rtl">
    <section aria-labelledby="workspace-title">
      <header><span lang="en">CGP</span></header>
      <h1 id="workspace-title">بوابة الحوكمة</h1>
      <div className={styles.cards}>
        <Link href="/login/data">
          <h2>مكتب إدارة البيانات</h2>
          <p>متابعة متطلبات مؤشر نُضيء وإسنادها ومراجعة الأدلة.</p>
          <strong>دخول مكتب البيانات ←</strong>
        </Link>
        <Link href="/login/cyber">
          <h2>إدارة الأمن السيبراني</h2>
          <p>متابعة الالتزام بالضوابط والمخاطر والمشاريع السيبرانية.</p>
          <strong>دخول الأمن السيبراني ←</strong>
        </Link>
      </div>
    </section>
  </main>;
}
