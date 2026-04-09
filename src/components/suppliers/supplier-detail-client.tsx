import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Globe, Link as LinkIcon, Mail, Phone, MapPin, Tag, Star, FileText, Loader2, Eye, Pencil } from 'lucide-react';
import { useMemo, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import type { SupplierContact, Supplier, Proposal, RFP } from '@/types';
import { ensureDate } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { doc, getDoc, Timestamp, collection, query, where, getDocs } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { NotesButton } from '@/components/notes/notes-button';


interface ClientSupplier extends Omit<Supplier, 'createdAt'> {
  createdAt: string; // ISO string
}

interface ProposalWithRFP extends Proposal {
  rfpTitle?: string;
}

export function SupplierDetailClient({ supplierId }: { supplierId: string }) {
  const [supplier, setSupplier] = useState<ClientSupplier | null>(null);
  const [proposals, setProposals] = useState<ProposalWithRFP[]>([]);
  const [loading, setLoading] = useState(true);
  const [proposalsLoading, setProposalsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchSupplier = async () => {
      try {
        const supplierDocRef = doc(db, 'suppliers', supplierId);
        const supplierDoc = await getDoc(supplierDocRef);

        if (!supplierDoc.exists()) {
          navigate('/dashboard', { replace: true });
          return;
        }
        
        const supplierData = { id: supplierDoc.id, ...supplierDoc.data() } as Supplier;

        const serializedSupplier = {
          ...supplierData,
          createdAt: (supplierData.createdAt as Timestamp).toDate().toISOString(),
          contacts: supplierData.contacts || [],
        } as ClientSupplier;

        setSupplier(serializedSupplier);

      } catch (e: any) {
        console.error(e);
        setError(e.message || "Failed to fetch supplier details.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchSupplier();
  }, [supplierId]);

  useEffect(() => {
    const fetchProposals = async () => {
      if (!supplierId) return;
      setProposalsLoading(true);
      try {
        const proposalsQuery = query(collection(db, 'proposals'), where('supplierId', '==', supplierId));
        const proposalsSnapshot = await getDocs(proposalsQuery);
        const proposalsData = proposalsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Proposal));

        // Fetch RFP titles for each proposal
        const rfpIds = [...new Set(proposalsData.map(p => p.rfpId))];
        const rfpData = new Map<string, RFP>();
        if (rfpIds.length > 0) {
            const rfpsQuery = query(collection(db, 'rfps'), where('__name__', 'in', rfpIds));
            const rfpsSnapshot = await getDocs(rfpsQuery);
            rfpsSnapshot.docs.forEach(doc => {
                rfpData.set(doc.id, { id: doc.id, ...doc.data() } as RFP);
            });
        }
        
        const proposalsWithRfp: ProposalWithRFP[] = proposalsData.map(p => ({
            ...p,
            rfpTitle: rfpData.get(p.rfpId)?.title || 'Unknown RFP'
        }));

        setProposals(proposalsWithRfp);
      } catch (e: any) {
        console.error('Error fetching proposals: ', e);
      } finally {
        setProposalsLoading(false);
      }
    };

    fetchProposals();
  }, [supplierId]);


  const registrationDate = useMemo(() => {
    if (!supplier) return null;
    return new Date(supplier.createdAt);
  }, [supplier]);

  if (loading) {
    return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (error) {
    return <div className="text-destructive text-center p-4">{error}</div>;
  }

  if (!supplier || !registrationDate) {
    return null;
  }

  return (
    <div className="container mx-auto py-2 space-y-6">
      <div className="flex justify-between items-start">
         <div className="flex items-center gap-4">
            {supplier.logoUrl && (
                <Avatar className="h-16 w-16">
                    <AvatarImage src={supplier.logoUrl} alt={`${supplier.companyName} logo`} />
                    <AvatarFallback>{supplier.companyName.charAt(0)}</AvatarFallback>
                </Avatar>
            )}
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                {supplier.companyName}
                </h1>
                <p className="text-sm text-muted-foreground">
                Registered on {format(registrationDate, 'MMMM d, yyyy')}
                </p>
            </div>
        </div>
        <div className="flex items-center gap-2">
          <NotesButton entityType="supplier" entityId={supplier.id} entityName={supplier.companyName} />
          <Button asChild>
              <Link to={`/dashboard/suppliers/${supplier.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Supplier
              </Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Supplier Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-start gap-4">
                <MapPin className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                <span>{supplier.address}</span>
              </div>
              {supplier.websiteUrl && (
                <div className="flex items-center gap-4">
                    <Globe className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <a href={supplier.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {supplier.websiteUrl}
                    </a>
                </div>
              )}
               <div className="flex items-start gap-4">
                <Tag className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                <div className="flex flex-wrap gap-2">
                    {supplier.categories.map(cat => <Badge key={cat} variant="secondary">{cat}</Badge>)}
                </div>
              </div>
            </CardContent>
          </Card>
           <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Contacts</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Phone</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {supplier.contacts.map((contact, index) => (
                            <TableRow key={index}>
                                <TableCell className="font-medium text-sm">{contact.name}</TableCell>
                                <TableCell className="text-sm">{contact.role}</TableCell>
                                <TableCell>
                                     <a href={`mailto:${contact.email}`} className="text-primary hover:underline text-sm">{contact.email}</a>
                                </TableCell>
                                <TableCell className="text-sm">{contact.phone}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
          </Card>
           <Card>
                <CardHeader>
                    <CardTitle className="text-lg font-semibold">Proposal History</CardTitle>
                    <CardDescription className="text-xs">A list of all proposals submitted by this supplier.</CardDescription>
                </CardHeader>
                <CardContent>
                    {proposalsLoading ? (
                        <div className="flex justify-center items-center h-24">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>RFP Title</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Submitted On</TableHead>
                                    <TableHead className="text-right">Price</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {proposals.length > 0 ? (
                                    proposals.map(proposal => (
                                        <TableRow key={proposal.id}>
                                            <TableCell className="font-medium text-sm">{proposal.rfpTitle}</TableCell>
                                            <TableCell><Badge variant="secondary">{proposal.status}</Badge></TableCell>
                                            <TableCell className="text-sm">{format(ensureDate(proposal.submittedAt), 'MMM d, yyyy')}</TableCell>
                                            <TableCell className="text-right text-sm">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(proposal.price)}</TableCell>
                                            <TableCell className="text-right">
                                                <Button asChild variant="ghost" size="icon">
                                                    <Link to={`/dashboard/proposals/${proposal.id}`}>
                                                        <Eye className="h-4 w-4" />
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center text-sm">
                                            This supplier has not submitted any proposals yet.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-2xl font-bold">
                <Star className="h-6 w-6 text-yellow-400 fill-yellow-400" />
                {supplier.rating.toFixed(1)} / 5.0
              </div>
              <p className="text-xs text-muted-foreground mt-1">Overall supplier rating</p>
            </CardContent>
          </Card>
           <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Documents</CardTitle>
            </CardHeader>
            <CardContent>
                {supplier.documents && supplier.documents.length > 0 ? (
                    <ul className="space-y-2">
                        {supplier.documents.map((doc, i) => (
                            <li key={i} className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground"/>
                                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm">{doc.name}</a>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-muted-foreground">No documents uploaded.</p>
                )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
