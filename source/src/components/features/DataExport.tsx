// ==============================================
// ZHIROX - Data Export Utility
// تایبەتمەندی: هەناردنی داتا بۆ CSV
// ==============================================

import { Download } from 'lucide-react';
import { Button } from '../ui/Button';
import { toast } from '../ui/Toast';

function convertToCSV(headers: string[], rows: string[][]): string {
  const BOM = '\uFEFF';
  const headerLine = headers.join(',');
  const dataLines = rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','));
  return BOM + [headerLine, ...dataLines].join('\n');
}

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

interface ExportButtonProps {
  headers: string[];
  rows: string[][];
  filename: string;
  label?: string;
}

export function ExportCSVButton({ headers, rows, filename, label = 'هەناردن CSV' }: ExportButtonProps) {
  const handleExport = () => {
    if (rows.length === 0) {
      toast.warning('داتا نییە بۆ هەناردن');
      return;
    }
    const csv = convertToCSV(headers, rows);
    downloadCSV(filename, csv);
    toast.success(`${rows.length} ڕیز هەناردنکرا`);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} leftIcon={<Download className="w-4 h-4" />}>
      {label}
    </Button>
  );
}

// Pre-built export functions
export function exportSalesData(sales: any[]) {
  const headers = ['وەسڵ', 'بەروار', 'کڕیار', 'کۆ', 'پارەدراو', 'قەرز', 'جۆر', 'دۆخ'];
  const rows = sales.map(s => [
    s.receipt_number,
    new Date(s.created_at).toLocaleDateString('en'),
    s.customer?.name || '-',
    s.total_amount.toString(),
    s.paid_amount.toString(),
    s.debt_amount.toString(),
    s.payment_type,
    s.status,
  ]);
  const csv = convertToCSV(headers, rows);
  downloadCSV(`zhirox-sales-${new Date().toISOString().slice(0, 10)}`, csv);
}

export function exportProductsData(products: any[]) {
  const headers = ['بارکۆد', 'ناو', 'پۆل', 'نرخی کڕین', 'نرخی فرۆشتن', 'کۆگا', 'دۆخ'];
  const rows = products.map(p => [
    p.barcode,
    p.name,
    p.category?.name || '-',
    p.cost_price.toString(),
    p.sale_price.toString(),
    p.stock_quantity.toString(),
    p.status,
  ]);
  const csv = convertToCSV(headers, rows);
  downloadCSV(`zhirox-products-${new Date().toISOString().slice(0, 10)}`, csv);
}

export function exportCustomersData(customers: any[], getBalance: (id: string) => any) {
  const headers = ['کۆد', 'ناو', 'ژمارە', 'ناونیشان', 'قەرز', 'دۆخ'];
  const rows = customers.map(c => {
    const bal = getBalance(c.id);
    return [
      c.code,
      c.name,
      c.phone || '-',
      c.address || '-',
      (bal?.balance_iqd || 0).toString(),
      c.status,
    ];
  });
  const csv = convertToCSV(headers, rows);
  downloadCSV(`zhirox-customers-${new Date().toISOString().slice(0, 10)}`, csv);
}
