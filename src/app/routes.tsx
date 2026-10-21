import { Navigate, type RouteObject } from 'react-router';
import { SessionGuard } from './SessionGuard';
import { Shell } from './Shell';
import { NotFound } from './NotFound';
import { PublicAgentsPage } from '../pages/public/PublicAgentsPage';
import { ProjectsPage } from '../pages/projects/ProjectsPage';
import { ProjectFormPage } from '../pages/projects/ProjectFormPage';
import { ProjectDetailPage } from '../pages/project-detail/ProjectDetailPage';
import { NeedsMePage } from '../pages/needs-me/NeedsMePage';
import { AgentsPage } from '../pages/agents/AgentsPage';
import { AuthPage } from '../pages/auth/AuthPage';
import { SettingsPage } from '../pages/settings/SettingsPage';
/** D-007 route map, plus the operator's public agents page outside the session. */
export const routes: RouteObject[] = [
  { path: '/public/:handle', element: <PublicAgentsPage /> },
  { path: '/public/:handle/agents', element: <PublicAgentsPage /> },
  { element: <Shell />, children: [
  { path: '/', element: <Navigate to="/projects" replace /> },
  { path: '/needs-me', element: <SessionGuard><NeedsMePage /></SessionGuard> },
  { path: '/projects', element: <SessionGuard><ProjectsPage /></SessionGuard> },
  { path: '/projects/new', element: <SessionGuard><ProjectFormPage /></SessionGuard> },
  { path: '/projects/:projectId', element: <SessionGuard><ProjectDetailPage /></SessionGuard> },
  { path: '/projects/:projectId/edit', element: <SessionGuard><ProjectFormPage /></SessionGuard> },
  { path: '/agents', element: <SessionGuard><AgentsPage /></SessionGuard> },
  { path: '/settings', element: <SessionGuard><SettingsPage title="Account settings" /></SessionGuard> },
  { path: '/settings/tokens', element: <SessionGuard><SettingsPage title="MCP tokens" /></SessionGuard> },
  { path: '/settings/invites', element: <SessionGuard><SettingsPage title="Invites" /></SessionGuard> },
  { path: '/settings/integrations', element: <SessionGuard><SettingsPage title="Integration setup" /></SessionGuard> },
  { path: '/login', element: <AuthPage title="Log in" /> },
  { path: '/register', element: <AuthPage title="Register" /> },
  { path: '/verify-email', element: <AuthPage title="Verify email" /> },
  { path: '/forgot-password', element: <AuthPage title="Forgot password" /> },
  { path: '/reset-password', element: <AuthPage title="Reset password" /> },
  { path: '/logout', element: <AuthPage title="Log out" /> },
  { path: '*', element: <NotFound /> },
  ] },
];
