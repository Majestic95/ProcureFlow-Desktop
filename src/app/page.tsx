import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (user && !user.isAnonymous && profile) {
        navigate('/dashboard', { replace: true });
      } else if (user && !user.isAnonymous && !profile) {
        // User signed in but has no invite/profile — show access denied
        navigate('/login?denied=true', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    }
  }, [user, profile, loading, navigate]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
