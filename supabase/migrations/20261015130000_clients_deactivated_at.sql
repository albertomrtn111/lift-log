-- Fecha de baja del atleta (día en la zona horaria del coach). Facturación la
-- usa para saber qué meses debía pagar: los que tenían el día de cobro antes
-- de la baja. Se limpia al reactivar.
--
-- Los atletas que ya estaban de baja quedan sin fecha: no sabemos cuándo se
-- dieron de baja, así que siguen sin ser facturables en ningún mes (como hasta
-- ahora). Sus registros existentes no cambian.
alter table public.clients
    add column if not exists deactivated_at date;

comment on column public.clients.deactivated_at is
    'Día en que el atleta se dio de baja (null si está activo o si se desconoce).';
