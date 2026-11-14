-- Every-minute autopilot using Supabase's free pg_cron + pg_net.
-- Replace the URL and secret, then run once in the Supabase SQL editor.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('betx-autopilot') where exists (select 1 from cron.job where jobname = 'betx-autopilot');
select cron.schedule(
  'betx-autopilot',
  '* * * * *',
  $$ select net.http_get(
       url     := 'https://YOUR-APP.vercel.app/api/cron',
       headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
       timeout_milliseconds := 55000
     ); $$
);
