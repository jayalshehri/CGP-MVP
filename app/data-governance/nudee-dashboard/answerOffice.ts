import { formatRiyadhDate } from "@/lib/dates";
import { officeWeek } from "../nudee/queues";
import { cyclesPath } from "../nudee-indicator/routes";
import { latestMaturity } from "../nudee-indicator/latestMaturity";
import { findWork, labels, recordLink, workLink, type Scope, type WorkItem } from "./officeWork";

const number = new Intl.NumberFormat("ar-SA");
export type Reply = { text: string; sources?: { title: string; href: string }[]; scope?: Scope };
export const prompts = ["ما المتأخر؟", "ماذا ينتظر مراجعتي؟", "لخّص هذا الأسبوع"];
function normalize(text: string) {
  return text.toLowerCase().normalize("NFKC").replace(/[ًٌٍَُِّْٰـ]/g,"").replace(/[أإآٱ]/g,"ا")
    .replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/[^\p{L}\p{N}]+/gu," ").trim();
}

function detectedView(q: string) {
  if (/متاخر|تاخر|فات موعد/.test(q)) return "overdue";
  if (/قراري|مراجعتي|اراجع/.test(q)) return "review";
  if (/معاد|اعيد|مرجع للتعديل|تعديل/.test(q)) return "changes_requested";
  if (/مراجع|مقدم|مرسل/.test(q)) return "submitted";
  if (/معتمد|اعتمدت|اعتمادها/.test(q)) return "approved";
  if (/بلا مالك|بدون مالك|غير مسند|لم يسند|بلا تكليف/.test(q)) return "unassigned";
  if (/تستحق|مستحق|استحقاق|موعد|بانتظار الرفع/.test(q)) return "action";
  return "";
}
function describe(item: WorkItem) {
  const due = item.task?.due_date;
  return item.owner + (due ? "، الاستحقاق " + formatRiyadhDate(due) : "، دون موعد استحقاق مسجّل");
}

