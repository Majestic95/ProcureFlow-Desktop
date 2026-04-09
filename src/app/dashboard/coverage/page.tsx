import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import USASupplierMap from "@/components/maps/USASupplierMap";
import { useState, useEffect, useMemo } from "react";
import type { Coverage, Supplier } from "@/types";
import { collectionGroup, query, where, getDocs, collection } from "@/lib/firestore-compat";
import { db } from "@/lib/firebase";
import { Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { State } from "country-state-city";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type SelectedState = {
  stateCode: string;
  stateName: string;
};

type StateCoverageSupplier = {
  supplierId: string;
  supplierName: string;
  coverageStatus: "Preferred" | "Potential";
};

const US_STATES = State.getStatesOfCountry('US').map(s => ({ code: s.isoCode, name: s.name }));

// Firestore collection group query requires a composite index.
// You'll need to create an index on the 'coverage' collection group:
// Fields: countryCode (Ascending), stateCode (Ascending), coverageStatus (Ascending)
const getStateSuppliers = async (countryCode: string, stateCode: string): Promise<StateCoverageSupplier[]> => {
    const coverageQuery = query(
        collectionGroup(db, 'coverage'),
        where('countryCode', '==', countryCode),
        where('stateCode', '==', stateCode),
        where('coverageStatus', 'in', ['Preferred', 'Potential'])
    );

    const querySnapshot = await getDocs(coverageQuery);
    if (querySnapshot.empty) {
        return [];
    }

    const coverages = querySnapshot.docs.map(doc => doc.data() as Coverage);
    const supplierIds = [...new Set(coverages.map(c => c.supplierId))];

    if (supplierIds.length === 0) {
        return [];
    }

    const suppliersQuery = query(collection(db, 'suppliers'), where('__name__', 'in', supplierIds));
    const suppliersSnapshot = await getDocs(suppliersQuery);
    const suppliersMap = new Map<string, Supplier>();
    suppliersSnapshot.docs.forEach(doc => {
        suppliersMap.set(doc.id, { id: doc.id, ...doc.data() } as Supplier);
    });

    return coverages.map(coverage => ({
        supplierId: coverage.supplierId,
        supplierName: suppliersMap.get(coverage.supplierId)?.companyName || 'Unknown Supplier',
        coverageStatus: coverage.coverageStatus as 'Preferred' | 'Potential',
    }));
};


export default function SupplierCoveragePage() {
  const [selectedState, setSelectedState] = useState<SelectedState | null>(null);
  const [stateSuppliers, setStateSuppliers] = useState<StateCoverageSupplier[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStateClick = (stateCode: string, stateName: string) => {
    setSelectedState({ stateCode, stateName });
  };

  useEffect(() => {
    if (!selectedState) {
        setStateSuppliers([]);
        return;
    };

    const fetchData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const suppliers = await getStateSuppliers('US', selectedState.stateCode);
            setStateSuppliers(suppliers);
        } catch (e: any) {
            console.error("Failed to fetch state suppliers:", e);
            setError("Could not load supplier data for this state. This may be due to missing Firestore indexes.");
        } finally {
            setIsLoading(false);
        }
    };

    fetchData();
  }, [selectedState]);

  const handleStateSelectChange = (stateCode: string) => {
    if (stateCode && stateCode !== 'ALL') {
      const state = US_STATES.find(s => s.code === stateCode);
      if (state) {
        handleStateClick(state.code, state.name);
      }
    } else {
      setSelectedState(null);
    }
  };


  return (
    <div className="container mx-auto py-2">
       <div className="mb-4 flex items-start justify-between">
        <div>
            <h1 className="text-2xl font-semibold tracking-tight">Supplier Coverage</h1>
            <p className="text-sm text-muted-foreground">
              Visualize where suppliers are willing to work across the United States. Click a state or use the dropdown to see a list of suppliers.
            </p>
        </div>
        <div className="flex items-center gap-2">
            <Select onValueChange={handleStateSelectChange} value={selectedState?.stateCode || ''}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select a state" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='ALL'>- All States -</SelectItem>
                {US_STATES.map((state) => (
                  <SelectItem key={state.code} value={state.code}>
                    {state.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg font-semibold">USA Supplier Map</CardTitle>
                    <CardDescription className="text-xs">Visualize supplier activity across the United States. Click on a state to see more details.</CardDescription>
                </CardHeader>
                <CardContent>
                    <USASupplierMap
                        onStateClick={(stateCode) => {
                            const state = US_STATES.find(s => s.code === stateCode);
                            if (state) {
                                handleStateClick(state.code, state.name);
                            }
                        }}
                        selectedStateCode={selectedState?.stateCode}
                    />
                </CardContent>
            </Card>
        </div>
        <div>
            {selectedState ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold">Suppliers in {selectedState.stateName}</CardTitle>
                        <CardDescription className="text-xs">
                            Suppliers with Preferred or Potential coverage.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="flex justify-center items-center h-40">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : error ? (
                             <div className="text-center text-destructive py-4">
                                <p>{error}</p>
                            </div>
                        ) : stateSuppliers.length > 0 ? (
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Supplier</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {stateSuppliers.map(supplier => (
                                        <TableRow key={supplier.supplierId}>
                                            <TableCell className="font-medium text-sm">
                                                {supplier.supplierName}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={supplier.coverageStatus === 'Preferred' ? 'default' : 'secondary'}>
                                                    {supplier.coverageStatus}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                               <Button asChild variant="outline" size="sm">
                                                  <Link to={`/dashboard/suppliers/${supplier.supplierId}`}>
                                                    View
                                                  </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <div className="text-center text-muted-foreground py-4 text-sm">
                                <p>No suppliers with coverage found for this state.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <Card className="flex flex-col items-center justify-center h-full text-center">
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold">Select a State</CardTitle>
                        <CardDescription className="text-xs">
                            Click a state on the map or use the dropdown to view a list of suppliers with coverage in that area.
                        </CardDescription>
                    </CardHeader>
                </Card>
            )}
        </div>
      </div>
    </div>
  );
}
