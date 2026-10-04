import {supabase} from '@/lib/supabase';
import type {FindingSource} from '@/lib/findings';

export type FindingSourceOption={id:number;label:string};
type SourceRow={id:number;code:string|null;title:string|null;cycle?:{scope_name:string;frameworks:{code:string}|null}|{scope_name:string;frameworks:{code:string}|null}[]|null};

// Existing, RLS-scoped read contracts only. IDs are values, never user-entered labels.
// The command RPC remains the authority for creation and source eligibility.
export async function loadFindingSourceOptions(source:FindingSource,exactId:number|null):Promise<FindingSourceOption[]> {
  if(source==='internal_audit'||(exactId!==null&&(!Number.isSafeInteger(exactId)||exactId<1)))throw new Error('Source unavailable');
  const rows:FindingSourceOption[]=[];
  for(let from=0;from<50000;from+=500){
    let query=source==='assessment'
      ?supabase.from('assessment_items').select('id,code:control_code,title:title_ar,cycle:assessment_cycles!cycle_id!inner(scope_name,status,frameworks(code))',{count:'exact'}).not('cycle.status','in','(approved,closed)')
      :source==='risk'
        ?supabase.from('cyber_risks').select('id,code:risk_code,title:risk_description',{count:'exact'})
        :supabase.from('vulnerabilities').select('id,code:vulnerability_code,title:title',{count:'exact'});
    if(exactId!==null)query=query.eq('id',exactId);
    const result=await query.order('id').range(from,from+499);
    if(result.error||!Number.isSafeInteger(result.count)||result.count===null||result.count<0)throw new Error('Source unavailable');
    const page=(result.data??[]) as unknown as SourceRow[];
    for(const row of page){
      const cycle=Array.isArray(row.cycle)?row.cycle[0]:row.cycle;
      if(source==='assessment'&&!cycle)throw new Error('Source unavailable');
      rows.push({id:row.id,label:[cycle?.frameworks?.code,row.code,row.title,cycle?.scope_name].filter(Boolean).join(' — ')});
    }
    if(new Set(rows.map(row=>row.id)).size!==rows.length)throw new Error('Source unavailable');
    if(rows.length===result.count)return rows;
    if(page.length<500||rows.length>result.count)throw new Error('Source unavailable');
  }
  throw new Error('Source unavailable');
}
