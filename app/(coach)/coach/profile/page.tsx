import { redirect } from 'next/navigation'

export default function CoachProfilePage() {
    redirect('/coach/settings?tab=perfil')
}
