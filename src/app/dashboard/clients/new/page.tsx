import { ClientForm } from "@/components/clients/client-form";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NewClientPage() {
  return (
    <div className="container mx-auto py-10 max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
         <div className="flex items-center gap-4">
             <Button variant="ghost" size="icon" asChild>
                <Link to="/dashboard/clients">
                    <ArrowLeft className="h-4 w-4" />
                </Link>
             </Button>
             <div>
                <h1 className="text-2xl font-semibold tracking-tight">Add New Client</h1>
                <p className="text-sm text-muted-foreground">
                    Register a new client profile.
                </p>
            </div>
         </div>
      </div>
      <ClientForm />
    </div>
  );
}
