import { Navigate, type RouteObject } from 'react-router';
import { Shell } from './Shell';
import { NotFound } from './NotFound';
import { ProjectsPage } from '../pages/projects/ProjectsPage';
import { ProjectFormPage } from '../pages/projects/ProjectFormPage';
import { ProjectDetailPage } from '../pages/project-detail/ProjectDetailPage';
import { AgentsPage } from '../pages/agents/AgentsPage';
import { AuthPage } from '../pages/auth/AuthPage';
import { SettingsPage } from '../pages/settings/SettingsPage';
/** D-007 frozen route map. Keep page implementations in their owners' folders. */
export const routes: RouteObject[] = [{ element: <Shell />, children: [
  { path: '/', element: <Navigate to="/projects" replace /> },
  { path: '/projects', element: <ProjectsPage /> },
  { path: '/projects/new', element: <ProjectFormPage /> },
  { path: '/projects/:projectId', element: <ProjectDetailPage /> },
  { path: '/projects/:projectId/edit', element: <ProjectFormPage /> },
  { path: '/agents', element: <AgentsPage /> },
  { path: '/settings', element: <SettingsPage title="Account settings" /> },
  { path: '/settings/tokens', element: <SettingsPage title="MCP tokens" /> },
  { path: '/settings/integrations', element: <SettingsPage title="Integration setup" /> },
  { path: '/login', element: <AuthPage title="Log in" /> },
  { path: '/register', element: <AuthPage title="Register" /> },
  { path: '/verify-email', element: <AuthPage title="Verify email" /> },
  { path: '/forgot-password', element: <AuthPage title="Forgot password" /> },
  { path: '/reset-password', element: <AuthPage title="Reset password" /> },
  { path: '/logout', element: <AuthPage title="Log out" /> },
  { path: '*', element: <NotFound /> },
] }];
