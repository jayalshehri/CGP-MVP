import type { WorkspaceName } from "@/lib/workspaces";
import styles from "@/app/portal.module.css";

export function GatewayMark() {
  return <span dir="ltr" lang="en" className={styles.wordmark}>CGP<i aria-hidden="true" /></span>;
}

export function WorkspaceSeal({ workspace }: { workspace: WorkspaceName }) {
  return (
    <span className={styles.seal} aria-hidden="true">
      <svg width="29" height="29" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
        {workspace === "data" ? <>
          <path d="m3.5 10 12.5-6 12.5 6L16 16z" />
          <path d="m3.5 16 12.5 6 12.5-6M3.5 22l12.5 6 12.5-6" />
        </> : <>
          <path d="M16 3.5c3.7 2.2 7.4 3.5 11.2 4v8.4c0 5.7-5.2 10-11.2 13-6-3-11.2-7.3-11.2-13V7.5c3.8-.5 7.5-1.8 11.2-4Z" />
          <path d="m11.2 15.8 3.2 3.2 6.5-7" />
        </>}
      </svg>
    </span>
  );
}
