import { strToU8, zipSync } from "fflate";
import { frameworkCopy, sdaiaFramework, type EvidenceRequirement } from "./reference";

function escapeXml(value: string) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

export function templateBytes(r: EvidenceRequirement) {
  const lines = ["نموذج إعداد داخلي", r.evidence_name, r.domain_name + " — " + r.standard_code,
    r.requirement_title, r.maturity_level, "المواصفة المرتبطة: " + (r.specification_code || "غير مدونة"),
    "الإدارة المسؤولة: " + (r.responsible_department || "________________"),
    "وصف الدليل في سجل المكتب", ...(r.evidence_description || "________________").split(/\r?\n/),
    "بيانات يستكملها مالك الدليل", "اسم الوثيقة وإصدارها: ________________", "تاريخ الوثيقة: ________________",
    "الإجراء المنفذ ونتيجته: ________________", "الصفحة أو البند الذي يثبت التنفيذ: ________________",
    "المرفقات والاعتمادات: ________________", "مرجع القياس: سدايا — المؤشر الوطني للبيانات، الإصدار ١٫١ (نوفمبر ٢٠٢٤)", r.acceptance_pdf_page ? frameworkCopy+"#page="+r.acceptance_pdf_page : sdaiaFramework];
  const paragraphs = lines.map((line,i) => '<w:p><w:pPr><w:bidi/><w:spacing w:after="130"/></w:pPr><w:r><w:rPr><w:rFonts w:cs="Arial"/><w:rtl/>'+(i<2?'<w:b/><w:bCs/>':'')+'</w:rPr><w:t xml:space="preserve">'+escapeXml(line)+'</w:t></w:r></w:p>').join("");
  return zipSync({
    "[Content_Types].xml":strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    "_rels/.rels":strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    "word/document.xml":strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+paragraphs+'<w:sectPr><w:bidi/></w:sectPr></w:body></w:document>')
  });
}
export function downloadTemplate(r: EvidenceRequirement) {
  const url=URL.createObjectURL(new Blob([new Uint8Array(templateBytes(r))],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}));
  const link=document.createElement("a");
  link.href=url; link.download=r.standard_code+"-"+r.id+"-نموذج.docx"; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
