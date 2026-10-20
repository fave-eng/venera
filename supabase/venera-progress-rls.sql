-- Applied in the shared project 2026-10-20.
-- Venera-only policies. Don't change any other student's policies.
-- Use only if setting up from scratch, not necessary to rerun.
CREATE POLICY venera_homework_progress_select ON public.homework_progress FOR SELECT TO anon USING (student_id = 'venera');
CREATE POLICY venera_homework_progress_insert ON public.homework_progress FOR INSERT TO anon WITH CHECK (student_id = 'venera');
CREATE POLICY venera_homework_progress_update ON public.homework_progress FOR UPDATE TO anon USING (student_id = 'venera') WITH CHECK (student_id = 'venera');
CREATE POLICY venera_vocabulary_progress_select ON public.vocabulary_progress FOR SELECT TO anon USING (student_id = 'venera');
CREATE POLICY venera_vocabulary_progress_insert ON public.vocabulary_progress FOR INSERT TO anon WITH CHECK (student_id = 'venera');
CREATE POLICY venera_vocabulary_progress_update ON public.vocabulary_progress FOR UPDATE TO anon USING (student_id = 'venera') WITH CHECK (student_id = 'venera');
CREATE POLICY venera_vocabulary_topic_progress_select ON public.vocabulary_topic_progress FOR SELECT TO anon USING (student_id = 'venera');
CREATE POLICY venera_vocabulary_topic_progress_insert ON public.vocabulary_topic_progress FOR INSERT TO anon WITH CHECK (student_id = 'venera');
CREATE POLICY venera_vocabulary_topic_progress_update ON public.vocabulary_topic_progress FOR UPDATE TO anon USING (student_id = 'venera') WITH CHECK (student_id = 'venera');
CREATE POLICY venera_grammar_progress_select ON public.grammar_progress FOR SELECT TO anon USING (student_id = 'venera');
CREATE POLICY venera_grammar_progress_insert ON public.grammar_progress FOR INSERT TO anon WITH CHECK (student_id = 'venera');
CREATE POLICY venera_grammar_progress_update ON public.grammar_progress FOR UPDATE TO anon USING (student_id = 'venera') WITH CHECK (student_id = 'venera');
