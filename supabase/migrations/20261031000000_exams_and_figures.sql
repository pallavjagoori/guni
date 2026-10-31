-- Exams and subjects the app offers, and where a question's diagram sits in its paper.
-- Idempotent, so it is safe on databases that already have some of these rows.

insert into exams (code, name) values
  ('cbse12', 'CBSE Class 12'),
  ('jee-main', 'JEE Main'),
  ('jee-adv', 'JEE Advanced'),
  ('neet', 'NEET')
on conflict (code) do nothing;

-- Music joins once its variant (Hindustani/Carnatic, vocal/instrumental) is decided.
insert into subjects (exam_id, code, name)
select e.id, s.code, s.name
from (values
  ('cbse12', 'physics', 'Physics'),
  ('cbse12', 'chemistry', 'Chemistry'),
  ('cbse12', 'mathematics', 'Mathematics'),
  ('cbse12', 'biology', 'Biology'),
  ('cbse12', 'english-core', 'English Core'),
  ('cbse12', 'computer-science', 'Computer Science'),
  ('jee-main', 'physics', 'Physics'),
  ('jee-main', 'chemistry', 'Chemistry'),
  ('jee-main', 'mathematics', 'Mathematics'),
  ('jee-adv', 'physics', 'Physics'),
  ('jee-adv', 'chemistry', 'Chemistry'),
  ('jee-adv', 'mathematics', 'Mathematics'),
  ('neet', 'physics', 'Physics'),
  ('neet', 'chemistry', 'Chemistry'),
  ('neet', 'biology', 'Biology')
) as s (exam_code, code, name)
join exams e on e.code = s.exam_code
on conflict (exam_id, code) do nothing;

-- Where the diagram is in the source PDF: {"page": 7, "box": [x0, y0, x1, y1], "caption": "..."}
-- with the box as fractions of the page. A later step crops it into question_assets.
alter table questions add column if not exists figure jsonb;

-- The question range and answer style of each section, as the paper's instructions state them.
-- Extraction reads these to transcribe one section at a time and to check the result.
alter table sections add column if not exists first_question int;
alter table sections add column if not exists last_question int;
alter table sections add column if not exists objective boolean not null default false;
