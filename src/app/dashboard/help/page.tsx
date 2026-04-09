import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Building, 
  FileText, 
  Layers, 
  LayoutDashboard, 
  Map, 
  Settings, 
  Users, 
  Workflow, 
  CalendarRange, 
  Trophy,
  ArrowRight,
  Sparkles,
  Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';

const steps = [
  {
    title: '1. Dashboard & Visibility',
    description: 'Centralized Procurement Control',
    icon: LayoutDashboard,
    details: 'The Executive Dashboard serves as your mission control. Monitor Published RFPs, Total Hard Savings, and Budget vs Market response in real-time. Use the Coverage Map to identify geographic supply gaps and ensure global resilience.',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20'
  },
  {
    title: '2. Foundational Registries',
    description: 'Master Data Management',
    icon: Building,
    details: 'Standardize your data before launching bids. Manage Clients, maintain deep Supplier prequalification profiles (including HSE and Financials), and curate Email Templates for automated, professional communications.',
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500/20'
  },
  {
    title: '3. Strategic Planning',
    description: 'Smart Schedules & Milestones',
    icon: CalendarRange,
    details: 'Navigate the Procurement Schedule to track milestones from initial tender to final award. Synchronize your team on critical dates for technical evaluation and commercial negotiation phases.',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20'
  },
  {
    title: '4. RFP Execution',
    description: 'Managing the Tender Lifecycle',
    icon: FileText,
    details: 'Create and launch RFPs with integrated specifications. Track statuses from Draft to Accepting Proposals. Suppliers receive unique access codes to submit their bids through our secure, encrypted portal.',
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
    borderColor: 'border-pink-500/20'
  },
  {
    title: '5. AI Analysis & Scoring',
    description: 'Intelligent Decision Support',
    icon: Sparkles,
    details: 'Leverage AI to analyze complex technical and commercial proposals. Automatically extract pricing, summarize risks, and score vendors against your benchmarks to find the highest-value partner.',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20'
  },
  {
    title: '6. Strategic Award',
    description: 'Finalizing the Value Chain',
    icon: Trophy,
    details: 'Seal the deal with the Winning Bid. Record hard savings, finalize contract terms, and transition to the execution phase with all documentation archived and searchable for future audits.',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20'
  }
];

