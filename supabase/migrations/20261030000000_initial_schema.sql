-- Initial schema for the adaptive PYQ learning app.
-- Original PYQ content is immutable once published; AI output lives in separate
-- tables with the model, prompt version and confidence that produced it.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

create type user_role as enum ('student', 'admin');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role user_role not null default 'student',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Exams and papers (generic: CBSE 12, JEE Main, JEE Advanced, NEET, later SAT...)
-- ---------------------------------------------------------------------------

create table exams (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,            -- 'cbse12', 'jee-main', 'jee-adv', 'neet'
  name text not null,
  pipeline_status text not null default 'collecting'
    check (pipeline_status in ('collecting', 'extracting', 'tagging', 'generating', 'ready')),
  created_at timestamptz not null default now()
);

create table subjects (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams (id) on delete cascade,
  code text not null,                   -- 'physics', 'chemistry', 'music-hindustani-vocal'
  name text not null,
  unique (exam_id, code)
);

create table students_enrollments (
  student_id uuid not null references profiles (id) on delete cascade,
  exam_id uuid not null references exams (id) on delete cascade,
  primary key (student_id, exam_id)
);

create table papers (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects (id) on delete cascade,
  year int not null,
  variant text not null default '',     -- set code / shift, e.g. '55/1/1' or '27 Jan Shift 1'
  duration_minutes int not null,
  max_marks numeric not null,
  source_pdf_path text,                 -- path in the 'papers' storage bucket
  answer_key_pdf_path text,
  marking_scheme_pdf_path text,
  status text not null default 'collected'
    check (status in ('collected', 'extracted', 'tagged', 'generated', 'verified', 'ready')),
  created_at timestamptz not null default now(),
  unique (subject_id, year, variant)
);

create table sections (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references papers (id) on delete cascade,
  position int not null,
  title text not null,
  instructions text,
  -- Marking rules for every question in this section.
  marks_correct numeric not null,
  marks_wrong numeric not null default 0,      -- negative for JEE/NEET, e.g. -1
  marks_unattempted numeric not null default 0,
  -- Choice rules, e.g. "attempt any 20 of 25" -> attempt_limit = 20.
  attempt_limit int,
  unique (paper_id, position)
);

create type question_kind as enum (
  'mcq_single',      -- one correct option
  'mcq_multi',       -- JEE Advanced: one or more correct options
  'assertion_reason',
  'numerical',       -- integer or decimal answer with tolerance
  'descriptive'      -- short/long answer, case-based, written on paper
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections (id) on delete cascade,
  position int not null,
  label text not null,                  -- as printed: '12', '23(b)'
  kind question_kind not null,
  stem text not null,                   -- original text, markdown + LaTeX
  marks numeric,                        -- overrides section marks for descriptive questions
  internal_choice_group text,           -- questions sharing a group are OR alternatives
  created_at timestamptz not null default now(),
  unique (section_id, position)
);

create table question_assets (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions (id) on delete cascade,
  storage_path text not null,           -- cropped diagram from the original PDF
  caption text
);

create table options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions (id) on delete cascade,
  label text not null,                  -- 'A', 'B', ...
  body text not null,
  unique (question_id, label)
);

-- Answer keys live apart from questions and options so that students, who can read
-- questions, never see them. Answers are revealed by server code after an attempt.
create table answer_keys (
  question_id uuid primary key references questions (id) on delete cascade,
  correct_labels text[] not null default '{}',   -- objective questions; several for bonus/dropped
  numerical_answer numeric,
  numerical_tolerance numeric not null default 0,
  source text not null default 'official' check (source in ('official', 'ai_consensus', 'admin'))
);

create table solutions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions (id) on delete cascade,
  source text not null check (source in ('marking_scheme', 'ai', 'admin')),
  steps jsonb not null,                 -- [{ "n": 1, "text": "...", "marks": 0.5 }]
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Taxonomy (closed lists: AI may only pick from these)
-- ---------------------------------------------------------------------------

create table chapters (
  id uuid primary key default gen_random_uuid(),
  subject_code text not null,           -- shared across exams: 'physics'
  class_level int not null check (class_level in (11, 12)),
  ncert_number int,
  name text not null,
  removed_from_syllabus_in int,         -- e.g. 2023 for rationalised chapters
  unique (subject_code, class_level, name)
);

