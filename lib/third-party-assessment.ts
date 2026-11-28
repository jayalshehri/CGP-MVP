export const stages:Record<string,string> = {pre_contract:"قبل التعاقد",active:"سارية",renewal:"عند التجديد",ended:"منتهية"};
export const kinds:Record<string,string> = {standard:"توريد أو خدمة عامة",outsourcing:"إسناد تقنية المعلومات",managed:"خدمة مُدارة"};
export const accessLevels:Record<string,string> = {none:"دون وصول",standard:"وصول عادي",privileged:"وصول بصلاحيات مرتفعة"};
export const dataLevels:Record<string,string> = {public:"عام",restricted:"مقيد",secret:"سري",top_secret:"سري للغاية"};
export const decisions:Record<string,string> = {approved:"معتمد",conditional:"اعتماد مشروط",rejected:"غير معتمد"};
export const yesNo: [string,string][] = [["true","نعم"],["false","لا"]];
export type Scope = { kind?:string; access?:string; data?:boolean; service_impact?:boolean; sensitive?:boolean; cloud?:boolean;
  subcontractors?:boolean; remote_soc?:boolean; data_class?:string; system_reference?:string; hosting_location?:string; subcontractor_details?:string };
export type CheckValue = {status:"met"|"open";reference:string};
export type CheckKey = "confidentiality"|"secure_deletion"|"incident_response"|"policy"|"risk_controls"|"local_soc"|"vetting"|"national_provider"|"cloud_review"|"sensitive_hosting";
export type Check = {key:CheckKey;title:string;reference:string};
const check = (key:CheckKey,title:string,reference:string):Check=>({key,title,reference});
export const scopeFlags = ["data","service_impact","sensitive","cloud","subcontractors","remote_soc"] as const;

// Keep applicability aligned with the versioned cgp_tprm_v1 database guard.
// The cloud review is a link to the applicable CCC assessment, not a CCC compliance score.
export function applicableChecks(scope:Scope):Check[] {
  const specialist=scope.kind==="outsourcing"||scope.kind==="managed";
  const checks:Check[]=[];
  if (specialist||scope.data||scope.service_impact||(scope.access&&scope.access!=="none")||scope.sensitive||scope.cloud) checks.push(
    check("confidentiality","بند سرية المعلومات","ECC 4-1-2-1"),
    check("secure_deletion","الحذف الآمن للبيانات عند انتهاء الخدمة","ECC 4-1-2-1"),
    check("incident_response","إجراءات التواصل عند الحوادث السيبرانية","ECC 4-1-2-2"),
    check("policy","الالتزام بسياسات الجهة والمتطلبات ذات العلاقة","ECC 4-1-2-3"),
  );
  if(specialist) checks.push(check("risk_controls","تقييم المخاطر وما يثبت السيطرة عليها قبل التوقيع أو عند تغير المتطلبات","ECC 4-1-3-1"));
  if(scope.remote_soc) checks.push(check("local_soc","موقع مركز عمليات خدمة الأمن السيبراني داخل المملكة","ECC 4-1-3-2"));
  if(scope.sensitive&&specialist) checks.push(
    check("vetting","إثبات المسح الأمني للجهات والعاملين ضمن النطاق","CSCC 4-1-1-1"),
    check("national_provider","إثبات أن مقدم خدمة الإسناد أو الخدمة المدارة جهة وطنية","CSCC 4-1-1-2"),
  );
  if(scope.cloud) checks.push(check("cloud_review","مرجع مراجعة الضوابط السحابية المنطبقة","CCC-2:2024"));
  if(scope.cloud&&scope.sensitive) checks.push(check("sensitive_hosting","إثبات موقع استضافة النظام الحساس ضمن الخيارات المحددة","CSCC 4-2-1-1"));
  return checks;
}
export function scopeComplete(scope:Scope) {
  return !!(scope.kind&&kinds[scope.kind]&&scope.access&&accessLevels[scope.access]
    && scopeFlags.every(k=>typeof scope[k]==="boolean")
    && (!scope.remote_soc||scope.kind==="managed")
    && (!scope.data||(scope.data_class&&dataLevels[scope.data_class]))
    && (!scope.sensitive||scope.system_reference?.trim())
    && (!scope.cloud||scope.hosting_location?.trim())
    && (!scope.subcontractors||scope.subcontractor_details?.trim()));
}
export function blockerCount(scope:Scope, data:Partial<Record<CheckKey,CheckValue>>) {
  return applicableChecks(scope).filter(({key})=>data[key]?.status!=="met"||!data[key]?.reference?.trim()).length;
}
