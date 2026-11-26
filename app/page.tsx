import Link from "next/link";
import styles from "./portal.module.css";

export const metadata = { title: "بوابة الحوكمة | CGP" };

export default function Portal() {
  return (
    <main className={styles.portal} dir="rtl">
      <div className={styles.canvas}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.wordmark} lang="en">CGP</span>
            <h1>بوابة الحوكمة</h1>
          </div>
          <div aria-hidden="true" className={styles.architecture}>
            {Array.from({ length: 9 }, (_, level) => (
              <i key={level} style={{ inset: level * 12 }} />
            ))}
          </div>
        </header>
        <nav className={styles.cards} aria-label="مداخل الإدارات">
          <Link href="/login/data" className={styles.card} aria-labelledby="data-title">
            <div className={styles.cardTop}>
              <span className={styles.symbol} aria-hidden="true"><span className={styles.layers} /></span>
              <span className={styles.arrow} aria-hidden="true">←</span>
            </div>
            <h2 id="data-title">مكتب إدارة البيانات</h2>
            <p>إسناد متطلبات نُضيء، مراجعة الأدلة، ومتابعة نتائج المؤشر.</p>
            <span className={styles.action}>دخول مكتب البيانات</span>
          </Link>
          <Link href="/login/cyber" className={styles.card} aria-labelledby="cyber-title">
            <div className={styles.cardTop}>
              <span className={styles.symbol} aria-hidden="true"><span className={styles.shield}>✓</span></span>
              <span className={styles.arrow} aria-hidden="true">←</span>
            </div>
            <h2 id="cyber-title">إدارة الأمن السيبراني</h2>
            <p>متابعة الضوابط والمخاطر والمشاريع السيبرانية وقياس الالتزام.</p>
            <span className={styles.action}>دخول الأمن السيبراني</span>
          </Link>
        </nav>
      </div>
    </main>
  );
}
