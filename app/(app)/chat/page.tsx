import { redirect } from 'next/navigation'
import { ClientChat } from '@/components/chat/ClientChat'
import { getAthleteModules } from '@/data/athlete-modules'
import { athleteHome } from '@/lib/athlete/module-rules'

export default async function ChatPage() {
    const modules = await getAthleteModules()
    if (!modules.chat) redirect(athleteHome(modules))

    return <ClientChat />
}
