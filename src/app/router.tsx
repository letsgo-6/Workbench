import { createHashRouter } from 'react-router';
import { AppShell } from './layout/AppShell';
import { Failure, Loading } from '@/components/common/Feedback';
import { t } from '@/i18n';
export const router = createHashRouter([
  {
    element: <AppShell />,
    HydrateFallback: Loading,
    errorElement: (
      <Failure
        error={new Error(t('common.failure'))}
        retry={() => location.reload()}
      />
    ),
    children: [
      {
        path: '/',
        lazy: async () => ({
          Component: (await import('@/features/dashboard/DashboardPage'))
            .DashboardPage,
        }),
      },
      {
        path: 'ideas/:id?',
        lazy: async () => ({
          Component: (await import('@/features/ideas/IdeaPage')).IdeaPage,
        }),
      },
      {
        path: 'todos/:id?',
        lazy: async () => ({
          Component: (await import('@/features/todos/TodoPage')).TodoPage,
        }),
      },
      {
        path: 'tips/:id?',
        lazy: async () => ({
          Component: (await import('@/features/tips/TipPage')).TipPage,
        }),
      },
      {
        path: 'skills/:id?',
        lazy: async () => ({
          Component: (await import('@/features/skills/SkillPage')).SkillPage,
        }),
      },
      {
        path: 'prompts/:id?',
        lazy: async () => ({
          Component: (await import('@/features/prompts/PromptPage')).PromptPage,
        }),
      },
      {
        path: 'trash',
        lazy: async () => ({
          Component: (await import('@/features/trash/TrashPage')).TrashPage,
        }),
      },
      {
        path: 'settings/:section?',
        lazy: async () => ({
          Component: (await import('@/features/settings/SettingsPage'))
            .SettingsPage,
        }),
      },
    ],
  },
]);
