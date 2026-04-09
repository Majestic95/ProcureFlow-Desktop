import { useState, useEffect, useMemo } from 'react';
import { Country, State } from 'country-state-city';
import type { ICountry, IState } from 'country-state-city';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { SearchableSelect } from '../ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, getDocs, writeBatch, doc, query, where } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import type { Coverage } from '@/types';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';

type CoverageStatus = 'Preferred' | 'Potential' | 'No coverage';
type RegionCoverage = Record<string, CoverageStatus>; // stateCode -> status

const COVERAGE_STATUSES: CoverageStatus[] = ['Preferred', 'Potential', 'No coverage'];

interface SupplierCoverageProps {
  supplierId: string;
}

export function SupplierCoverage({ supplierId }: SupplierCoverageProps) {
  const [countries, setCountries] = useState<ICountry[]>([]);
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>('');
  const [states, setStates] = useState<IState[]>([]);
  const [coverage, setCoverage] = useState<RegionCoverage>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setCountries(Country.getAllCountries());
    // Default to USA if available
    const usa = Country.getCountryByCode('US');
    if (usa) {
        setSelectedCountryCode(usa.isoCode);
    }
  }, []);

  const countryOptions = useMemo(() => countries.map(c => ({ label: c.name, value: c.isoCode })), [countries]);
  
  useEffect(() => {
    if (selectedCountryCode) {
      setStates(State.getStatesOfCountry(selectedCountryCode) || []);
    } else {
      setStates([]);
    }
  }, [selectedCountryCode]);

  useEffect(() => {
    if (!selectedCountryCode || !supplierId) {
      setCoverage({});
      return;
    };

    const fetchCoverage = async () => {
      setLoading(true);
      try {
        const coverageCollectionRef = collection(db, 'suppliers', supplierId, 'coverage');
        const q = query(coverageCollectionRef, where('countryCode', '==', selectedCountryCode));
        const querySnapshot = await getDocs(q);
        
        const fetchedCoverage: RegionCoverage = {};
        querySnapshot.forEach((doc) => {
          const data = doc.data() as Coverage;
          fetchedCoverage[data.stateCode] = data.coverageStatus;
        });

        setCoverage(fetchedCoverage);
      } catch (e: any) {
        console.error("Error fetching coverage: ", e);
        toast({
          variant: 'destructive',
          title: 'Error loading coverage',
          description: e.message || 'Could not fetch coverage data.',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchCoverage();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountryCode, supplierId]);

  const handleCoverageChange = (stateCode: string, status: CoverageStatus) => {
    setCoverage(prev => ({ ...prev, [stateCode]: status }));
  };

  const handleSaveCoverage = async () => {
    if (!selectedCountryCode || states.length === 0) return;
    setSaving(true);

    try {
      const batch = writeBatch(db);
      const country = Country.getCountryByCode(selectedCountryCode);

      states.forEach(state => {
        const stateCoverageStatus = coverage[state.isoCode] || 'No coverage';
        const docId = `${selectedCountryCode}_${state.isoCode}`;
        const docRef = doc(db, 'suppliers', supplierId, 'coverage', docId);

        const data: Omit<Coverage, 'id'> = {
          supplierId,
          countryCode: selectedCountryCode,
          countryName: country?.name || '',
          stateCode: state.isoCode,
          stateName: state.name,
          coverageStatus: stateCoverageStatus,
        };
        batch.set(docRef, data);
      });

      await batch.commit();
      toast({
        title: 'Success',
        description: `Coverage for ${country?.name} has been updated.`,
      });
    } catch (serverError: any) {
      const permissionError = new FirestorePermissionError({
          path: `suppliers/${supplierId}/coverage`,
          operation: 'update',
      });
      errorEmitter.emit('permission-error', permissionError);
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: 'Could not save coverage data. Check permissions.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Coverage</CardTitle>
        <CardDescription className="text-xs">Define the geographical coverage for this supplier.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <SearchableSelect
          label="Country"
          placeholder="Select a country"
          options={countryOptions}
          value={selectedCountryCode}
          onChange={setSelectedCountryCode}
        />
        {loading && <Loader2 className="mx-auto mt-4 h-8 w-8 animate-spin" />}
        {!loading && states.length > 0 && (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>State / Province</TableHead>
                  <TableHead className='w-[200px]'>Coverage Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {states.map(state => (
                  <TableRow key={state.isoCode}>
                    <TableCell className="font-medium text-sm">{state.name}</TableCell>
                    <TableCell>
                      <Select
                        value={coverage[state.isoCode] || 'No coverage'}
                        onValueChange={(value: CoverageStatus) => handleCoverageChange(state.isoCode, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Set status" />
                        </SelectTrigger>
                        <SelectContent>
                          {COVERAGE_STATUSES.map(status => (
                            <SelectItem key={status} value={status}>{status}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="flex justify-end">
            <Button onClick={handleSaveCoverage} disabled={saving || loading}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Coverage
            </Button>
        </div>
      </CardContent>
    </Card>
  );
}
