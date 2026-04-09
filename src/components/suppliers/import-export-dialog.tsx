import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  setDoc,
  serverTimestamp,
  Firestore
} from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { 
  suppliersToWorkbook, 
  workbookToSuppliers, 
  generateSupplierTemplate 
} from '@/lib/supplier-excel-utils';
import type { Supplier } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Download, UploadCloud, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { logAudit } from '@/lib/audit';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from '@/lib/file-storage';

interface ImportExportDialogProps {
  currentData: Supplier[];
}

export function ImportExportDialog({ currentData }: ImportExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerDownload = async (sheets: Record<string, any[]>, filename: string) => {
    setDownloading(true);
    try {
      // Create or get hidden iframe for download
      const iframeId = 'hidden-download-iframe';
      let iframe = document.getElementById(iframeId) as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = iframeId;
        iframe.name = iframeId;
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
      }

      // Create a hidden form to trigger native browser download handler via iframe
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/api/export-suppliers';
      form.target = iframeId;
      
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'payload';
      input.value = JSON.stringify({ sheets, filename });
      
      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
      
      // Cleanup form after submission
      setTimeout(() => {
        if (form.parentNode) document.body.removeChild(form);
      }, 1000);
      
      // Clear downloading state after a short delay
      setTimeout(() => setDownloading(false), 2000);
      return true;
    } catch (error: any) {
      console.error('Download error:', error);
      setDownloading(false);
      throw error;
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setDownloading(true);
      // For template, we use GET through the same hidden iframe
      const iframeId = 'hidden-download-iframe';
      let iframe = document.getElementById(iframeId) as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = iframeId;
        iframe.name = iframeId;
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
      }
      
      iframe.src = '/api/export-suppliers';
      
      toast({ title: 'Template Downloaded', description: 'Fill in the data and upload it back.' });
      setTimeout(() => setDownloading(false), 2000);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Download Failed', description: error.message });
      setDownloading(false);
    }
  };

  const handleExport = async () => {
    try {
      const wb = suppliersToWorkbook(currentData);
      const sheets: Record<string, any[]> = {};
      wb.SheetNames.forEach(name => {
        sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name]);
      });

      const filename = `suppliers_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      await triggerDownload(sheets, filename);
      toast({ title: 'Export Successful', description: `${currentData.length} suppliers exported.` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Export Failed', description: error.message });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setProgress(0);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const importedSuppliers = workbookToSuppliers(workbook);

      if (importedSuppliers.length === 0) {
        throw new Error('No supplier data found in the file.');
      }

      let processed = 0;
      const total = importedSuppliers.length;

      for (const supplier of importedSuppliers) {
        if (!supplier.companyName) {
          processed++;
          continue;
        }

        let supplierId = supplier.id;

        // If no ID, try to find by Company Name
        if (!supplierId) {
          const q = query(collection(db, 'suppliers'), where('companyName', '==', supplier.companyName));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            supplierId = querySnapshot.docs[0].id;
          }
        }

        // Generate a new ID if still none
        if (!supplierId) {
          supplierId = doc(collection(db, 'suppliers')).id;
        }

        // Prepare document data
        const docData = {
          ...supplier,
          id: supplierId,
          updatedAt: serverTimestamp(),
        };

        // If it's a new document, add createdAt
        const existingDoc = await getDoc(doc(db, 'suppliers', supplierId));
        if (!existingDoc.exists()) {
          (docData as any).createdAt = serverTimestamp();
        }

        await setDoc(doc(db, 'suppliers', supplierId), docData, { merge: true });

        processed++;
        setProgress(Math.round((processed / total) * 100));
      }

      logAudit({ action: 'supplier.bulk_imported', category: 'supplier', targetCollection: 'suppliers', targetDocId: 'bulk', details: { count: processed } });
      toast({
        title: 'Import Successful',
        description: `Successfully processed ${processed} suppliers.`
      });
      setOpen(false);
    } catch (error: any) {
      toast({ 
        variant: 'destructive', 
        title: 'Import Failed', 
        description: error.message 
      });
    } finally {
      setImporting(false);
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Import/Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Supplier Data Management</DialogTitle>
          <DialogDescription>
            Export your current suppliers or import new ones using our multi-sheet Excel format.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">How it works</h4>
            <div className="text-xs text-muted-foreground space-y-2 bg-muted p-3 rounded-md">
              <p>1. The Excel file contains 4 sheets: <strong>Suppliers</strong>, <strong>Contacts</strong>, <strong>Revenue</strong>, and <strong>Personnel</strong>.</p>
              <p>2. We use the <strong>Company Name</strong> to link information across different sheets.</p>
              <p>3. If a company already exists (matching name or ID), its information will be updated. Otherwise, a new record will be created.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Button 
              variant="outline" 
              className="flex flex-col h-24 gap-2" 
              onClick={handleDownloadTemplate}
              disabled={downloading || importing}
            >
              {downloading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Download className="h-6 w-6 text-primary" />}
              <div className="text-xs">Download Template</div>
            </Button>
            <Button 
              variant="outline" 
              className="flex flex-col h-24 gap-2" 
              onClick={handleExport}
              disabled={downloading || importing}
            >
              {downloading ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileSpreadsheet className="h-6 w-6 text-green-600" />}
              <div className="text-xs">Export Current Data</div>
            </Button>
          </div>

          <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-3 bg-muted/30">
            {importing ? (
              <div className="w-full space-y-4">
                <div className="flex items-center justify-center gap-2 text-sm font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing Suppliers... {progress}%
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            ) : (
              <>
                <UploadCloud className="h-10 w-10 text-muted-foreground" />
                <div className="text-sm text-center">
                  <p className="font-medium">Upload Excel File</p>
                  <p className="text-xs text-muted-foreground mt-1">Select an .xlsx file with the proper structure</p>
                </div>
                <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                  Select File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </>
            )}
          </div>
        </div>

        <DialogFooter className="sm:justify-start">
          <Button variant="ghost" className="text-xs" onClick={() => setOpen(false)} disabled={importing}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
