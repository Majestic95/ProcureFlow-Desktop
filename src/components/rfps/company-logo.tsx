import { useState } from 'react';
import { Building } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SupplierBrandingLogoProps {
  logoUrl?: string | null;
  name: string;
  className?: string;
  iconClassName?: string;
}

export function SupplierBrandingLogo({ logoUrl, name, className, iconClassName }: SupplierBrandingLogoProps) {
  const [hasError, setHasError] = useState(false);

  if (logoUrl && !hasError) {
    return (
      <div className={cn("flex h-8 w-8 shrink-0 overflow-hidden rounded-md border bg-muted", className)}>
        <img
          src={logoUrl}
          alt={name}
          className="aspect-square h-full w-full object-contain p-1"
          onError={() => {
            setHasError(true);
          }}
        />
      </div>
    );
  }

  return (
    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted", className)}>
      <Building className={cn("h-4 w-4 text-muted-foreground", iconClassName)} />
    </div>
  );
}