create table topics (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters (id) on delete cascade,
  name text not null,
  unique (chapter_id, name)
);

create table concepts (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics (id) on delete cascade,
  name text not null,
  unique (topic_id, name)
);

create table concept_prerequisites (
  concept_id uuid not null references concepts (id) on delete cascade,
  prerequisite_id uuid not null references concepts (id) on delete cascade,
  primary key (concept_id, prerequisite_id),
  check (concept_id <> prerequisite_id)
);

create table misconceptions (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references concepts (id) on delete cascade,
  description text not null,
  unique (concept_id, description)
);

create type bloom_level as enum ('remember', 'understand', 'apply', 'analyze', 'evaluate', 'create');

-- ---------------------------------------------------------------------------
-- AI output (separate from originals, always attributable)
-- ---------------------------------------------------------------------------

create table ai_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,                    -- 'extract', 'tag', 'generate', 'verify', 'review'
  model text not null,
  prompt_version text not null,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10, 5),
  created_at timestamptz not null default now()
);

create table question_tags (
  question_id uuid primary key references questions (id) on delete cascade,
  chapter_id uuid not null references chapters (id),
  topic_id uuid references topics (id),
  bloom bloom_level not null,
  difficulty int check (difficulty between 1 and 5),
  confidence numeric check (confidence between 0 and 1),
  ai_run_id uuid references ai_runs (id),
  edited_by_admin boolean not null default false
);

create table question_concepts (
  question_id uuid not null references questions (id) on delete cascade,
  concept_id uuid not null references concepts (id),
  primary key (question_id, concept_id)
);

