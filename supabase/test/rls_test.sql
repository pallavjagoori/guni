-- Row level security checks. Run after supabase_stubs.sql, migrations and seeds.
-- Any failed expectation raises an exception, which fails CI.


-- New logins get a student profile automatically.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ridhyansh@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'ridhyanshee@example.com'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@example.com');
update profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000ad';

do $$ begin
  if (select display_name from profiles where id = '00000000-0000-0000-0000-00000000000a') <> 'ridhyansh' then
    raise exception 'profile was not created from the new auth user';
  end if;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000ee', 'noname@example.com', '{"display_name": "  "}');
do $$ begin
  if (select display_name from profiles where id = '00000000-0000-0000-0000-0000000000ee') <> 'noname' then
    raise exception 'blank display name should fall back to the email prefix';
  end if;
end $$;

insert into exams (id, code, name) values ('10000000-0000-0000-0000-000000000001', 'cbse12', 'CBSE 12');
insert into subjects (id, exam_id, code, name)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'physics', 'Physics');
insert into papers (id, subject_id, year, duration_minutes, max_marks, status) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 2024, 180, 70, 'ready'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 2023, 180, 70, 'ready'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 2022, 180, 70, 'tagged');
insert into sections (id, paper_id, position, title, marks_correct) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1, 'A', 1),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 1, 'A', 1);
insert into questions (id, section_id, position, label, kind, stem) values
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 1, '1', 'mcq_single', 'Q in 2024'),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 1, '1', 'mcq_single', 'Q in 2023');
insert into options (id, question_id, label, body) values
  ('70000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'A', 'F/4'),
  ('70000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'B', 'F/2');
insert into answer_keys (question_id, correct_labels) values ('50000000-0000-0000-0000-000000000001', '{A}');
insert into solutions (question_id, source, steps)
  values ('50000000-0000-0000-0000-000000000001', 'marking_scheme', '[{"n": 1, "text": "F is proportional to 1/r^2"}]');
insert into chapters (id, subject_code, class_level, name) values ('80000000-0000-0000-0000-000000000001', 'test', 12, 'T');
insert into topics (id, chapter_id, name) values ('80000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000001', 'T');
insert into concepts (id, topic_id, name) values ('80000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000002', 'T');
insert into misconceptions (id, concept_id, description)
  values ('80000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-000000000003', 'inverse not inverse-square');
insert into distractor_mappings (option_id, misconception_id)
  values ('70000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000004');
insert into diagnostic_items (id, source_question_id, stem, concept_id, bloom)
  values ('90000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'D', '80000000-0000-0000-0000-000000000003', 'apply');
insert into diagnostic_options (id, item_id, label, body)
  values ('90000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', 'A', 'x');
insert into diagnostic_keys (option_id, is_correct) values ('90000000-0000-0000-0000-000000000002', true);
insert into attempts (id, student_id, paper_id, mode) values
  ('60000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', 'exam'),
  ('60000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000001', 'exam');

create function expect_denied(sql text, what text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when insufficient_privilege or check_violation then
    return;
  end;
  raise exception 'expected to be denied: %', what;
end $$;

create function expect_rows(sql text, expected bigint, what text) returns void language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || sql || ') t' into n;
  if n <> expected then raise exception '%: expected % rows, got %', what, expected, n; end if;
end $$;

create function expect_affected(sql text, expected bigint, what text) returns void language plpgsql as $$
declare n bigint;
begin
  execute sql;
  get diagnostics n = row_count;
  if n <> expected then raise exception '%: expected % rows changed, got %', what, expected, n; end if;
end $$;

-- Act as student A.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

select expect_rows('select * from attempts', 1, 'student sees only own attempts');
select expect_rows('select * from options', 2, 'student can read options');
select expect_rows('select * from questions', 2, 'student can read questions');
select expect_rows('select * from diagnostic_options', 1, 'student can read diagnostic options');
select expect_rows('select * from answer_keys', 0, 'student cannot read answer keys');
select expect_rows('select * from diagnostic_keys', 0, 'student cannot read diagnostic keys');
select expect_rows('select * from solutions', 0, 'student cannot read solutions');
select expect_rows('select * from distractor_mappings', 0, 'student cannot read distractor mappings');
select expect_denied(
  $q$insert into papers (subject_id, year, duration_minutes, max_marks)
     values ('20000000-0000-0000-0000-000000000001', 2022, 180, 70)$q$,
  'student creating a paper');

-- Scores are server-computed.
select expect_affected(
  $q$update attempts set paper_score = 70 where id = '60000000-0000-0000-0000-00000000000a'$q$,
  0, 'student updating own score');
select expect_denied(
  $q$insert into attempts (student_id, paper_id, mode, paper_score)
     values ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', 'exam', 70)$q$,
  'student starting an attempt with a score');
select expect_denied(
  $q$insert into attempts (student_id, paper_id, mode, started_at)
     values ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', 'exam', now() + interval '2 hours')$q$,
  'student backdating or postdating an attempt');
select expect_denied(
  $q$insert into attempts (student_id, paper_id, mode)
     values ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000003', 'exam')$q$,
  'student starting a paper that is not ready');
select expect_denied(
  $q$insert into mastery (student_id, concept_id, score)
     values ('00000000-0000-0000-0000-00000000000a', (select id from concepts limit 1), 1)$q$,
  'student writing own mastery');

-- Responses: own open attempt, questions of that paper only.
insert into responses (attempt_id, question_id, selected_labels)
  values ('60000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001', '{A}');
select expect_denied(
  $q$insert into responses (attempt_id, question_id, selected_labels)
     values ('60000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000002', '{A}')$q$,
  'answering a question from another paper');
select expect_denied(
  $q$insert into responses (attempt_id, question_id, selected_labels)
     values ('60000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-000000000001', '{A}')$q$,
  'answering on another student''s attempt');

-- Uploads must point at the student's own folder.
insert into uploads (attempt_id, question_id, storage_path)
  values ('60000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-00000000000a/q1.jpg');
select expect_denied(
  $q$insert into uploads (attempt_id, question_id, storage_path)
     values ('60000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001',
             '00000000-0000-0000-0000-00000000000b/q1.jpg')$q$,
  'pointing an upload at another student''s photo');
select expect_denied(
  $q$insert into uploads (attempt_id, question_id, storage_path)
     values ('60000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001',
             '00000000-0000-0000-0000-00000000000a/../00000000-0000-0000-0000-00000000000b/q1.jpg')$q$,
  'escaping the student folder with ..');
select expect_denied(
  $q$insert into storage.objects (bucket_id, name) values ('rough-work', '00000000-0000-0000-0000-00000000000b/x.jpg')$q$,
  'writing a photo into another student''s folder');
insert into storage.objects (bucket_id, name) values ('rough-work', '00000000-0000-0000-0000-00000000000a/q1.jpg');
select expect_affected(
  $q$update storage.objects set name = '00000000-0000-0000-0000-00000000000a/q1.jpg' where bucket_id = 'rough-work'$q$,
  0, 'overwriting a stored photo');
select expect_affected($q$delete from storage.objects where bucket_id = 'rough-work'$q$, 0, 'deleting a stored photo');

reset role;

-- Once submitted (by the server), answers are locked.
update attempts set submitted_at = now() where id = '60000000-0000-0000-0000-00000000000a';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select expect_affected(
  $q$update responses set selected_labels = '{B}'$q$,
  0, 'changing answers after submission');
insert into uploads (attempt_id, question_id, storage_path)
  values ('60000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-00000000000a/q1-late.jpg');  -- within 30 minutes: allowed
reset role;
update attempts set submitted_at = now() - interval '31 minutes' where id = '60000000-0000-0000-0000-00000000000a';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select expect_denied(
  $q$insert into uploads (attempt_id, question_id, storage_path)
     values ('60000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001',
             '00000000-0000-0000-0000-00000000000a/q1-later.jpg')$q$,
  'uploading rough work after the 30 minute window');

-- Admin sees everything.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000ad';
select expect_rows('select * from attempts', 2, 'admin sees all attempts');
reset role;

select 'rls checks passed';
