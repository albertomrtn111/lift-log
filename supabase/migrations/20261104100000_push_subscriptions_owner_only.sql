-- Las suscripciones de avisos solo las lee su dueño. El servidor usa la clave de servicio,
-- que no pasa por estas políticas, así que esta política de lectura no hacía falta.

drop policy if exists push_subscriptions_service_read on public.push_subscriptions;
