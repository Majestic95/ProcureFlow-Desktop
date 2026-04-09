import { ProposalsList } from '@/components/proposals/proposals-list';
import { db } from '@/lib/firebase';
import type { Proposal, RFP, Supplier } from '@/types';
import { collection, getDocs } from '@/lib/firestore-compat';
import { Loader2 } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// New type that includes supplier and RFP info
export interface EnrichedProposal extends Proposal {
  rfpTitle: string;
  supplierName: string;
}

export default function AllProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [rfps, setRfps] = useState<RFP[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for filtering
  const [filterColumn, setFilterColumn] = useState<string>('rfpTitle');
  const [filterValue, setFilterValue] = useState('');
  const [filteredProposals, setFilteredProposals] = useState<EnrichedProposal[]>([]);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const [proposalsSnapshot, rfpsSnapshot, suppliersSnapshot] =
          await Promise.all([
            getDocs(collection(db, 'proposals')),
            getDocs(collection(db, 'rfps')),
            getDocs(collection(db, 'suppliers')),
          ]);

        if (cancelled) return;

        const proposalsData = proposalsSnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            submittedAt: (data.submittedAt as any).toDate(),
          } as Proposal;
        });
        const rfpsData = rfpsSnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as RFP)
        );
        const suppliersData = suppliersSnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Supplier)
        );

        if (!cancelled) {
          setProposals(proposalsData);
          setRfps(rfpsData);
          setSuppliers(suppliersData);
        }
      } catch (e: any) {
        if (cancelled) return;
        console.error(e);
        setError(e.message || 'Failed to fetch data.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, []);

  const enrichedProposals = useMemo(() => {
    const rfpMap = new Map(rfps.map((rfp) => [rfp.id, rfp.title]));
    const supplierMap = new Map(
      suppliers.map((supplier) => [supplier.id, supplier.companyName])
    );
    return proposals.map((p) => ({
      ...p,
      rfpTitle: rfpMap.get(p.rfpId) || 'Unknown RFP',
      supplierName: supplierMap.get(p.supplierId) || 'Unknown Supplier',
    }));
  }, [proposals, rfps, suppliers]);

  useEffect(() => {
    setFilteredProposals(enrichedProposals);
  }, [enrichedProposals]);


  const handleFilter = () => {
    if (!filterValue) {
      setFilteredProposals(enrichedProposals);
      return;
    }
    
    const lowercasedFilter = filterValue.toLowerCase();

    const filtered = enrichedProposals.filter(proposal => {
        const targetValue = proposal[filterColumn as keyof EnrichedProposal];
        if (typeof targetValue === 'string') {
            return targetValue.toLowerCase().includes(lowercasedFilter);
        }
        return false;
    });

    setFilteredProposals(filtered);
  };

  const handleClearFilter = () => {
    setFilterValue('');
    setFilteredProposals(enrichedProposals);
  };


  const handleProposalDeleted = (proposalId: string) => {
    setProposals((prevProposals) =>
      prevProposals.filter((p) => p.id !== proposalId)
    );
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500">
        <p>Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-2">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">All Proposals</h1>
          <p className="text-sm text-muted-foreground">
            View and manage all proposals submitted across all RFPs.
          </p>
        </div>
         <div className="flex items-center gap-2">
            <Select value={filterColumn} onValueChange={setFilterColumn}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rfpTitle">RFP Title</SelectItem>
                <SelectItem value="supplierName">Supplier</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Filter value..."
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              className="w-[200px]"
              onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
            />
            <Button onClick={handleFilter} size="sm">Apply</Button>
            <Button onClick={handleClearFilter} size="sm" variant="outline">Clear</Button>
          </div>
      </div>
      <ProposalsList
        proposals={filteredProposals}
        onProposalDeleted={handleProposalDeleted}
      />
    </div>
  );
}
