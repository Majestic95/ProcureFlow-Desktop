import { LoginForm } from '@/components/auth/login-form';
import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
