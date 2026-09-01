-- One row per (survey, developer) so a retried send job can't double-record.
CREATE UNIQUE INDEX IF NOT EXISTS survey_recipient_survey_user_key
  ON public.survey_recipient (survey_id, user_id);

-- Fast "when did this developer last get emailed, across any project".
CREATE INDEX IF NOT EXISTS survey_recipient_user_sent_idx
  ON public.survey_recipient (user_id, sent_at)
  WHERE status = 'sent';
