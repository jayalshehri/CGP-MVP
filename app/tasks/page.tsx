"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DailyOperationsTabs from "@/components/DailyOperationsTabs";
import StatusBadge from "@/components/StatusBadge";
import { WorkflowHeading, WorkflowMetric } from "@/components/WorkflowUI";
import { requireProfile, type UserRole } from "@/lib/auth";
import { frameworkOf } from "@/lib/compliance";
import { controlHeading } from "@/lib/control-presentation";
import { riyadhIsoDate } from "@/lib/dates";
import { isOperationalControl, matchesTaskFilter, parseTaskFilter, taskFilters, type TaskFilter } from "@/lib/operations-followup";
import { supabase } from "@/lib/supabase";
import styles from "./tasks.module.css";

type ControlTask = {
  id: number; control_code: string; title_ar: string; domain_ar: string; implementation_status: string;
  evidence_status: string; due_date: string | null; control_owner_id: string | null; control_owner: string | null; frameworks: unknown;
};

const filterLabels: Record<TaskFilter, string> = {
  all: "الكل", pending: "تنفيذ غير مكتمل", overdue: "متأخرة", evidence: "أدلة تحتاج استكمالًا",
  unassigned: "بلا مالك", done: "مكتملة التنفيذ", progress: "قيد العمل", due: "استحقاق غير محدد",
};
const pageSize = 25;

export default function TasksPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [role, setRole] = useState<UserRole>("control_owner");
  const [tasks, setTasks] = useState<ControlTask[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("pending");
  const [framework, setFramework] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const { user, profile } = await requireProfile();
        if (!live) return;
        setRole(profile.role);
        const params = new URLSearchParams(window.location.search);
        setFilter(parseTaskFilter(params.get("filter")));
        setFramework(params.get("framework") || "all");
        let query = supabase.from("controls").select("id,control_code,title_ar,domain_ar,implementation_status,evidence_status,due_date,control_owner_id,control_owner,frameworks!inner(code,name_ar,is_active)").eq("frameworks.is_active", true).order("due_date", { ascending: true, nullsFirst: false }).order("id");
        if (profile.role === "control_owner") query = query.eq("control_owner_id", user.id);
        const { data, error: controlsError } = await query;
        if (controlsError) throw controlsError;
        if (live) setTasks(((data ?? []) as ControlTask[]).filter(isOperationalControl));
      } catch (loadError) {
        if (!live) return;
        const message = loadError instanceof Error ? loadError.message : "تعذر تحميل التكليفات";
        if (message.includes("تسجيل الدخول")) { router.replace("/login"); return; }
        setError(message);
      } finally { if (live) setLoading(false); }
    }
    void load();
    return () => { live = false; };
  }, [router]);

  const today = riyadhIsoDate();
  const team = role === "admin" || role === "cybersecurity_team";
  const frameworks = useMemo(() => [...new Set(tasks.map(task => frameworkOf(task.frameworks).code))].filter(code => code !== "—").sort(), [tasks]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter(task => {
      const { code } = frameworkOf(task.frameworks);
      const searchable = `${code} ${task.control_code} ${controlHeading(code, task.control_code, task.title_ar)} ${task.title_ar} ${task.domain_ar} ${task.control_owner ?? ""}`;
      return (framework === "all" || code === framework) && matchesTaskFilter(task, filter, today) && (!query || searchable.toLowerCase().includes(query));
    });
  }, [tasks, search, filter, framework, today]);
  const count = (key: TaskFilter) => tasks.filter(task => matchesTaskFilter(task, key, today)).length;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const setTaskFilter = (value: TaskFilter) => { setPage(1); setFilter(value); };

  if (loading) return <main className="workflow-page" dir="rtl" role="status">جاري تحميل التكليفات…</main>;
  const overdue = count("overdue"), evidence = count("evidence");
  return (
    <main className="workflow-page" dir="rtl">
      <WorkflowHeading title={team ? "المتابعة اليومية" : role === "control_owner" ? "مهامي" : "التكليفات"} description={team ? "تابع التكليفات والتنبيهات التي تتطلب إجراءً." : "تابع حالة الضوابط واستحقاقاتها والأدلة المطلوبة."} action={<Link className="workflow-button" href="/controls">سجل الضوابط ←</Link>} />
      {team && <DailyOperationsTabs current="tasks" />}
      {error ? <p className="cgp-shell-error" role="alert">{error} <button className="workflow-button" onClick={() => window.location.reload()}>إعادة المحاولة</button></p> : <>
        <div className="workflow-metrics">
          <WorkflowMetric label="الضوابط المنطبقة" value={tasks.length} />
          <WorkflowMetric label="مكتملة التنفيذ" value={count("done")} tone="success" />
          <WorkflowMetric label="أدلة تحتاج استكمالًا" value={evidence} tone={evidence ? "warning" : "neutral"} />
          <WorkflowMetric label="تكليفات متأخرة" value={overdue} tone={overdue ? "danger" : "neutral"} />
        </div>
        <section className="workflow-filter" aria-label="تصفية التكليفات">
          <div className={styles.filters}>
            <label>البحث<input type="search" value={search} onChange={event => { setPage(1); setSearch(event.target.value); }} placeholder="رقم الضابط أو عنوانه" /></label>
            <label>الإطار التنظيمي<select value={framework} onChange={event => { setPage(1); setFramework(event.target.value); }}><option value="all">جميع الأطر</option>{frameworks.map(code => <option key={code}>{code}</option>)}</select></label>
            <label>عرض التكليفات<select value={filter} onChange={event => setTaskFilter(parseTaskFilter(event.target.value))}>{taskFilters.filter(key => key !== "unassigned" || team || filter === key).map(key => <option key={key} value={key}>{filterLabels[key]}</option>)}</select></label>
          </div>
        </section>
        <p className={styles.results} role="status">{filtered.length ? `عرض ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} من ${filtered.length} تكليف` : "لا توجد نتائج مطابقة"}</p>
        {visible.length === 0 ? <div className="workflow-empty">لا توجد تكليفات ضمن هذه التصفية.</div> : <ul className={styles.list} aria-label="التكليفات">
          {visible.map(task => {
            const { code } = frameworkOf(task.frameworks);
            return (
              <li className={`${styles.row} workflow-row`} key={task.id}>
                <div><bdi className={styles.code}>{code} · {task.control_code}</bdi><Link className={styles.title} href={`/controls/${task.id}`}>{controlHeading(code, task.control_code, task.title_ar)}</Link>{team && task.control_owner && <small>{task.control_owner}</small>}</div>
                <div><small>التنفيذ</small><StatusBadge status={task.implementation_status} /></div>
                <div><small>الدليل</small><StatusBadge status={task.evidence_status} /></div>
                <div><small>الاستحقاق</small><span className={matchesTaskFilter(task, "overdue", today) ? styles.overdue : undefined} dir={task.due_date ? "ltr" : undefined}>{task.due_date ?? "غير محدد"}</span></div>
                {team && filter === "unassigned" && <Link className="workflow-button" href={`/controls/${task.id}/assign`}>تعيين المالك ←</Link>}
              </li>
            );
          })}
        </ul>}
        {pageCount > 1 && <nav className="cgp-pagination" aria-label="صفحات التكليفات"><button type="button" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>السابق</button><span>صفحة {page} من {pageCount}</span><button type="button" disabled={page === pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>التالي</button></nav>}
      </>}
    </main>
  );
}
