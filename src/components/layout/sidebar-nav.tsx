import { Link } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { UpdateChecker } from '@/components/layout/update-checker';
import {
  FileText,
  LayoutDashboard,
  Settings,
  Users,
  Briefcase,
  Building,
  Map,
  Layers,
  Mailbox,
  Workflow,
  PanelLeft,
  ChevronLeft,
  ClipboardCheck,
  CalendarRange,
  Terminal,
  Shield,
  FolderKanban,
} from 'lucide-react';
import logoIcon from '@/assets/icon.png';

import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '../ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSidebar } from '../ui/sidebar';

const navGroups = [
  {
    label: 'General',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { href: '/dashboard/coverage', icon: Map, label: 'Coverage Map'},
    ]
  },
  {
    label: 'Registries',
    items: [
      { href: '/dashboard/clients', icon: Building, label: 'Clients' },
      { href: '/dashboard/suppliers', icon: Users, label: 'Suppliers' },
      { href: '/dashboard/templates', icon: Mailbox, label: 'Templates' },
    ]
  },
  {
    label: 'Planning',
    items: [
      { href: '/dashboard/projects', icon: FolderKanban, label: 'Projects' },
    ]
  },
  {
    label: 'Processes',
    items: [
      { href: '/dashboard/rfps', icon: FileText, label: 'RFPs' },
      { href: '/dashboard/proposals', icon: Layers, label: 'Proposals' },
      { href: '/dashboard/proposals/new', icon: Briefcase, label: 'Submit Proposal' },
    ]
  },
  {
    label: 'Development',
    items: [
      { href: '/dashboard/test', icon: Terminal, label: 'Dev Tools' },
      { href: '/dashboard/test/audit', icon: Shield, label: 'Audit Trail' },
    ]
  }
];

const bottomItems = [
  {
    href: '/dashboard/help',
    icon: ClipboardCheck,
    label: 'Instructions',
  },
  {
    href: '/dashboard/settings',
    icon: Settings,
    label: 'Settings',
  }
];

interface SidebarNavProps {
  isCollapsed: boolean;
  setOpen: (open: boolean) => void;
}

export function SidebarNav({ isCollapsed, setOpen }: SidebarNavProps) {
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const { toggleSidebar } = useSidebar();
  const { isAdmin } = useAuth();

  // Filter navigation items based on user role
  const filteredNavGroups = navGroups.map(group => ({
    ...group,
    items: group.items.filter(item => {
      // Restrict Templates, Clients and Dev Tools to admins only
      if (item.label === 'Templates' || item.label === 'Clients' || item.label === 'Dev Tools' || item.label === 'Audit Trail') {
        return isAdmin;
      }
      return true;
    })
  }));

  const renderNavItem = (item: any) => {
    const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
    
    if (isCollapsed) {
       return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to={item.href}
              className={cn(
                'flex items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-9 w-9',
                isActive && 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="sr-only">{item.label}</span>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="rounded-md px-3 py-1.5 text-xs shadow-md">{item.label}</TooltipContent>
        </Tooltip>
      );
    }
    
    return (
        <Link
          to={item.href}
          className={cn(
            'flex items-center rounded-lg text-sidebar-foreground/70 font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground px-3 py-2 mx-3 group',
            isActive && 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
          )}
        >
          <item.icon className={cn("h-[18px] w-[18px] transition-transform group-hover:scale-110", isActive && 'text-sidebar-primary-foreground')} />
          <span className="ml-3 text-sm">{item.label}</span>
        </Link>
    )
  };
  
  if (isMobile) {
    // Mobile bottom bar
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card sm:hidden pb-safe">
        <TooltipProvider>
        <nav className="flex items-center justify-around gap-1 p-2 overflow-x-auto">
            {filteredNavGroups[0].items.map((item) => (
                <div key={item.href} className="flex-shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link to={item.href} className={cn(
                        'flex flex-col items-center justify-center rounded-xl text-muted-foreground transition-all hover:text-foreground h-12 w-12 gap-1',
                        (pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))) && 'bg-primary/10 text-primary'
                      )}>
                        <item.icon className="h-5 w-5" />
                        <span className="text-[10px] leading-none shrink-0">{item.label.split(' ')[0]}</span>
                      </Link>
                    </TooltipTrigger>
                  </Tooltip>
                </div>
            ))}
            {bottomItems.map((item) => (
                <div key={item.href} className="flex-shrink-0">
                  <Tooltip>
                        <TooltipTrigger asChild>
                          <Link to={item.href} className={cn(
                            'flex flex-col items-center justify-center rounded-xl text-muted-foreground transition-all hover:text-foreground h-12 w-12 gap-1',
                            (pathname === item.href) && 'bg-primary/10 text-primary'
                          )}>
                            <item.icon className="h-5 w-5" />
                             <span className="text-[10px] leading-none shrink-0">{item.label.split(' ')[0]}</span>
                          </Link>
                        </TooltipTrigger>
                  </Tooltip>
                </div>
            ))}
        </nav>
        </TooltipProvider>
      </div>
    );
  }

  return (
      <aside className={cn(
        "fixed inset-y-0 left-0 z-10 flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-in-out",
        isCollapsed ? "w-16" : "w-64"
      )}>
        <TooltipProvider>
          <div className={cn(
            "flex h-14 items-center border-b border-sidebar-border px-4",
            isCollapsed ? "justify-center" : "justify-between"
            )}>
            <Link
              to="/dashboard"
              className={cn(
                "group flex items-center gap-3 text-base font-semibold text-sidebar-foreground",
                isCollapsed && "hidden"
              )}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-transparent overflow-hidden shadow-sm shadow-primary/20">
                <img src={logoIcon} alt="Logo" width={28} height={28} className="object-contain p-0.5" />
              </div>
              <span className="tracking-tight text-white font-bold">ProcureFlow</span>
            </Link>
             <Button variant="ghost" size="icon" onClick={toggleSidebar} className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white rounded-md h-8 w-8 transition-colors">
              <ChevronLeft className={cn("h-4 w-4 transition-transform", isCollapsed && "rotate-180")} />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] py-4 space-y-6">
             {filteredNavGroups.map((group, groupIdx) => (
                <div key={groupIdx} className="space-y-1">
                   {!isCollapsed && (
                     <h4 className="px-6 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 mb-2">
                       {group.label}
                     </h4>
                   )}
                   <nav className="flex flex-col gap-1">
                     {group.items.map((item) => (
                        <div key={item.href}>{renderNavItem(item)}</div>
                     ))}
                   </nav>
                </div>
             ))}
          </div>

          <div className="mt-auto p-3 mb-2 border-t border-sidebar-border">
            <nav className={cn("flex flex-col gap-1 pt-2", isCollapsed && "items-center")}>
              {bottomItems.map((item) => (
                <div key={item.href}>{renderNavItem(item)}</div>
              ))}
            </nav>
            {!isCollapsed && (
              <div className="mt-2 pt-2 border-t border-sidebar-border flex justify-center">
                <UpdateChecker />
              </div>
            )}
          </div>
        </TooltipProvider>
      </aside>
  );
}

export { useSidebar };
