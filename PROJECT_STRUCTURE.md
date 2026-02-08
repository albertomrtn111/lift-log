.
|____ANSWER_TO_USER.md
|____PROJECT_STRUCTURE.md
|____README.md
|____app
| |____(app)
| | |____diet
| | | |____DietPageClient.tsx
| | | |____loading.tsx
| | | |____page.tsx
| | |____layout.tsx
| | |____profile
| | | |____loading.tsx
| | | |____page.tsx
| | |____progress
| | | |____loading.tsx
| | | |____page.tsx
| | |____routine
| | | |____loading.tsx
| | | |____page.tsx
| | |____running
| | | |____loading.tsx
| | | |____page.tsx
| | |____summary
| | | |____loading.tsx
| | | |____page.tsx
| |____(auth)
| | |____layout.tsx
| | |____login
| | | |____page.tsx
| | |____select-mode
| | | |____page.tsx
| | |____signup
| | | |____page.tsx
| |____(coach)
| | |____coach
| | | |____calendar
| | | |____clients
| | | |____dashboard
| | | |____members
| | | |____profile
| | |____layout.tsx
| |____api
| | |____me
| | | |____route.ts
| |____layout.tsx
| |____page.tsx
| |____providers.tsx
|____components.json
|____middleware.ts
|____next-env.d.ts
|____next.config.mjs
|____package-lock.json
|____package.json
|____postcss.config.js
|____public
| |____favicon.ico
| |____placeholder.svg
| |____robots.txt
|____sql
| |____clients_rls_policies.sql
|____src
| |____components
| | |____backfill
| | | |____BackfillModal.tsx
| | | |____DietBackfillContent.tsx
| | | |____ProgressBackfillContent.tsx
| | |____coach
| | | |____AddClientButton.tsx
| | | |____CalendarView.tsx
| | | |____ClientWorkspace.tsx
| | | |____CoachSidebar.tsx
| | | |____EditClientModal.tsx
| | | |____LogoutButton.tsx
| | | |____MembersPageClient.tsx
| | | |____MembersTable.tsx
| | | |____actions.ts
| | | |____dashboard
| | | |____tabs
| | | |____workspace
| | |____debug
| | | |____CoachDebugPanel.tsx
| | | |____RoleDebugPanel.tsx
| | |____layout
| | | |____BottomNav.tsx
| | | |____ModeSwitch.tsx
| | |____routine
| | | |____DayTabs.tsx
| | | |____ExerciseTable.tsx
| | | |____MobileExerciseCards.tsx
| | | |____WeekSelector.tsx
| | |____running
| | | |____RecentSessionsList.tsx
| | | |____RunningDayCard.tsx
| | | |____RunningSessionDetail.tsx
| | | |____WeekNavigation.tsx
| | | |____WeeklySummaryCard.tsx
| | |____ui
| | | |____accordion.tsx
| | | |____alert-dialog.tsx
| | | |____alert.tsx
| | | |____aspect-ratio.tsx
| | | |____avatar.tsx
| | | |____badge.tsx
| | | |____breadcrumb.tsx
| | | |____button.tsx
| | | |____calendar.tsx
| | | |____card.tsx
| | | |____carousel.tsx
| | | |____chart.tsx
| | | |____checkbox.tsx
| | | |____collapsible.tsx
| | | |____command.tsx
| | | |____context-menu.tsx
| | | |____dialog.tsx
| | | |____drawer.tsx
| | | |____dropdown-menu.tsx
| | | |____form.tsx
| | | |____hover-card.tsx
| | | |____input-otp.tsx
| | | |____input.tsx
| | | |____label.tsx
| | | |____menubar.tsx
| | | |____navigation-menu.tsx
| | | |____pagination.tsx
| | | |____popover.tsx
| | | |____progress.tsx
| | | |____radio-group.tsx
| | | |____resizable.tsx
| | | |____scroll-area.tsx
| | | |____select.tsx
| | | |____separator.tsx
| | | |____sheet.tsx
| | | |____sidebar.tsx
| | | |____skeleton.tsx
| | | |____slider.tsx
| | | |____sonner.tsx
| | | |____switch.tsx
| | | |____table.tsx
| | | |____tabs.tsx
| | | |____textarea.tsx
| | | |____toast.tsx
| | | |____toaster.tsx
| | | |____toggle-group.tsx
| | | |____toggle.tsx
| | | |____tooltip.tsx
| | | |____use-toast.ts
| |____contexts
| | |____UserContext.tsx
| |____data
| | |____calendar.ts
| | |____coach.ts
| | |____dashboard.ts
| | |____diet.ts
| | |____members.ts
| | |____mockData.ts
| | |____nutrition
| | | |____README.md
| | | |____dietOptions.ts
| | | |____macros.ts
| | | |____types.ts
| | |____runningMockData.ts
| | |____training.ts
| | |____workspace.ts
| |____hooks
| | |____use-app-mode.ts
| | |____use-mobile.tsx
| | |____use-toast.ts
| | |____useDietOptions.ts
| | |____useMacroPlan.ts
| |____index.css
| |____lib
| | |____auth
| | | |____get-user-context.ts
| | | |____get-user-role.ts
| | |____mode-utils.ts
| | |____supabase
| | | |____client.ts
| | | |____helpers.ts
| | | |____middleware.ts
| | | |____server.ts
| | |____utils.ts
| |____types
| | |____coach.ts
| | |____running.ts
| | |____training.ts
|____tailwind.config.ts
|____tsconfig.json
