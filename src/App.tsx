import { AuthProvider } from '@/hooks/use-auth';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { TestingBanner } from '@/components/testing-banner';
import { AppRoutes } from './routes';

/**
 * Root App component for the Tauri desktop app.
 * Replaces Next.js src/app/layout.tsx as the top-level wrapper.
 */
export function App() {
  return (
    <AuthProvider>
      <TestingBanner />
      <FirebaseErrorListener />
      <AppRoutes />
      <Toaster />
    </AuthProvider>
  );
}
