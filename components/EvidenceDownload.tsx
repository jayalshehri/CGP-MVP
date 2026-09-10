'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
export default function EvidenceDownload({ path, name }: { path: string | null | undefined; name?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!path) return null;
  const extension=(name||path).split('.').pop()?.toLowerCase()||'';
  const previewable=['pdf','png','jpg','jpeg','gif','webp','svg'].includes(extension);
  async function download() {
    setBusy(true); setError('');
    try {
      const { data, error } = await supabase.storage.from('evidence-files').download(path!);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a'); a.href = url; a.download = name || 'evidence'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError('تعذر تنزيل الملف. حاول مرة أخرى.'); }
    finally { setBusy(false); }
  }
  async function preview() {
    setBusy(true); setError('');
    try {
      const { data, error } = await supabase.storage.from('evidence-files').createSignedUrl(path!, 300);
      if (error || !data?.signedUrl) throw error || new Error('preview unavailable');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch { setError('تعذر فتح المعاينة. يمكنك تنزيل الملف بدلًا من ذلك.'); }
    finally { setBusy(false); }
  }
  return <span style={{display:'inline-flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>{previewable&&<button type="button" disabled={busy} onClick={preview} style={{background:'#e8f5f2',color:'#0f6f67',border:0,borderRadius:8,padding:'10px 13px',cursor:'pointer',fontWeight:700}}>{busy?'جاري الفتح...':'معاينة'}</button>}<button type="button" disabled={busy} onClick={download} style={{background:'#eef3f5',color:'#0b1f33',border:0,borderRadius:8,padding:'10px 13px',cursor:'pointer'}}>{busy?'جاري التنزيل...':'تنزيل الدليل'}</button>{error&&<span role="alert" style={{color:'#b42318',fontSize:13}}>{error}</span>}</span>;
}
