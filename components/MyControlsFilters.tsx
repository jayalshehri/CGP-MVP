'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { myControlsFilters } from '@/lib/my-controls-context';

const extraFilters = [['attention', 'يحتاج إجراء'], ['evidence', 'يحتاج دليل'], ['assessment', 'يحتاج استكمال تقييم'], ['findings', 'ملاحظات/إجراءات مفتوحة'], ['overdue', 'متأخر']] as const;

export function MyControlsFilters({ context, frameworkCodes, onFilter, onReset }: {
  context: string; frameworkCodes: string[];
  onFilter: (key: string, value: string) => void; onReset: () => void;
}) {
  const filters = myControlsFilters(context);
  const active = extraFilters.filter(([key]) => filters.get(key) === '1');
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    anchor.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !anchor.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <section className="my-controls-filters" aria-label="تصفية ضوابطي">
    <label>البحث<input type="search" value={filters.get('q') ?? ''} placeholder="رمز الضابط أو عنوانه" onChange={event => onFilter('q', event.target.value)}/></label>
    <label>الإطار<select value={filters.get('framework') ?? ''} onChange={event => onFilter('framework', event.target.value)}><option value="">كل أطر ضوابطي</option>{frameworkCodes.map(code => <option key={code}>{code}</option>)}</select></label>
    <label>حالة التنفيذ<select value={filters.get('status') ?? ''} onChange={event => onFilter('status', event.target.value)}><option value="">الكل</option><option value="implemented">مطبق</option><option value="in_progress">قيد التنفيذ</option><option value="not_started">لم يبدأ</option><option value="not_applicable">لا ينطبق</option></select></label>
    <div className="my-controls-more" ref={anchor} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button type="button" ref={trigger} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen(value => !value)}>
        <span aria-hidden="true">⚙</span> المزيد من الفلاتر{active.length > 0 && <small> ({active.length})</small>}
      </button>
      {open && <div className="my-controls-toggles" id={panelId} role="group" aria-label="الفلاتر الإضافية">
        {extraFilters.map(([key, label]) => <label key={key}><input type="checkbox" checked={filters.get(key) === '1'} onChange={event => onFilter(key, event.target.checked ? '1' : '')}/>{label}</label>)}
        <div className="my-controls-filter-panel-actions">{filters.size > 0 && <button type="button" onClick={onReset}>مسح الكل</button>}<button type="button" onClick={close}>تم</button></div>
      </div>}
    </div>
    {active.length > 0 && <div className="my-controls-filter-chips" aria-label="الفلاتر النشطة">{active.map(([key, label]) => <button type="button" key={key} className="my-controls-filter-chip" aria-label={`إزالة فلتر ${label}`} onClick={() => onFilter(key, '')}><span>{label}</span><span aria-hidden="true">×</span></button>)}<button type="button" onClick={onReset}>مسح الكل</button></div>}
  </section>;
}