export default function HelpPage() {
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Sequential reveal
    steps.forEach((_, index) => {
      setTimeout(() => {
        setActiveStep(index);
      }, index * 200 + 100);
    });
  }, []);

  return (
    <div className="bg-slate-50/30 dark:bg-transparent pb-20">
      <div className="container mx-auto px-6 max-w-6xl py-12">
        {/* Header Section */}
        <div className="text-center mb-20 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/5 border border-primary/10 text-primary text-xs font-bold uppercase tracking-widest mb-6 shadow-sm">
            <Search className="h-3 w-3" /> System Overview
          </div>
          <h1 className="text-5xl font-black tracking-tight mb-6 bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 dark:from-white dark:via-slate-400 dark:to-white bg-clip-text text-transparent">
            Master the ProcureFlow Lifecycle
          </h1>
          <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto font-medium leading-relaxed">
            From foundational master data to AI-driven final awards, our platform orchestrates every stage of modern procurement in one unified environment.
          </p>
        </div>

        {/* Workflow Path */}
        <div className="relative" ref={containerRef}>
          {/* Connecting Vertical Line (Hidden on Mobile) */}
          <div className="hidden md:block absolute left-1/2 top-10 bottom-10 w-px bg-gradient-to-b from-blue-500 via-purple-500 to-amber-500 opacity-20 transform -translate-x-1/2" />
          
          <div className="space-y-12 md:space-y-24 relative">
            {steps.map((step, idx) => {
               const isEven = idx % 2 === 0;
               const isLast = idx === steps.length - 1;
               const isVisible = activeStep !== null && activeStep >= idx;

               return (
                <div 
                  key={idx} 
                  className={cn(
                    "relative flex flex-col md:flex-row items-center justify-center gap-8 md:gap-24 transition-all duration-1000",
                    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
                  )}
                >
                  {/* Content Card (Zig-Zag) */}
                  <div className={cn(
                    "w-full md:w-1/2 flex",
                    isEven ? "md:justify-end order-2 md:order-1" : "md:justify-start order-2"
                  )}>
                    <Card className={cn(
                      "group w-full max-w-md border-sidebar-border bg-white/60 dark:bg-card/40 backdrop-blur-xl shadow-2xl rounded-[2.5rem] overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-indigo-500/10",
                      step.borderColor
                    )}>
                      <div className={cn("absolute top-0 right-0 w-32 h-32 rounded-bl-full -mr-8 -mt-8 opacity-10 group-hover:opacity-20 transition-opacity", step.bgColor)} />
                      
                      <CardHeader className="pb-4">
                        <div className="flex items-center gap-4">
                          <div className={cn("p-4 rounded-2xl shadow-lg shadow-black/5 transition-transform group-hover:scale-110 group-hover:rotate-3 duration-500", step.bgColor, step.color)}>
                            <step.icon className="h-6 w-6" />
                          </div>
                          <div>
                            <CardTitle className="text-2xl font-black tracking-tight">{step.title}</CardTitle>
                            <CardDescription className="text-sm font-bold uppercase tracking-wider mt-1 opacity-70 italic">{step.description}</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-slate-600 dark:text-slate-400 font-medium leading-[1.6]">
                          {step.details}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Icon Node in the Center Path */}
                  <div className="md:absolute md:left-1/2 md:-translate-x-1/2 z-10 hidden md:block order-1 md:order-none">
                    <div className={cn(
                      "h-14 w-14 rounded-full bg-white dark:bg-slate-900 border-[3px] flex items-center justify-center shadow-xl transition-all duration-700",
                      isVisible ? "border-current scale-100 rotate-0" : "border-slate-200 scale-0 rotate-180",
                      step.color
                    )}>
                      <step.icon className={cn(
                        "h-6 w-6",
                        step.title.includes('6') ? "animate-float" : "animate-pulse"
                      )} />
                    </div>
                  </div>

                  {/* Empty Spacer for the zig-zag effect */}
                  <div className={cn(
                    "hidden md:block w-1/2 px-12",
                    isEven ? "order-3" : "order-1"
                  )}>
                    {!isLast && (
                       <div className={cn(
                        "p-6 rounded-3xl border border-border bg-slate-50/50 dark:bg-white/5 opacity-40 group-hover:opacity-100 transition-opacity flex items-center justify-center animate-in fade-in zoom-in duration-1000 delay-500",
                        !isVisible && "hidden"
                       )}>
                         <ArrowRight className={cn(
                            "h-5 w-5 text-slate-300 transition-all duration-700",
                            isEven ? "rotate-180" : "rotate-0"
                         )} />
                       </div>
                    )}
                  </div>
                </div>
               );
            })}
          </div>
        </div>

        {/* Final Call to Action */}
        <div className={cn(
          "mt-32 text-center transition-all duration-1000",
          activeStep === steps.length - 1 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
        )}>
          <div className="relative inline-block group">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-emerald-600 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
            <div className="relative bg-card border border-border px-10 py-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Workflow className="h-6 w-6 animate-spin-slow" />
              </div>
              <h3 className="text-xl font-bold tracking-tight">System Ready for Acceleration</h3>
              <p className="text-sm font-medium text-slate-500 max-w-sm">
                You have mastered the foundational workflow. You are now ready to orchestrate your first strategic procurement.
              </p>
              <div className="h-px w-24 bg-border" />
              <button className="text-xs font-black uppercase tracking-[0.2em] text-primary hover:tracking-[0.3em] transition-all duration-300">
                Start Exploring Now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
