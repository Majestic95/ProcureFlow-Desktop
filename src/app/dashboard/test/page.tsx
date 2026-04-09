import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, Wrench, Play, Database, Shield } from "lucide-react";

export default function TestPage() {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto py-6 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
          Development & Test Tools
        </h1>
        <p className="text-muted-foreground">
          Sandbox environment for developing and testing ongoing tools and features.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card
          className="border-none shadow-lg bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all cursor-pointer group"
          onClick={() => navigate('/dashboard/test/audit')}
        >
          <CardHeader>
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <Shield className="h-5 w-5 text-emerald-500" />
            </div>
            <CardTitle>Audit Trail</CardTitle>
            <CardDescription>Tamper-proof log of all system actions. Search, filter, and inspect audit entries.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
              <Play className="h-4 w-4" /> View Audit Logs
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all cursor-pointer group">
          <CardHeader>
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <Terminal className="h-5 w-5 text-primary" />
            </div>
            <CardTitle>Console Debugger</CardTitle>
            <CardDescription>View and interact with system logs and state.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-32 bg-black/5 rounded-md flex items-center justify-center border border-dashed border-muted-foreground/20">
               <span className="text-xs text-muted-foreground font-mono">No logs available</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all cursor-pointer group">
          <CardHeader>
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <Database className="h-5 w-5 text-blue-500" />
            </div>
            <CardTitle>Database Inspector</CardTitle>
            <CardDescription>Browse and validate Firestore collections.</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Play className="h-4 w-4" /> Run Connection Test
             </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all cursor-pointer group">
          <CardHeader>
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <Wrench className="h-5 w-5 text-purple-500" />
            </div>
            <CardTitle>UI Components Lab</CardTitle>
            <CardDescription>Test and iterate on new design system elements.</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="flex gap-2">
                <div className="h-4 w-12 bg-primary/20 rounded animate-pulse" />
                <div className="h-4 w-16 bg-blue-500/20 rounded animate-pulse" />
                <div className="h-4 w-8 bg-purple-500/20 rounded animate-pulse" />
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
