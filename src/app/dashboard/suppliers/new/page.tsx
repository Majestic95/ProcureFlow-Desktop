
import { SupplierForm } from '@/components/suppliers/supplier-form';

export default function NewSupplierPage() {
  return (
    <div className="container mx-auto py-2">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Register New Supplier</h1>
        <p className="text-sm text-muted-foreground">
          Fill in the details below to add a new supplier to the system.
        </p>
      </div>
      <SupplierForm />
    </div>
  );
}
