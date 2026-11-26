"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import EvidenceDownload from "@/components/EvidenceDownload";
import { supabase } from "@/lib/supabase";

const maxInlineSize = 20 * 1024 * 1024;
type Preview = { kind: "idle" | "loading" } | { kind: "error"; message: string } |
  { kind: "pdf"; document: PDFDocumentProxy } | { kind: "image"; url: string };

function detectPreviewMime(bytes: Uint8Array) {
  const ascii = (offset: number, end: number) => String.fromCharCode(...bytes.subarray(offset, end));
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((c, index) => bytes[index] === c)) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export default function ReviewFilePreview({ path, name }: { path: string | null; name: string | null }) {
  const [preview, setPreview] = useState<Preview>({ kind: "idle" });
  const live = useRef(false);
  const blobUrl = useRef<string | null>(null);
  const task = useRef<PDFDocumentLoadingTask | null>(null);
  const busy = useRef(false);
  const extension = (name || path || "").split(".").pop()?.toLowerCase() || "";
  const supported = !!path && ["pdf", "png", "jpg", "jpeg", "gif", "webp"].includes(extension);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = null;
      if (task.current) void task.current.destroy().catch(() => {});
      task.current = null;
    };
  }, []);

  async function openInline() {
    if (!path || !supported || busy.current) return;
    busy.current = true;
    setPreview({ kind: "loading" });
    try {
      const { data, error } = await supabase.storage.from("evidence-files").download(path);
      if (!live.current) return;
      if (error || !data) throw new Error("تعذر جلب الملف للمعاينة.");
      if (data.size > maxInlineSize) throw new Error("حجم الملف يتجاوز حد المعاينة المضمنة. استخدم الفتح أو التنزيل.");
      const mime = detectPreviewMime(new Uint8Array(await data.slice(0, 16).arrayBuffer()));
      if (!live.current) return;
      if (!mime) throw new Error("تعذر التعرف على نوع الملف للمعاينة المضمنة.");
      if (mime !== "application/pdf") {
        const url = URL.createObjectURL(new Blob([data], { type: mime }));
        blobUrl.current = url;
        setPreview({ kind: "image", url });
        return;
      }
      const pdf = await import("pdfjs-dist");
      if (!live.current) return;
      pdf.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const bytes = await data.arrayBuffer();
      if (!live.current) return;
      // Canvas only: do not mount PDF scripts, links, forms, or annotation controls.
      const loading = pdf.getDocument({ data: bytes, enableXfa: false, useWasm: false, maxImageSize: 24_000_000 });
      task.current = loading;
      const document = await loading.promise;
      if (live.current) setPreview({ kind: "pdf", document });
    } catch (cause) {
      if (task.current) void task.current.destroy().catch(() => {});
      task.current = null;
      const detail = cause instanceof Error && /[\u0600-\u06FF]/.test(cause.message) ? cause.message : "تعذرت المعاينة المضمنة. جرّب الفتح أو التنزيل.";
      if (live.current) setPreview({ kind: "error", message: detail });
    } finally { busy.current = false; }
  }

  return <section className="review-preview" aria-label="معاينة ملف الدليل">
    <div className="review-preview-header">
      <div><h3>معاينة الملف</h3>{name && <p><bdi dir="auto">{name}</bdi></p>}</div>
      <EvidenceDownload path={path} name={name}/>
    </div>
    {preview.kind === "pdf" ? <PdfPages document={preview.document}/>
    : preview.kind === "image" ? <div className="review-preview-image">
      {/* eslint-disable-next-line @next/next/no-img-element -- The authorized file is an ephemeral local Blob URL. */}
      <img src={preview.url} alt="صورة الدليل" onError={() => {
        URL.revokeObjectURL(preview.url); blobUrl.current = null;
        setPreview({ kind: "error", message: "تعذر عرض الصورة. جرّب التنزيل." });
      }}/>
    </div>
    : <div className="review-preview-placeholder">
      {!path ? <p>لا يوجد ملف مرفق.</p>
      : !supported ? <p>هذا النوع لا يدعم العرض هنا. استخدم خيار المعاينة أو التنزيل المتاح.</p>
      : preview.kind === "loading" ? <p role="status">جاري تحميل المعاينة…</p>
      : <>
        <p {...(preview.kind === "error" ? { role: "alert" } : {})}>{preview.kind === "error" ? preview.message : "اعرض الملف هنا دون مغادرة المراجعة."}</p>
        <button className="review-button" type="button" onClick={() => void openInline()}>{preview.kind === "error" ? "إعادة المحاولة" : "عرض الملف هنا"}</button>
      </>}
    </div>}
  </section>;
}

function PdfPages({ document }: { document: PDFDocumentProxy }) {
  const [pageNumber, setPageNumber] = useState(1);
  const [rendered, setRendered] = useState(0);
  const [errorPage, setErrorPage] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let live = true;
    let render: RenderTask | undefined;
    void (async () => {
      try {
        const page = await document.getPage(pageNumber);
        const canvas = canvasRef.current;
        if (!live || !canvas) return;
        const viewport = page.getViewport({ scale: 1 });
        const width = canvas.parentElement?.clientWidth || 480;
        const scale = Math.min(2, (width / viewport.width) * Math.min(window.devicePixelRatio || 1, 1.75),
          Math.sqrt(4_000_000 / (viewport.width * viewport.height)));
        const fitted = page.getViewport({ scale });
        canvas.width = Math.max(1, Math.floor(fitted.width));
        canvas.height = Math.max(1, Math.floor(fitted.height));
        render = page.render({ canvas, viewport: fitted, annotationMode: 0 });
        await render.promise;
        if (live) { setRendered(pageNumber); setErrorPage(0); }
      } catch { if (live) setErrorPage(pageNumber); }
    })();
    return () => { live = false; render?.cancel(); };
  }, [document, pageNumber]);

  return <>
    <nav className="review-preview-pages" aria-label="صفحات ملف الدليل">
      <button type="button" className="review-button" disabled={pageNumber <= 1} onClick={() => setPageNumber(n => n - 1)}>السابقة</button>
      <span role="status">{pageNumber} من {document.numPages}</span>
      <button type="button" className="review-button" disabled={pageNumber >= document.numPages} onClick={() => setPageNumber(n => n + 1)}>التالية</button>
    </nav>
    {errorPage === pageNumber ? <p className="review-preview-error" role="alert">تعذر عرض هذه الصفحة. استخدم الفتح أو التنزيل.</p>
      : rendered !== pageNumber ? <p className="review-preview-error" role="status">جاري تجهيز الصفحة…</p> : null}
    <div className="review-pdf-canvas"><canvas key={pageNumber} ref={canvasRef} aria-label={`صفحة ${pageNumber} من الملف`} hidden={errorPage === pageNumber || rendered !== pageNumber}/></div>
  </>;
}