export async function answerOffice(question: string, previous: Scope | undefined, items: WorkItem[], today: string, userId: string): Promise<Reply> {
  const q = normalize(question);
  const help = {text:"أقدر أبحث في التكليفات والأدلة، وألخّص مواعيد الأسبوع، وأعرض نتيجة النضج الموثقة. جرّب «ما المتأخر؟» أو اذكر اسم الدليل."};
  if (/^(احذف|احذفي|ارسل|ارسلي|عدل |اعتمد |اسند |ارفع )/.test(q)) return {text:"لإجراء تغيير، افتح سجل التكليف واستخدم الإجراء المتاح لحسابك. المساعد يعرض المعلومات المسجّلة."};
  if (/نضج|نتيجه.*(رسمي|سدايا|الدوره)|نتيجه (نضي|الموشر)/.test(q)) {
    if (/مجال|مستوي مستهدف|مستويات/.test(q)) return {text:"النتيجة الموثقة تخص آخر دورة مسجّلة للجهة. راجع تجهيز أسئلة المجال لمعرفة المستويات المستهدفة.",sources:[{title:"المجالات والأدلة",href:workLink({view:"all"})}]};
    const cycle = await latestMaturity();
    const text = !cycle ? "لم تُسجّل دورة تقييم بعد." : cycle.result
      ? cycle.title + " · نتيجة النضج الموثقة: " + cycle.result.outcome + " · المرجع: " + cycle.result.reference
      : cycle.title + " · لم تُسجّل نتيجة نضج موثقة لهذه الدورة.";
    return {text,sources:[{title:"فتح دورات التقييم",href:cyclesPath}]};
  }
  if (/نسبه الامتثال|نتيجه الامتثال|درجه الامتثال/.test(q)) return {text:"يمكن التحقق من نتيجة الامتثال ومرجعها من ملف الدورة.",sources:[{title:"فتح دورات التقييم",href:cyclesPath}]};
  const named = items.filter(item => item.evidence_name && q.includes(normalize(item.evidence_name)));
  if (named.length === 1) {
    const [item] = named;
    return {text:item.domain_name+" · "+item.evidence_name+" · "+describe(item), sources:[{title:"فتح المتطلب",href:recordLink(item)}]};
  }
  if (named.length > 1) return {text:"يوجد أكثر من متطلب بهذا الاسم. اختر السجل المقصود.",sources:named.slice(0,5).map(r=>({title:r.domain_name+" · "+r.evidence_name+" ("+number.format(r.id)+")",href:recordLink(r)}))};
  const domains = [...new Set(items.map(r=>r.domain_name).filter(Boolean))];
  const explicit = domains.find(domain=>q.includes(normalize(domain)));
  const aliases = domains.filter(domain => normalize(domain).split(" ").some(word => {
    const term = word.replace(/^ال/,"");
    return term.length >= 4 && !["بيانات","اداره","وحمايه"].includes(term) && q.includes(term);
  }));
  const domain = explicit || (aliases.length === 1 ? aliases[0] : "");
  if (!domain && (aliases.length > 1 || /(?:مجال|في قسم)\s/.test(q) || /(?:^| )في (?!هذا الاسبوع|الاسبوع|كل المجالات|جميع المجالات|المكتب|انتظار|السجل)/.test(q)) && !/كل المجالات|جميع المجالات/.test(q)) {
    return {text:"أي مجال تقصد؟ اكتب اسمه كما يظهر في السجل. المجالات المتاحة: "+domains.join("، ")};
  }
  if (/الاسبوع (الماضي|القادم|الجاي)|الشهر|امس|السنه|العام الماضي/.test(q)) return {text:"أدعم التصفية حسب اليوم والأسبوع الحالي بتوقيت الرياض. حدّد إحدى الفترتين أو اطلب كل المواعيد."};
  const continuation = /^(?:و?ايها|و?منها|و?منهم|و?مين|و?من (?:المالك|المسؤول)|فقط|هذا الاسبوع$|اليوم$)/.test(q);
  const follow = !!previous && (continuation || (/^(و|طيب)/.test(q) && !!detectedView(q)) || (!!domain && !detectedView(q)));
  const selectedDomain = /كل المجالات|جميع المجالات/.test(q) ? "" : domain || (follow ? previous?.domain : "");
  const week = officeWeek(today);
  const isWeek = /اسبوع/.test(q);
  const wantsSummary = /لخص|ملخص|موجز/.test(q);
  const range = isWeek || wantsSummary ? {from:week.start,to:week.end} : /اليوم/.test(q) ? {from:today,to:today} :
    follow ? {from:previous?.from,to:previous?.to} : {};
  if (wantsSummary) {
    const scope = {view:"all",domain:selectedDomain,...range};
    const rows = findWork(items,scope,today,userId);
    const countView = (view: string) => number.format(findWork(items,{...scope,view},today,userId).length);
    return {scope,text:"ملخص التكليفات حسب موعد الاستحقاق"+(selectedDomain?" في "+selectedDomain:"")+" من "+formatRiyadhDate(scope.from)+" إلى "+formatRiyadhDate(scope.to)+
      ": "+number.format(rows.length)+" إجمالًا، منها "+countView("overdue")+" متأخرة، و"+countView("submitted")+" بانتظار المراجعة، و"+countView("approved")+" معتمدة حاليًا.",
      sources:[{title:"فتح تكليفات الفترة",href:workLink(scope)}]};
  }
  const view = detectedView(q);
  if (!view && !domain && !follow) return help;
  const scope: Scope = {view:view || (follow ? previous?.view : undefined) || "all",domain:selectedDomain,...range};
  if (view === "action" && isWeek && !follow) scope.from = today;
  if ((view==="overdue" && /تعديل|معاد|اعيد/.test(q)) || (follow && previous?.view==="overdue" && view==="changes_requested")) {
    scope.view="overdue"; scope.status="changes_requested";
  } else if (follow && !view && previous?.status) scope.status=previous.status;
  const rows=findWork(items,scope,today,userId);
  const context=[labels[scope.view],scope.status && labels[scope.status],scope.domain,scope.from && "استحقاق من "+formatRiyadhDate(scope.from),scope.to && "إلى "+formatRiyadhDate(scope.to)].filter(Boolean).join(" · ");
  const first=rows[0];
  const detail = first ? " "+(scope.view==="overdue"?"أقدم تكليف متأخر":scope.view==="review"||scope.view==="submitted"?"الأقدم في الانتظار":"أول متطلب")+" هو «"+first.evidence_name+"»؛ "+describe(first)+"." : "";
  const sources=[{title:"فتح السجل المصفّى",href:workLink(scope)}];
  if (first) sources.push({title:first.evidence_name,href:recordLink(first)});
  return {scope,text:context+" — "+number.format(rows.length)+"."+detail,sources};
}
