import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { CircleUser, LogOut, Settings, PanelLeft, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { useSidebar } from './sidebar-nav';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEffect, useState } from 'react';
import { ChangelogButton } from '@/components/layout/changelog-modal';


export function Header() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toggleSidebar } = useSidebar();
  const isMobile = useIsMobile();

  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const initial = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(initial);
    document.documentElement.classList.toggle('dark', initial === 'dark');
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  const handleSignOut = () => {
    // In desktop single-user mode, sign-out just navigates to login
    // (which auto-redirects back). Kept for future multi-user support.
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-10 flex h-12 items-center justify-end gap-4 border-b bg-card px-4 sm:px-6">
       {isMobile && (
          <Button variant="ghost" size="icon" className="mr-auto" onClick={toggleSidebar}>
            <PanelLeft className="h-5 w-5" />
            <span className="sr-only">Toggle Sidebar</span>
          </Button>
        )}
      {(profile?.name || user?.displayName || user?.email) && (
        <span className="text-xs text-muted-foreground">
          {profile?.name || user?.displayName || user?.email}
        </span>
      )}
      <ChangelogButton />
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
        {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        <span className="sr-only">Toggle theme</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" className="rounded-full h-8 w-8">
            <CircleUser className="h-4 w-4" />
            <span className="sr-only">Toggle user menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/dashboard/settings" className='cursor-pointer'>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className='cursor-pointer'>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Logout</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
