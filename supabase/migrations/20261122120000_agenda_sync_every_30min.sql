-- La agenda se sincroniza cada 30 minutos, no cada 5 (NXT: logs de Supabase).
--
-- Cada pasada son varias consultas y cada consulta deja logs, que cuentan en la cuota del plan.
-- En punto, la ventana completa (una vez por hora, como antes); a y media, hoy y mañana.

select cron.alter_job(
    (select jobid from cron.job where jobname = 'agenda-sync-quick'),
    schedule := '30 * * * *'
);

select cron.alter_job(
    (select jobid from cron.job where jobname = 'agenda-sync-full'),
    schedule := '0 * * * *'
);
