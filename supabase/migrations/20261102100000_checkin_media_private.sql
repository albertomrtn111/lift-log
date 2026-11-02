-- Las fotos de progreso de los check-ins dejan de ser públicas.
--
-- El bucket `checkin-media` era público: cualquiera con la URL de una foto podía
-- verla sin iniciar sesión, aunque las políticas de storage ya limitaban la lectura
-- al coach del espacio y al propio atleta. La web pasa a pedir URLs firmadas
-- (createSignedUrl, 1 h), que sí respetan esas políticas.
--
-- Orden de despliegue: primero la web (las URLs firmadas funcionan con el bucket
-- público o privado) y después esta migración. Al revés, las fotos dejarían de
-- verse hasta desplegar la web.
--
-- Políticas que ya existen y no cambian (storage.objects, bucket checkin-media):
-- select, insert, update y delete para miembros activos del espacio
-- (primer segmento de la ruta = coach_id) y para el atleta
-- (segundo segmento = client_id con auth_user_id = auth.uid()).

update storage.buckets
set public = false
where id = 'checkin-media';