-- Diagnostic MCQs generated for a source question (most useful for descriptive PYQs).
create table diagnostic_items (
  id uuid primary key default gen_random_uuid(),
  source_question_id uuid not null references questions (id) on delete cascade,
  stem text not null,
  concept_id uuid not null references concepts (id),
  bloom bloom_level not null,
  confidence numeric check (confidence between 0 and 1),
  verified boolean not null default false,
  ai_run_id uuid references ai_runs (id),
  edited_by_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table diagnostic_options (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references diagnostic_items (id) on delete cascade,
  label text not null,
  body text not null,
  unique (item_id, label)
);

-- Kept apart from diagnostic_options for the same reason as answer_keys: a misconception
-- on an option gives away that it is wrong.
create table diagnostic_keys (
  option_id uuid primary key references diagnostic_options (id) on delete cascade,
  is_correct boolean not null,
  misconception_id uuid references misconceptions (id),
  check (not (is_correct and misconception_id is not null))
);

-- Which misconception each wrong option of an ORIGINAL objective question signals.
create table distractor_mappings (
  option_id uuid primary key references options (id) on delete cascade,
  misconception_id uuid not null references misconceptions (id),
  ai_run_id uuid references ai_runs (id),
  edited_by_admin boolean not null default false
);

create table review_flags (
  id uuid primary key default gen_random_uuid(),
  entity text not null,                 -- 'question', 'diagnostic_item', 'question_tags', ...
  entity_id uuid not null,
  reason text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table pipeline_jobs (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid references papers (id) on delete cascade,
  stage text not null check (stage in ('extract', 'tag', 'generate', 'verify')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Student activity
-- ---------------------------------------------------------------------------

create table attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles (id) on delete cascade,
  paper_id uuid not null references papers (id) on delete cascade,
  mode text not null check (mode in ('exam', 'practice')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  paper_score numeric,                  -- original marking scheme, computed in code
  paper_score_estimated boolean not null default false  -- true if any descriptive marks are AI estimates
);

create table responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references attempts (id) on delete cascade,
  question_id uuid references questions (id) on delete cascade,
  diagnostic_item_id uuid references diagnostic_items (id) on delete cascade,
  selected_labels text[] not null default '{}',
  numerical_value numeric,
  marked_for_review boolean not null default false,
  confidence int check (confidence between 1 and 3),
  time_spent_seconds int not null default 0,
  updated_at timestamptz not null default now(),
  check ((question_id is null) <> (diagnostic_item_id is null))
);

create unique index responses_attempt_question on responses (attempt_id, question_id) where question_id is not null;
create unique index responses_attempt_item on responses (attempt_id, diagnostic_item_id) where diagnostic_item_id is not null;

create table uploads (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references attempts (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  storage_path text not null,           -- 'rough-work' bucket, private
  created_at timestamptz not null default now()
);

create table step_reviews (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references uploads (id) on delete cascade,
  first_error_step int,
  error_type text check (error_type in ('none', 'conceptual', 'calculation', 'misread', 'incomplete', 'unclear')),
  estimated_marks numeric,
  feedback text not null,
  ai_run_id uuid references ai_runs (id),
  admin_override_marks numeric,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Learning model
-- ---------------------------------------------------------------------------

create table mastery (
  student_id uuid not null references profiles (id) on delete cascade,
  concept_id uuid not null references concepts (id) on delete cascade,
  score numeric not null default 0 check (score between 0 and 1),
  evidence_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (student_id, concept_id)
);

create table mastery_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles (id) on delete cascade,
  concept_id uuid not null references concepts (id) on delete cascade,
  response_id uuid references responses (id) on delete set null,
  misconception_id uuid references misconceptions (id),
  correct boolean not null,
  weight numeric not null default 1,
  created_at timestamptz not null default now()
);

create table recommendations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles (id) on delete cascade,
  concept_id uuid not null references concepts (id) on delete cascade,
  reason text not null,
  retest_on date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references profiles (id),
  entity text not null,
  entity_id uuid,
  change jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security
-- Content tables: readable by any signed-in user, writable only by admins.
-- Student tables: each student sees only their own rows; admins see all.
-- ---------------------------------------------------------------------------

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- Questions sit in a paper through their section.
create function question_in_paper(p_question uuid, p_paper uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from questions q join sections s on s.id = q.section_id
    where q.id = p_question and s.paper_id = p_paper
  );
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'exams', 'subjects', 'papers', 'sections', 'questions', 'question_assets', 'options',
    'chapters', 'topics', 'concepts', 'concept_prerequisites', 'misconceptions',
    'question_tags', 'question_concepts', 'diagnostic_items', 'diagnostic_options'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "%s read" on %I for select to authenticated using (true)', t, t);
    execute format('create policy "%s admin write" on %I for all to authenticated using (is_admin()) with check (is_admin())', t, t);
  end loop;

  -- Answer keys, solutions and distractor mappings give answers away, so students never read them.
  foreach t in array array[
    'answer_keys', 'diagnostic_keys', 'solutions', 'distractor_mappings',
    'ai_runs', 'review_flags', 'pipeline_jobs', 'audit_log'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "%s admin only" on %I for all to authenticated using (is_admin()) with check (is_admin())', t, t);
  end loop;
end $$;

alter table profiles enable row level security;
create policy "profiles self read" on profiles for select to authenticated using (id = auth.uid() or is_admin());
create policy "profiles admin write" on profiles for all to authenticated using (is_admin()) with check (is_admin());

-- Every new login gets a student profile; admins are promoted by hand.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(new.email, '@', 1), ''),
    'Student'
  ));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Students choose their own tracks.
alter table students_enrollments enable row level security;
create policy "enrollments own read" on students_enrollments for select to authenticated
  using (student_id = auth.uid() or is_admin());
create policy "enrollments own insert" on students_enrollments for insert to authenticated
  with check (student_id = auth.uid() or is_admin());
create policy "enrollments own delete" on students_enrollments for delete to authenticated
  using (student_id = auth.uid() or is_admin());

-- Students may start an attempt but never set its score or submission time; the server does.
alter table attempts enable row level security;
create policy "attempts own read" on attempts for select to authenticated
  using (student_id = auth.uid() or is_admin());
create function paper_is_ready(p_paper uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from papers where id = p_paper and status = 'ready');
$$;

create policy "attempts own start" on attempts for insert to authenticated
  with check (
    student_id = auth.uid()
    and submitted_at is null
    and paper_score is null
    and not paper_score_estimated
    and started_at between now() - interval '1 minute' and now() + interval '1 minute'
    and paper_is_ready(paper_id)
  );
create policy "attempts admin write" on attempts for all to authenticated
  using (is_admin()) with check (is_admin());

-- Learning model rows are computed by the server; students only read their own.
do $$
declare t text;
begin
  foreach t in array array['mastery', 'mastery_events', 'recommendations'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "%s own read" on %I for select to authenticated using (student_id = auth.uid() or is_admin())', t, t);
    execute format('create policy "%s admin write" on %I for all to authenticated using (is_admin()) with check (is_admin())', t, t);
  end loop;
end $$;

-- Answers can be saved only on the student's own open attempt, for questions of that paper.
create function can_answer(p_attempt uuid, p_question uuid, p_item uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from attempts a
    where a.id = p_attempt
      and a.student_id = auth.uid()
      and a.submitted_at is null
      and question_in_paper(
        coalesce(p_question, (select d.source_question_id from diagnostic_items d where d.id = p_item)),
        a.paper_id
      )
  );
$$;

alter table responses enable row level security;
create policy "responses own read" on responses for select to authenticated
  using (exists (select 1 from attempts a where a.id = attempt_id and (a.student_id = auth.uid() or is_admin())));
create policy "responses own insert" on responses for insert to authenticated
  with check (can_answer(attempt_id, question_id, diagnostic_item_id));
create policy "responses own update" on responses for update to authenticated
  using (can_answer(attempt_id, question_id, diagnostic_item_id))
  with check (can_answer(attempt_id, question_id, diagnostic_item_id));
create policy "responses admin write" on responses for all to authenticated
  using (is_admin()) with check (is_admin());

-- Rough-work photos: own attempt, a question of that paper, a single file directly in the
-- student's own folder, and only until 30 minutes after submission. Solutions must not be
-- revealed to the student before that window closes.
create function rough_work_open(p_attempt uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from attempts a
    where a.id = p_attempt
      and a.student_id = auth.uid()
      and (a.submitted_at is null or now() < a.submitted_at + interval '30 minutes')
  );
$$;

alter table uploads enable row level security;
create policy "uploads own read" on uploads for select to authenticated
  using (exists (select 1 from attempts a where a.id = attempt_id and (a.student_id = auth.uid() or is_admin())));
create policy "uploads own insert" on uploads for insert to authenticated
  with check (
    storage_path ~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]*$')
    and storage_path not like '%..%'
    and rough_work_open(attempt_id)
    and exists (select 1 from attempts a where a.id = attempt_id and question_in_paper(question_id, a.paper_id))
  );
create policy "uploads admin write" on uploads for all to authenticated
  using (is_admin()) with check (is_admin());

-- Step reviews are written by the server (service role); students can only read their own.
alter table step_reviews enable row level security;
create policy "step_reviews own read" on step_reviews for select to authenticated
  using (exists (
    select 1 from uploads u join attempts a on a.id = u.attempt_id
    where u.id = upload_id and (a.student_id = auth.uid() or is_admin())
  ));
create policy "step_reviews admin write" on step_reviews for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Storage buckets (private). Rough-work photos live under '<student uuid>/...'.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values
  ('papers', 'papers', false),
  ('question-assets', 'question-assets', false),
  ('rough-work', 'rough-work', false)
on conflict (id) do nothing;

create policy "papers admin" on storage.objects for all to authenticated
  using (bucket_id = 'papers' and is_admin()) with check (bucket_id = 'papers' and is_admin());

create policy "question assets read" on storage.objects for select to authenticated
  using (bucket_id = 'question-assets');
create policy "question assets admin write" on storage.objects for all to authenticated
  using (bucket_id = 'question-assets' and is_admin()) with check (bucket_id = 'question-assets' and is_admin());

-- Students can add photos to their own folder and read them, but never overwrite or delete
-- one, so a photo cannot be swapped after answers are revealed.
create policy "rough work own read" on storage.objects for select to authenticated
  using (bucket_id = 'rough-work' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
create policy "rough work own add" on storage.objects for insert to authenticated
  with check (bucket_id = 'rough-work' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "rough work admin" on storage.objects for all to authenticated
  using (bucket_id = 'rough-work' and is_admin()) with check (bucket_id = 'rough-work' and is_admin());
