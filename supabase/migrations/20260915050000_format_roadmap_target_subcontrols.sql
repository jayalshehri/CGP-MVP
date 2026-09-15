update public.cybersecurity_projects
set framework_scope = replace(framework_scope, '؛ ', E'\n')
where framework_scope like '%؛ %';
