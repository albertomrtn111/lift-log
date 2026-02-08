'use client'

import { useState } from 'react'
import { Timer } from 'lucide-react'
import { WeekNavigation } from '@/components/running/WeekNavigation'
import { WeeklySummaryCard } from '@/components/running/WeeklySummaryCard'
import { RunningDayCard } from '@/components/running/RunningDayCard'
import { RunningSessionDetail } from '@/components/running/RunningSessionDetail'
import { RecentSessionsList } from '@/components/running/RecentSessionsList'
import {
    mockRunningSessions,
    mockWeeklySummary,
    mockSessionLogs,
    mockPreviousSessions
} from '@/data/runningMockData'
import { RunningSession, SessionLog } from '@/types/running'

export default function RunningPage() {
    const [currentWeek, setCurrentWeek] = useState(4)
    const [selectedSession, setSelectedSession] = useState<RunningSession | null>(null)
    const [sessions, setSessions] = useState(mockRunningSessions)
    const [summary, setSummary] = useState(mockWeeklySummary)

    const handleSessionClick = (session: RunningSession) => {
        setSelectedSession(session)
    }

    const handleSaveLog = (log: Partial<SessionLog>) => {
        // Mark session as completed
        setSessions(prev =>
            prev.map(s =>
                s.id === log.sessionId
                    ? { ...s, isCompleted: true }
                    : s
            )
        )

        // Update summary
        if (log.actualDistance) {
            setSummary(prev => ({
                ...prev,
                completedDistance: prev.completedDistance + log.actualDistance!,
                completedSessions: prev.completedSessions + 1,
            }))
        }
    }

    const existingLog = selectedSession
        ? mockSessionLogs.find(l => l.sessionId === selectedSession.id)
        : undefined

    return (
        <div className="min-h-screen pb-4">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 py-4">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Timer className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-foreground">Running</h1>
                            <p className="text-sm text-muted-foreground">Tu plan de carrera</p>
                        </div>
                    </div>

                    <WeekNavigation
                        currentWeek={currentWeek}
                        totalWeeks={8}
                        onWeekChange={setCurrentWeek}
                    />
                </div>
            </header>

            <div className="px-4 pt-4 space-y-4">
                {/* Weekly summary */}
                <WeeklySummaryCard summary={summary} />

                {/* Week calendar */}
                <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Esta semana</h3>
                    <div className="space-y-2">
                        {sessions.map((session) => (
                            <RunningDayCard
                                key={session.id}
                                session={session}
                                onClick={() => handleSessionClick(session)}
                            />
                        ))}
                    </div>
                </div>

                {/* Recent sessions */}
                <RecentSessionsList sessions={mockPreviousSessions} />
            </div>

            {/* Session detail sheet */}
            <RunningSessionDetail
                session={selectedSession}
                existingLog={existingLog}
                open={!!selectedSession}
                onOpenChange={(open) => !open && setSelectedSession(null)}
                onSave={handleSaveLog}
            />
        </div>
    )
}
