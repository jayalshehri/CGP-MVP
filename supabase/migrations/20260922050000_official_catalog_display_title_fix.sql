-- Fix: research/extraction metadata (PDF page refs, bracketed analyst notes, unstripped
-- English translations) that leaked into controls.domain_ar / controls.title_ar for a
-- small number of CCC and DCC rows during the 2026-09-22 official-catalog data migration
-- (20260922030000_official_catalog_data_correction.sql).
--
-- Root cause: the source-parsing script's domain/subdomain header regexes expected a bare
-- numeric "pdf p.N" page reference immediately followed by end-of-line (or a short bracket
-- tag). Four header lines in the master catalogs did not fit that shape:
--   - CCC Domain 2 header used "p.16+" (a "+" suffix) followed by a long bracketed analyst
--     note, so the whole remainder of the line was captured as the domain name.
--   - Three DCC subdomain headers (2-2, 2-7, 3-1) used "p.NN onward" (a trailing word)
--     instead of a bare number, so " -- pdf p.NN onward" was captured into the subdomain
--     name (the trailing [PARTIAL]/[IN PROGRESS] tag itself was silently dropped).
--   - One CCC subdomain header (3-1) has a nested-parenthesis English translation
--     "(Cybersecurity Resilience aspects of Business Continuity Management (BCM))" that the
--     generator's single-level trailing-paren stripper could not remove.
--
-- This migration corrects only the display fields (domain_ar, title_ar) using the verified
-- official Arabic text already read directly from nca_reconciliation/framework_catalogs/
-- {ccc,dcc}_master_catalog.md. controls.official_text_ar (the regulatory requirement text)
-- was checked and is unaffected -- it is generated from each item's own line, not from the
-- domain/subdomain header, and is not touched here. Idempotent: replace() is a no-op once
-- the corrupted substring is gone, so re-running this file is safe.

begin;

-- CCC Domain 2 display name (134 rows) -- verified official Arabic: "تعزيز الأمن السيبراني"
update public.controls c
set domain_ar = replace(
  c.domain_ar,
  'تعزيز الأمن السيبراني (Cybersecurity Defense) — pdf p.16+ [17 subdomains — the framework''s largest domain]',
  'تعزيز الأمن السيبراني'
)
from public.frameworks f
where f.id = c.framework_id
  and f.code = 'CCC'
  and c.domain_ar like '%pdf p.16+%';

-- DCC subdomain 2-2 title (2 rows) -- verified official Arabic: "حماية الأنظمة وأجهزة معالجة المعلومات"
update public.controls c
set title_ar = replace(
  c.title_ar,
  'حماية الأنظمة وأجهزة معالجة المعلومات (Information System and Information Processing Facilities Protection) — pdf p.13 onward',
  'حماية الأنظمة وأجهزة معالجة المعلومات'
)
from public.frameworks f
where f.id = c.framework_id
  and f.code = 'DCC'
  and c.title_ar like '%pdf p.13 onward%';

-- DCC subdomain 2-7 title (5 rows) -- verified official Arabic: "الأمن السيبراني للطابعات والماسحات الضوئية وآلات التصوير"
update public.controls c
set title_ar = replace(
  c.title_ar,
  'الأمن السيبراني للطابعات والماسحات الضوئية وآلات التصوير (Cybersecurity for Printers, Scanners and Copy Machines) — pdf p.15 onward',
  'الأمن السيبراني للطابعات والماسحات الضوئية وآلات التصوير'
)
from public.frameworks f
where f.id = c.framework_id
  and f.code = 'DCC'
  and c.title_ar like '%pdf p.15 onward%';

-- DCC subdomain 3-1 title (13 rows) -- verified official Arabic: "الأمن السيبراني المتعلق بالأطراف الخارجية"
update public.controls c
set title_ar = replace(
  c.title_ar,
  'الأمن السيبراني المتعلق بالأطراف الخارجية (Third-Party Cybersecurity) — pdf p.17 onward',
  'الأمن السيبراني المتعلق بالأطراف الخارجية'
)
from public.frameworks f
where f.id = c.framework_id
  and f.code = 'DCC'
  and c.title_ar like '%pdf p.17 onward%';

-- CCC subdomain 3-1 title (5 rows) -- verified official Arabic: "جوانب صمود الأمن السيبراني في إدارة استمرارية الأعمال"
update public.controls c
set title_ar = replace(
  c.title_ar,
  'جوانب صمود الأمن السيبراني في إدارة استمرارية الأعمال (Cybersecurity Resilience aspects of Business Continuity Management (BCM))',
  'جوانب صمود الأمن السيبراني في إدارة استمرارية الأعمال'
)
from public.frameworks f
where f.id = c.framework_id
  and f.code = 'CCC'
  and c.title_ar like '%Business Continuity Management (BCM)%';

commit;
