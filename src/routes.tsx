/**
 * React Router route definitions for the Tauri desktop app.
 * Replaces Next.js file-based routing.
 *
 * Each route maps to an existing page component from src/app/.
 * Layouts are handled via nested routes with <Outlet />.
 */

import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

// Layouts
import DashboardLayout from '@/app/dashboard/layout';

// Lazy-load pages for code splitting
const LoginPage = lazy(() => import('@/app/(auth)/login/page'));
const HomePage = lazy(() => import('@/app/page'));
const PortalPage = lazy(() => import('@/app/portal/[rfpId]/page'));

// Dashboard pages
const DashboardHome = lazy(() => import('@/app/dashboard/page'));
const ProjectsPage = lazy(() => import('@/app/dashboard/projects/page'));
const ProjectDetailPage = lazy(() => import('@/app/dashboard/projects/[id]/page'));
const RfpsPage = lazy(() => import('@/app/dashboard/rfps/page'));
const RfpDetailPage = lazy(() => import('@/app/dashboard/rfps/[id]/page'));
const RfpEditPage = lazy(() => import('@/app/dashboard/rfps/[id]/edit/page'));
const RfpComparePage = lazy(() => import('@/app/dashboard/rfps/[id]/compare/page'));
const NewRfpPage = lazy(() => import('@/app/dashboard/rfps/new/page'));
const NewadvancedRfpPage = lazy(() => import('@/app/dashboard/rfps/new-advanced/page'));
const ProposalsPage = lazy(() => import('@/app/dashboard/proposals/page'));
const ProposalDetailPage = lazy(() => import('@/app/dashboard/proposals/[id]/page'));
const NewProposalPage = lazy(() => import('@/app/dashboard/proposals/new/page'));
const SuppliersPage = lazy(() => import('@/app/dashboard/suppliers/page'));
const SupplierDetailPage = lazy(() => import('@/app/dashboard/suppliers/[id]/page'));
const SupplierEditPage = lazy(() => import('@/app/dashboard/suppliers/[id]/edit/page'));
const NewSupplierPage = lazy(() => import('@/app/dashboard/suppliers/new/page'));
const ClientsPage = lazy(() => import('@/app/dashboard/clients/page'));
const NewClientPage = lazy(() => import('@/app/dashboard/clients/new/page'));
const TemplatesPage = lazy(() => import('@/app/dashboard/templates/page'));
const TemplateEditPage = lazy(() => import('@/app/dashboard/templates/[id]/edit/page'));
const NewTemplatePage = lazy(() => import('@/app/dashboard/templates/new/page'));
const SchedulesPage = lazy(() => import('@/app/dashboard/schedules/page'));
const ScheduleDetailPage = lazy(() => import('@/app/dashboard/schedules/[id]/page'));
const ScheduleSummaryPage = lazy(() => import('@/app/dashboard/schedules/summary/page'));
const CoveragePage = lazy(() => import('@/app/dashboard/coverage/page'));
const HelpPage = lazy(() => import('@/app/dashboard/help/page'));
const SettingsPage = lazy(() => import('@/app/dashboard/settings/page'));
const UsersPage = lazy(() => import('@/app/dashboard/settings/users/page'));
const DevToolsPage = lazy(() => import('@/app/dashboard/test/page'));
const AuditTrailPage = lazy(() => import('@/app/dashboard/test/audit/page'));

function Loading() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/portal/:rfpId" element={<PortalPage />} />

        {/* Dashboard routes (protected by layout) */}
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardHome />} />

          {/* Projects */}
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />

          {/* RFPs */}
          <Route path="rfps" element={<RfpsPage />} />
          <Route path="rfps/new" element={<NewRfpPage />} />
          <Route path="rfps/new-advanced" element={<NewadvancedRfpPage />} />
          <Route path="rfps/:id" element={<RfpDetailPage />} />
          <Route path="rfps/:id/edit" element={<RfpEditPage />} />
          <Route path="rfps/:id/compare" element={<RfpComparePage />} />

          {/* Proposals */}
          <Route path="proposals" element={<ProposalsPage />} />
          <Route path="proposals/new" element={<NewProposalPage />} />
          <Route path="proposals/:id" element={<ProposalDetailPage />} />

          {/* Suppliers */}
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="suppliers/new" element={<NewSupplierPage />} />
          <Route path="suppliers/:id" element={<SupplierDetailPage />} />
          <Route path="suppliers/:id/edit" element={<SupplierEditPage />} />

          {/* Clients */}
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/new" element={<NewClientPage />} />

          {/* Templates */}
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="templates/new" element={<NewTemplatePage />} />
          <Route path="templates/:id/edit" element={<TemplateEditPage />} />

          {/* Schedules (legacy) */}
          <Route path="schedules" element={<SchedulesPage />} />
          <Route path="schedules/summary" element={<ScheduleSummaryPage />} />
          <Route path="schedules/:id" element={<ScheduleDetailPage />} />

          {/* Coverage */}
          <Route path="coverage" element={<CoveragePage />} />

          {/* Help */}
          <Route path="help" element={<HelpPage />} />

          {/* Settings */}
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/users" element={<UsersPage />} />

          {/* Dev Tools */}
          <Route path="test" element={<DevToolsPage />} />
          <Route path="test/audit" element={<AuditTrailPage />} />
        </Route>

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
