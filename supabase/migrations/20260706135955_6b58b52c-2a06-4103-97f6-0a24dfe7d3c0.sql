
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS meeting_held boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meeting_outcome text;

ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS meeting_held boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meeting_outcome text;
