import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { db } from '@/lib/firebase';
import type { Proposal, Supplier } from '@/types';
import { collection, query, where } from '@/lib/firestore-compat';
import { Loader2 } from 'lucide-react';
import { useCollection } from '@/lib/firebase-hooks-compat';

export function ProposalCompareClient({ rfpId }: { rfpId: string }) {
  const [proposalsValue, proposalsLoading, proposalsError] = useCollection(
    query(collection(db, 'proposals'), where('rfpId', '==', rfpId))
  );

  const supplierIds =
    proposalsValue?.docs.map((doc) => doc.data().supplierId) || [];

  const [suppliersValue, suppliersLoading, suppliersError] = useCollection(
    supplierIds.length > 0
      ? query(collection(db, 'suppliers'), where('__name__', 'in', supplierIds))
      : null
  );

  if (proposalsLoading || suppliersLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (proposalsError || suppliersError) {
    return (
      <div className="text-red-500">
        <p>Error loading data.</p>
        {proposalsError && <p>{proposalsError.message}</p>}
        {suppliersError && <p>{suppliersError.message}</p>}
      </div>
    );
  }

  const proposals =
    proposalsValue?.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as Proposal)
    ) || [];
  const suppliers =
    suppliersValue?.docs.reduce(
      (acc, doc) => {
        acc[doc.id] = doc.data() as Supplier;
        return acc;
      },
      {} as { [key: string]: Supplier }
    ) || {};

  const bestScore = Math.max(...proposals.map(p => p.finalScore || 0), 0);

  return (
    <div className="container mx-auto py-2">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Proposal Comparison
        </h1>
        <p className="text-sm text-muted-foreground">
          Comparing proposals for RFP ID: {rfpId}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Comparison Table</CardTitle>
          <CardDescription className="text-xs">
            This table highlights the best overall score.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Quality Score</TableHead>
                <TableHead className="text-right">Commercial Score</TableHead>
                <TableHead className="text-right">Final Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proposals.length > 0 ? (
                proposals.map((proposal) => (
                  <TableRow key={proposal.id} className={(proposal.finalScore || 0) === bestScore && bestScore > 0 ? 'bg-green-100' : ''}>
                    <TableCell className="text-sm">
                      {suppliers[proposal.supplierId]?.companyName ||
                        'Unknown Supplier'}
                      {proposal.revision !== undefined ? ` - Rev ${proposal.revision}` : ''}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                      }).format(proposal.price)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {(proposal.qualityScore || 0).toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {(proposal.commercialScore || 0).toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">
                      {(proposal.finalScore || 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-sm">
                    No proposals submitted for this RFP yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
