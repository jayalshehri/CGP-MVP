'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
export default function EvidenceDownload({ path, name }: { path: string | null | undefined; name?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!path) return null;
  async function download() {
    setBusy(true); setError('');
    try {
      const { data, error } = await supabase.storage.from('evidence-files').download(path!);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a'); a.href = url; a.download = name || 'evidence'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError('تعذر تنزيل الملف. حاول مرة أخرى.'); }
    finally { setBusy(false); }
  }
  return <span><button type="button" disabled={busy} onClick={download} style={{background:'#eef3f5',color:'#0b1f33',border:0,borderRadius:8,padding:'10px 13px',cursor:'pointer'}}>{busy?'جاري التنزيل...':'تنزيل الدليل'}</button>{error&&<span role="alert">{error}</span>}</span>;
}
