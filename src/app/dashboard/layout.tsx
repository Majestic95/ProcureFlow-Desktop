import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';
import { SidebarNav, useSidebar } from '@/components/layout/sidebar-nav';
import { Header } from '@/components/layout/header';
import { SidebarProvider } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import AccessDenied from '@/components/auth/access-denied';
import { GlobalPinBar } from '@/components/layout/global-pins';
import { ChangelogModal } from '@/components/layout/changelog-modal';

function DashboardContent() {
  const { isMobile, open, setOpen } = useSidebar();
  const isCollapsed = !open;

  return (
    <div className="flex min-h-screen w-full">
      {!isMobile && <SidebarNav isCollapsed={isCollapsed} setOpen={setOpen} />}
      <div
        className={cn(
          'flex flex-1 flex-col transition-all duration-300 ease-in-out min-w-0',
          !isMobile && (isCollapsed ? 'ml-16' : 'ml-64')
        )}
      >
        <Header />
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-background p-4 sm:p-6 pb-4">
          <Outlet />
        </main>
        <GlobalPinBar />
        <ChangelogModal />
      </div>
      {isMobile && <SidebarNav isCollapsed={false} setOpen={() => {}} />}
    </div>
  );
}

export default function DashboardLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user || user.isAnonymous) {
    return <AccessDenied />;
  }

  return (
    <SidebarProvider>
      <DashboardContent />
    </SidebarProvider>
  );
}
