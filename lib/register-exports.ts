import { strToU8, zipSync } from "fflate";
type Cell = string | number | null | undefined;
const esc = (x: string) => x.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/[<>&"']/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[c] ?? c));
const xml = (s: string) => strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+s);
const sheetNs = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relationshipNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const relationships = (type: string, path: string) => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relationshipNs}/${type}" Target="${path}"/></Relationships>`;
function columnName(i: number) {
  let n=i+1, label="";
  while (n>0) { n--; label=String.fromCharCode(65+n%26)+label; n=Math.floor(n/26); }
  return label;
}
export function registerWorkbook(sheet: string, rows: Cell[][]) {
  const cells=rows.map((r,i)=>`<row r="${i+1}">${r.map((v,j)=>{
    const ref=columnName(j)+(i+1);
    return typeof v === "number" && Number.isFinite(v)
      ? `<c r="${ref}"><v>${v}</v></c>`
      : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v??""))}</t></is></c>`;
  }).join("")}</row>`).join("");
  const last=columnName(Math.max(0,(rows[0]?.length??1)-1));
  return zipSync({
    "[Content_Types].xml":xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    "_rels/.rels":xml(relationships("officeDocument","xl/workbook.xml")),
    "xl/workbook.xml":xml(`<workbook xmlns="${sheetNs}" xmlns:r="${relationshipNs}"><sheets><sheet name="${esc(sheet)}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels":xml(relationships("worksheet","worksheets/sheet1.xml")),
    "xl/worksheets/sheet1.xml":xml(`<worksheet xmlns="${sheetNs}"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${rows[0]?.length ?? 1}" width="27" customWidth="1"/></cols><sheetData>${cells}</sheetData><autoFilter ref="A1:${last}${Math.max(1,rows.length)}"/></worksheet>`),
  });
}
export function downloadRegister(sheet: string, filename: string, data: Cell[][]) {
  const url=URL.createObjectURL(new Blob([new Uint8Array(registerWorkbook(sheet,data))],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
  const link=document.createElement("a"); link.href=url;link.download=filename;link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export const riskHeaders = ["رقم تعريف المخاطر","نطاق المخاطر","مالك المخاطر","تاريخ تحديد المخاطر","وصف المخاطر","سبب المخاطر","التهديد","تحليل المخاطر وعواقبها","تاريخ تحليل وتقييم المخاطر","احتمالية المخاطر الكامنة (1-5)","حجم/أثر المخاطر الكامنة (1-5)","التصنيف الكلّي للمخاطر الكامنة","التصنيف الكلّي المحدث للمخاطر الكامنة (إمكانية التجاوز يدويًا)","نوع إجراء المعالجة","وصف معالجة المخاطر","مالك إجراء المعالجة","الموعد النهائي للإجراء","وصف المخاطر المتبقية","احتمالية المخاطر المتبقية (1-5)","حجم/أثر المخاطر المتبقية (1-5)","التصنيف الكلّي للمخاطر المتبقية","وصف الخطوات التالية","تاريخ آخر تقييم","الملاحظات"];
export const vulnerabilityHeaders = ["رقم تعريف الثغرة","العنوان","وصف الثغرة","رابط المورد","رقم الثغرات والمخاطر الأمنية الشائعة","درجة الثغرات والمخاطر الأمنية الشائعة","التقنيات المتأثرة","الأصول المتأثرة","تحليل التهديدات","شدة خطورة التهديد (تُستخدم لتحديد الأولويات الديناميكية)","احتمالية حدوث المخاطر","شدّة المخاطر","مستوى المخاطر","المالك","الحالة","تاريخ الملاحظة الأولى","الموعد النهائي","تاريخ الحل","ملاحظات"];
