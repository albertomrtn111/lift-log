-- Modo Sala F0-7: el equipo de NexTrain da de alta una sala e invita a su propietario.
-- Estas invitaciones solo las crea la clave de servicio, como todas las demás.

alter table public.coach_invitations drop constraint coach_invitations_role_check;

alter table public.coach_invitations
    add constraint coach_invitations_role_check
    check (role in ('owner', 'admin', 'coach', 'reception'));
