import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Lock, FileQuestion, ChevronLeft } from 'lucide-react';

export default function AccessDenied({ inline }: { inline?: boolean }) {
  const navigate = useNavigate();

  return (
    <div className={`flex flex-col items-center justify-center bg-background px-6 relative overflow-hidden ${inline ? 'min-h-[60vh]' : 'min-h-screen'}`}>
      {/* Background Decor */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-900 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-md text-center space-y-10">
        <div className="mx-auto w-24 h-24 bg-card rounded-[2.5rem] flex items-center justify-center border border-border shadow-2xl backdrop-blur-md animate-in zoom-in duration-500">
          <FileQuestion className="h-12 w-12 text-muted-foreground/50" />
        </div>

        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
          <h1 className="text-4xl font-black tracking-tighter text-foreground sm:text-5xl">404</h1>
          <p className="text-xl text-muted-foreground font-medium">This page does not exist.</p>
        </div>

        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
          <Button 
            size="lg" 
            className="h-16 rounded-2xl bg-sidebar-background text-white hover:bg-sidebar-accent font-bold shadow-xl transition-all active:scale-[0.98] uppercase tracking-widest text-sm"
            onClick={() => navigate('/login')}
          >
            Sign In to ProcureFlow
          </Button>
          
          <Button 
            variant="ghost" 
            className="h-12 rounded-xl text-muted-foreground font-bold hover:text-foreground hover:bg-transparent flex items-center justify-center gap-2 group"
            onClick={() => navigate(-1)}
          >
            <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Go Back
          </Button>
        </div>
      </div>

      <footer className="absolute bottom-10 w-full text-center">
        <p className="text-[10px] text-muted-foreground/40 font-bold uppercase tracking-[0.2em]">
          &copy; 2026 ProcureFlow Global • Mission Critical Sourcing
        </p>
      </footer>
    </div>
  );
}
