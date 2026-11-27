import { strToU8, Zip, ZipPassThrough } from "fflate";
import { supabase } from "@/lib/supabase";

export type ManifestRow = {
  requirement_id: number; standard_code: string; specification_code: string | null; maturity_level: string;
  evidence_name: string; status: string; submission_id: number | null; storage_path: string | null;
  file_name: string | null; source_locator: string | null;
};

export const labels: Record<string, string> = {
  unassigned: "لم يُسند", assigned: "بانتظار الرفع", submitted: "بانتظار المراجعة", changes_requested: "معاد للتعديل", approved: "معتمد داخليًا",
};
function segment(value: string) {
  return value.replace(/[^\p{L}\p{N} ._-]/gu, "_").replace(/\.{2,}/g, "_").trim().slice(0, 95) || "_";
}
function csv(rows: (string | number | null)[][]) {
  return strToU8("\ufeff" + rows.map(row => row.map(value => {
    const raw = String(value ?? "");
    const safe = /^\s*[=+@-]|^[\t\r\n]/.test(raw) ? "'" + raw : raw;
    return '"' + safe.replace(/"/g, '""') + '"';
  }).join(",")).join("\r\n"));
}

export async function downloadPackage(domain: string, rows: ManifestRow[]) {
  const archive = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, bytes, final) => {
        if (err) throw err;
        controller.enqueue(bytes);
        if (final) controller.close();
      });
      const heading = ["رمز السؤال", "رمز المواصفة", "المستوى", "الدليل", "الحالة", "معرف النسخة المعتمدة", "الصفحة أو البند", "المسار في الحزمة"];
      const index: (string | number | null)[][] = [heading], missing = [heading];
      try {
        for (const row of rows) {
          let path = "";
          if (row.status === "approved") {
            if (!row.submission_id || !row.storage_path || !row.file_name) throw new Error("تنقص بيانات نسخة معتمدة.");
            const extension = row.file_name.match(/\.(pdf|docx|jpe?g|png)$/i)?.[0] ?? "";
            path = segment(row.standard_code) + "/" + segment(row.specification_code || row.standard_code) + "_" + row.requirement_id + "_" + segment(row.evidence_name) + extension;
            const { data, error } = await supabase.storage.from("nudee-evidence").download(row.storage_path);
            if (error || !data) throw new Error("تعذر تنزيل الدليل " + row.evidence_name);
            const entry = new ZipPassThrough(path);
            zip.add(entry);
            entry.push(new Uint8Array(await data.arrayBuffer()), true);
          }
          const fields = [row.standard_code, row.specification_code, row.maturity_level, row.evidence_name, labels[row.status] ?? row.status, row.submission_id, row.source_locator, path];
          index.push(fields);
          if (!path) missing.push(fields.map(value => String(value ?? "")));
        }
        for (const [name, fields] of [["فهرس الأدلة.csv", index], ["الأدلة غير المعتمدة.csv", missing]] as const) {
          const entry = new ZipPassThrough(name);
          zip.add(entry);
          entry.push(csv(fields), true);
        }
        zip.end();
      } catch (err) { zip.terminate(); controller.error(err); }
    },
  });
  const blob = await new Response(archive, { headers: { "Content-Type": "application/zip" } }).blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "حزمة نضيء_" + segment(domain) + ".zip";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
