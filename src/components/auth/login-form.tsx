import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';

/**
 * Desktop login form — in single-user mode, the user is always authenticated.
 * This component auto-redirects to the dashboard. Kept as a page in case
 * multi-user or PIN-lock auth is added in the future.
 */
export function LoginForm() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    // Auto-redirect to dashboard — user is always authenticated in desktop mode
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  return (
    <Card className="w-full max-w-sm shadow-lg">
      <CardHeader className="text-center flex flex-col items-center">
        <div className="mb-4">
          <img
            src="/login-logo.png"
            alt="ProcureFlow Icon"
            className="h-16 w-16 object-contain"
          />
        </div>
        <CardTitle className="text-2xl font-semibold tracking-tight">ProcureFlow</CardTitle>
        <CardDescription className="text-xs">Desktop Edition — Single User</CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        <p className="text-sm text-muted-foreground mb-4">Redirecting to dashboard...</p>
        <Button className="w-full" onClick={() => navigate('/dashboard', { replace: true })}>
          Open Dashboard
        </Button>
      </CardContent>
    </Card>
  );
}
