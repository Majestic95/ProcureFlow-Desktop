import * as XLSX from 'xlsx';
import type { Supplier, SupplierContact, EstimatedRevenueItem, EstimatedPersonnelItem } from '@/types';

/**
 * Converts an array of Suppliers to an Excel Workbook with 4 sheets.
 */
export function suppliersToWorkbook(suppliers: Supplier[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // 1. Suppliers Sheet
  const supplierRows = suppliers.map(s => ({
    'Company ID': s.id,
    'Company Name': s.companyName,
    'Primary Contact': s.contacts?.[0]?.name || '',
    'Address': s.address,
    'Website': s.websiteUrl || '',
    'Logo URL': s.logoUrl || '',
    'Rating': s.rating || 0,
    'Categories': (s.categories || []).join(', '),
  }));
  const supplierSheet = XLSX.utils.json_to_sheet(supplierRows);
  XLSX.utils.book_append_sheet(wb, supplierSheet, 'Suppliers');

  // 2. Contacts Sheet
  const contactRows: any[] = [];
  suppliers.forEach(s => {
    (s.contacts || []).forEach(c => {
      contactRows.push({
        'Company Name': s.companyName,
        'Contact Name': c.name,
        'Role': c.role,
        'Email': c.email,
        'Phone': c.phone,
      });
    });
  });
  const contactsSheet = XLSX.utils.json_to_sheet(contactRows);
  XLSX.utils.book_append_sheet(wb, contactsSheet, 'Contacts');

  // 3. Revenue Sheet
  const revenueRows: any[] = [];
  suppliers.forEach(s => {
    (s.estimatedRevenue || []).forEach(r => {
      revenueRows.push({
        'Company Name': s.companyName,
        'Year': r.year,
        'Amount (USD)': r.amountUsd,
      });
    });
  });
  const revenueSheet = XLSX.utils.json_to_sheet(revenueRows);
  XLSX.utils.book_append_sheet(wb, revenueSheet, 'Revenue');

  // 4. Personnel Sheet
  const personnelRows: any[] = [];
  suppliers.forEach(s => {
    (s.estimatedPersonnel || []).forEach(p => {
      personnelRows.push({
        'Company Name': s.companyName,
        'Year': p.year,
        'Headcount': p.headcount,
      });
    });
  });
  const personnelSheet = XLSX.utils.json_to_sheet(personnelRows);
  XLSX.utils.book_append_sheet(wb, personnelSheet, 'Personnel');

  return wb;
}

/**
 * Generates an empty template workbook with headers.
 */
export function generateSupplierTemplate(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const supplierHeaders = [['Company ID', 'Company Name', 'Primary Contact', 'Address', 'Website', 'Logo URL', 'Rating', 'Categories']];
  const contactHeaders = [['Company Name', 'Contact Name', 'Role', 'Email', 'Phone']];
  const revenueHeaders = [['Company Name', 'Year', 'Amount (USD)']];
  const personnelHeaders = [['Company Name', 'Year', 'Headcount']];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(supplierHeaders), 'Suppliers');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(contactHeaders), 'Contacts');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(revenueHeaders), 'Revenue');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(personnelHeaders), 'Personnel');

  return wb;
}

/**
 * Parses a workbook into an array of partial Supplier objects.
 */
export function workbookToSuppliers(wb: XLSX.WorkBook): Partial<Supplier>[] {
  const supplierSheet = wb.Sheets['Suppliers'];
  if (!supplierSheet) throw new Error("Missing 'Suppliers' sheet.");

  const suppliersRaw: any[] = XLSX.utils.sheet_to_json(supplierSheet);
  
  const contactsSheet = wb.Sheets['Contacts'];
  const contactsRaw: any[] = contactsSheet ? XLSX.utils.sheet_to_json(contactsSheet) : [];

  const revenueSheet = wb.Sheets['Revenue'];
  const revenueRaw: any[] = revenueSheet ? XLSX.utils.sheet_to_json(revenueSheet) : [];

  const personnelSheet = wb.Sheets['Personnel'];
  const personnelRaw: any[] = personnelSheet ? XLSX.utils.sheet_to_json(personnelSheet) : [];

  // Group secondary data by Company Name
  const contactsByCompany: Record<string, SupplierContact[]> = {};
  contactsRaw.forEach(c => {
    const name = c['Company Name'];
    if (!name) return;
    if (!contactsByCompany[name]) contactsByCompany[name] = [];
    contactsByCompany[name].push({
      name: String(c['Contact Name'] || c['Primary Contact'] || ''),
      role: String(c['Role'] || ''),
      email: String(c['Email'] || ''),
      phone: String(c['Phone'] || ''),
    });
  });

  const revenueByCompany: Record<string, EstimatedRevenueItem[]> = {};
  revenueRaw.forEach(r => {
    const name = r['Company Name'];
    if (!name) return;
    if (!revenueByCompany[name]) revenueByCompany[name] = [];
    revenueByCompany[name].push({
      year: Number(r['Year'] || 0),
      amountUsd: Number(r['Amount (USD)'] || 0),
    });
  });

  const personnelByCompany: Record<string, EstimatedPersonnelItem[]> = {};
  personnelRaw.forEach(p => {
    const name = p['Company Name'];
    if (!name) return;
    if (!personnelByCompany[name]) personnelByCompany[name] = [];
    personnelByCompany[name].push({
      year: Number(p['Year'] || 0),
      headcount: Number(p['Headcount'] || 0),
    });
  });

  // Map to Supplier objects
  return suppliersRaw.map(s => {
    const companyName = String(s['Company Name'] || '');
    const contacts = contactsByCompany[companyName] || [];
    
    // If Primary Contact was specified in the main sheet and not in the contacts sheet, add it
    const primaryContactName = s['Primary Contact'];
    if (primaryContactName && !contacts.some(c => c.name === primaryContactName)) {
      contacts.unshift({
        name: String(primaryContactName),
        role: 'Primary Contact',
        email: '',
        phone: '',
      });
    }

    return {
      id: s['Company ID'] ? String(s['Company ID']) : undefined,
      companyName,
      address: String(s['Address'] || ''),
      websiteUrl: s['Website'] ? String(s['Website']) : null,
      logoUrl: s['Logo URL'] ? String(s['Logo URL']) : null,
      rating: Number(s['Rating'] || 0),
      categories: String(s['Categories'] || '').split(',').map(c => c.trim()).filter(Boolean),
      contacts: contacts,
      estimatedRevenue: revenueByCompany[companyName] || [],
      estimatedPersonnel: personnelByCompany[companyName] || [],
    } as Partial<Supplier>;
  });
}
