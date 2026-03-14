-- Coach puede leer fotos de sus propios clientes
CREATE POLICY "Coaches can read own client media"
    ON public.checkin_media FOR SELECT
    USING (
        coach_id = (SELECT id FROM public.coaches WHERE created_by = auth.uid()) OR
        coach_id IN (
            SELECT coach_id FROM public.coaches WHERE created_by = auth.uid()
        )
    );
