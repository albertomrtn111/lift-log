-- NXT-186: datos de contacto que se piden en el formulario guiado del coach nuevo.
-- Solo añade columnas vacías; no cambia datos ni permisos.
-- El teléfono es de la persona (profiles); ciudad, Instagram y web, del negocio (coaches).
-- La web los escribe con la clave de servicio, así que no hacen falta políticas nuevas.

alter table public.profiles
    add column if not exists phone text;

alter table public.coaches
    add column if not exists city text,
    add column if not exists instagram text,
    add column if not exists website text;

comment on column public.profiles.phone is 'Teléfono de contacto de la persona (lo pide el formulario guiado del coach).';
comment on column public.coaches.city is 'Ciudad del negocio.';
comment on column public.coaches.instagram is 'Usuario de Instagram del negocio, sin @.';
comment on column public.coaches.website is 'Web del negocio.';
