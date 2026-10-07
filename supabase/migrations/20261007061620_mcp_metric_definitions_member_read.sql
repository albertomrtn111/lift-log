-- Coaches invited to a workspace need the labels for body metrics stored in check-ins.
-- The existing owner and client policies remain in place.
create policy metric_definitions_select_active_coach_member
on public.metric_definitions
for select
to authenticated
using (public.is_coach_member(coach_id));
