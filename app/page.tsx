import Link from "next/link";
import { GatewayMark, WorkspaceSeal } from "@/components/GatewayIdentity";
import styles from "./portal.module.css";

export const metadata = { title: "بوابة الحوكمة | CGP" };

const offices = [
  { workspace: "data", title: "مكتب إدارة البيانات", description: "متابعة متطلبات نُضيء وأدلتها." },
  { workspace: "cyber", title: "إدارة الأمن السيبراني", description: "متابعة الضوابط والمخاطر والالتزام." },
] as const;

export default function Portal() {
  return (
    <main className={styles.portal} dir="rtl">
      <div className={styles.mast}><GatewayMark /></div>
      <section className={styles.center} aria-labelledby="gateway-title">
        <header className={styles.heading}>
          <h1 id="gateway-title">بوابة الحوكمة</h1>
          <span className={styles.flourish} aria-hidden="true"><i /></span>
        </header>
        <nav className={styles.gates} aria-label="مداخل الإدارات">
          {offices.map(({ workspace, title, description }) => (
            <Link key={workspace} href={`/login/${workspace}`} className={styles.gate}
              aria-labelledby={`title-${workspace}`} aria-describedby={`desc-${workspace}`}>
              <WorkspaceSeal workspace={workspace} />
              <h2 id={`title-${workspace}`}>{title}</h2>
              <p id={`desc-${workspace}`}>{description}</p>
              <span className={styles.enter}>الدخول<span aria-hidden="true">←</span></span>
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}
