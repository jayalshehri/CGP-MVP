-- framework_scope now holds the official target sub-control codes for each roadmap initiative.
update public.cybersecurity_projects
set framework_scope = case project_code
  when 'R-01' then 'ECC 1-1-1، 1-1-2، 1-1-3، 1-2-1، 1-3-1، 1-8-1'
  when 'R-02' then 'ECC 2-2-1، 2-2-2، 2-2-3، 2-2-4'
  when 'R-03' then 'ECC 2-5-1، 2-5-2، 2-5-3، 2-5-4'
  when 'R-04' then 'ECC 2-3-1، 2-3-2، 2-3-3، 2-3-4'
  when 'R-05' then 'ECC 2-12-1، 2-12-2، 2-12-3، 2-13-1، 2-13-2'
  when 'R-06' then 'ECC 2-10-1، 2-10-2، 2-11-1، 2-11-2'
  when 'R-07' then 'ECC 2-1-1، DCC: ضوابط تصنيف وحماية البيانات المنطبقة'
  when 'R-08' then 'CCC: ضوابط المشترك أو مقدم الخدمة المنطبقة بعد تحديد النطاق'
  when 'R-09' then 'ECC: ضوابط استمرارية الأعمال والتعافي المنطبقة'
  when 'R-10' then 'ECC 2-4-1، 2-4-2، 2-15-1، 2-15-2'
  when 'R-11' then 'ECC 1-7-1، 1-8-1، 1-8-2، 1-8-3'
end
where project_code in ('R-01','R-02','R-03','R-04','R-05','R-06','R-07','R-08','R-09','R-10','R-11');
