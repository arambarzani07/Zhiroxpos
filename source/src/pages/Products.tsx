import { useState } from 'react';
import {
  Plus,
  Search,
  Package,
  Edit,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { translations } from '../constants/translations';
import { PERMISSIONS } from '../constants/permissions';
import { PageHeader, PageContent } from '../components/layout/Layout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { StatusBadge } from '../components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyTable, DataList, DataListItem } from '../components/ui/Table';
import { toast } from '../components/ui/Toast';
import { exportProductsData } from '../components/features/DataExport';
import { BarcodeGeneratorButton } from '../components/features/BarcodeGenerator';
import { ProductDetailModal } from '../components/features/ProductDetail';
import { cn } from '../utils/cn';
import type { Product } from '../types';

function formatCurrency(amount: number, currency: 'IQD' | 'USD' = 'IQD'): string {
  if (currency === 'USD') {
    return `$${amount.toLocaleString()}`;
  }
  return `${amount.toLocaleString()} د.ع`;
}

export function ProductsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showLowStock, setShowLowStock] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);

  const { hasPermission, user } = useAuthStore();
  const { getProducts, getCategories, addProduct, updateProduct, getProductByBarcode, addAuditLog } = useDataStore();

  const products = getProducts();
  const categories = getCategories();

  const filteredProducts = products.filter(p => {
    const matchesSearch = searchQuery === '' ||
      p.name.includes(searchQuery) ||
      p.barcode.includes(searchQuery);
    const matchesCategory = selectedCategory === 'all' || p.category_id === selectedCategory;
    const matchesLowStock = !showLowStock || (p.stock_quantity <= p.low_stock_limit);
    return matchesSearch && matchesCategory && matchesLowStock;
  });

  const handleSaveProduct = (productData: Partial<Product>) => {
    if (editingProduct) {
      updateProduct(editingProduct.id, productData);
      
      if (user) {
        addAuditLog({
          market_id: 'market-1',
          branch_id: 'branch-1',
          user_id: user.id,
          action: 'products.update',
          module: 'products',
          table_name: 'products',
          record_id: editingProduct.id,
          old_value: editingProduct as unknown as Record<string, unknown>,
          new_value: { ...editingProduct, ...productData } as unknown as Record<string, unknown>,
        });
      }
      
      toast.success(translations.success.product_updated);
      setEditingProduct(null);
    } else {
      // Check for duplicate barcode (primary + extras)
      const barcodesToCheck = [productData.barcode, ...(productData.barcodes || [])].filter(Boolean) as string[];
      for (const bc of barcodesToCheck) {
        if (getProductByBarcode(bc)) {
          toast.error(`${translations.errors.BARCODE_DUPLICATE}: ${bc}`);
          return;
        }
      }

      const primaryBarcode = productData.barcode || '';
      const allBarcodes = productData.barcodes && productData.barcodes.length > 0
        ? productData.barcodes : [primaryBarcode].filter(Boolean);

      const newProduct = addProduct({
        market_id: 'market-1',
        branch_id: 'branch-1',
        category_id: productData.category_id,
        barcode: primaryBarcode,
        barcodes: allBarcodes,
        name: productData.name || '',
        name_en: productData.name_en,
        description: productData.description,
        unit: productData.unit || 'دانە',
        cost_price: productData.cost_price || 0,
        sale_price: productData.sale_price || 0,
        currency: 'IQD',
        stock_quantity: productData.stock_quantity || 0,
        low_stock_limit: productData.low_stock_limit || 10,
        is_trackable: true,
        status: 'active',
        created_by: user?.id || '',
      });

      if (user) {
        addAuditLog({
          market_id: 'market-1',
          branch_id: 'branch-1',
          user_id: user.id,
          action: 'products.create',
          module: 'products',
          table_name: 'products',
          record_id: newProduct.id,
          new_value: newProduct as unknown as Record<string, unknown>,
        });
      }

      toast.success(translations.success.product_created);
      setShowAddModal(false);
    }
  };

  const categoryOptions = [
    { value: 'all', label: translations.products.all_categories },
    ...categories.map(c => ({ value: c.id, label: c.name })),
  ];

  return (
    <div>
      <PageHeader
        title={translations.products.title}
        subtitle={`${products.length} کاڵا`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportProductsData(filteredProducts)}>
              📥 CSV
            </Button>
            {hasPermission(PERMISSIONS.PRODUCTS_CREATE) && (
              <Button onClick={() => setShowAddModal(true)} leftIcon={<Plus className="w-4 h-4" />} size="sm">
                {translations.products.add_product}
              </Button>
            )}
          </div>
        }
      />

      <PageContent>
        {/* Filters */}
        <Card>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder={translations.products.search}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-5 h-5" />}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1 sm:w-40">
                <Select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  options={categoryOptions}
                />
              </div>
              <Button
                variant={showLowStock ? 'primary' : 'outline'}
                onClick={() => setShowLowStock(!showLowStock)}
                className="flex-shrink-0"
              >
                <AlertTriangle className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Products - Mobile Cards */}
        <div className="lg:hidden">
          {filteredProducts.length === 0 ? (
            <Card>
              <EmptyTable
                message={translations.common.no_data}
                icon={<Package className="w-12 h-12" />}
              />
            </Card>
          ) : (
            <DataList>
              {filteredProducts.map(product => {
                const category = categories.find(c => c.id === product.category_id);
                const isLowStock = product.stock_quantity <= product.low_stock_limit;

                return (
                  <DataListItem key={product.id}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{product.name}</p>
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs text-slate-500 font-mono">{product.barcode}</p>
                          {product.barcodes && product.barcodes.length > 1 && (
                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-600 text-[10px] font-bold rounded-full">+{product.barcodes.length - 1}</span>
                          )}
                        </div>
                      </div>
                      <StatusBadge status={product.status} />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="space-y-1">
                        <p className="text-slate-500">{category?.name || '-'}</p>
                        <p className="font-semibold text-indigo-600">{formatCurrency(product.sale_price)}</p>
                      </div>
                      <div className="text-left space-y-1">
                        <p className={cn('font-medium', isLowStock ? 'text-red-600' : 'text-slate-600')}>
                          {product.stock_quantity} {product.unit}
                          {isLowStock && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                        </p>
                        <Button variant="ghost" size="sm" onClick={() => setViewingProduct(product)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {hasPermission(PERMISSIONS.PRODUCTS_EDIT) && (
                          <Button variant="ghost" size="sm" onClick={() => setEditingProduct(product)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </DataListItem>
                );
              })}
            </DataList>
          )}
        </div>

        {/* Products Table - Desktop */}
        <Card padding="none" className="hidden lg:block">
          {filteredProducts.length === 0 ? (
            <EmptyTable
              message={translations.common.no_data}
              icon={<Package className="w-16 h-16" />}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{translations.products.barcode}</TableHead>
                  <TableHead>{translations.products.name}</TableHead>
                  <TableHead>{translations.products.category}</TableHead>
                  <TableHead>{translations.products.cost_price}</TableHead>
                  <TableHead>{translations.products.sale_price}</TableHead>
                  <TableHead>{translations.products.stock_quantity}</TableHead>
                  <TableHead>{translations.products.status}</TableHead>
                  <TableHead>{translations.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map(product => {
                  const category = categories.find(c => c.id === product.category_id);
                  const isLowStock = product.stock_quantity <= product.low_stock_limit;

                  return (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm">{product.barcode}</span>
                          {product.barcodes && product.barcodes.length > 1 && (
                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-600 text-[10px] font-bold rounded-full" title={product.barcodes.join(' / ')}>+{product.barcodes.length - 1}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900">{product.name}</p>
                          {product.name_en && (
                            <p className="text-xs text-slate-500">{product.name_en}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{category?.name || '-'}</TableCell>
                      <TableCell>{formatCurrency(product.cost_price)}</TableCell>
                      <TableCell className="font-semibold text-indigo-600">
                        {formatCurrency(product.sale_price)}
                      </TableCell>
                      <TableCell>
                        <span className={cn('font-medium', isLowStock ? 'text-red-600' : 'text-slate-900')}>
                          {product.stock_quantity} {product.unit}
                        </span>
                        {isLowStock && <AlertTriangle className="w-4 h-4 text-amber-500 inline mr-1" />}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={product.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setViewingProduct(product)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {hasPermission(PERMISSIONS.PRODUCTS_EDIT) && (
                            <Button variant="ghost" size="sm" onClick={() => setEditingProduct(product)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </PageContent>

      {/* Add/Edit Product Modal */}
      <ProductFormModal
        isOpen={showAddModal || !!editingProduct}
        onClose={() => {
          setShowAddModal(false);
          setEditingProduct(null);
        }}
        product={editingProduct}
        categories={categories}
        onSave={handleSaveProduct}
        canChangePrice={hasPermission(PERMISSIONS.PRODUCTS_CHANGE_PRICE)}
      />

      <ProductDetailModal
        isOpen={!!viewingProduct}
        onClose={() => setViewingProduct(null)}
        product={viewingProduct}
      />
    </div>
  );
}

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  categories: { id: string; name: string }[];
  onSave: (data: Partial<Product>) => void;
  canChangePrice: boolean;
}

function ProductFormModal({ isOpen, onClose, product, categories, onSave, canChangePrice }: ProductFormModalProps) {
  const [formData, setFormData] = useState<Partial<Product>>({
    barcode: '', barcodes: [], name: '', name_en: '', category_id: '', unit: 'دانە',
    cost_price: 0, sale_price: 0, stock_quantity: 0, low_stock_limit: 10, description: '', status: 'active',
  });
  const [extraBarcode, setExtraBarcode] = useState('');

  useState(() => {
    if (product) {
      setFormData({ ...product, barcodes: product.barcodes || [product.barcode] });
    } else {
      setFormData({
        barcode: '', barcodes: [], name: '', name_en: '', category_id: '', unit: 'دانە',
        cost_price: 0, sale_price: 0, stock_quantity: 0, low_stock_limit: 10, description: '', status: 'active',
      });
    }
  });

  const handleAddBarcode = () => {
    const bc = extraBarcode.trim();
    if (!bc) return;
    const current = formData.barcodes || [];
    if (current.includes(bc) || bc === formData.barcode) return;
    setFormData({ ...formData, barcodes: [...current, bc] });
    setExtraBarcode('');
  };

  const handleRemoveBarcode = (bc: string) => {
    const current = formData.barcodes || [];
    // If removing primary, set next one as primary
    if (bc === formData.barcode && current.length > 1) {
      const next = current.find(b => b !== bc) || '';
      setFormData({ ...formData, barcode: next, barcodes: current.filter(b => b !== bc) });
    } else {
      setFormData({ ...formData, barcodes: current.filter(b => b !== bc) });
    }
  };

  const handleSetPrimary = (bc: string) => {
    setFormData({ ...formData, barcode: bc });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const categoryOptions = [
    { value: '', label: 'هەڵبژاردنی پۆل' },
    ...categories.map(c => ({ value: c.id, label: c.name })),
  ];

  const unitOptions = [
    { value: 'دانە', label: translations.products.piece },
    { value: 'کیلۆ', label: translations.products.kg },
    { value: 'کارتۆن', label: translations.products.box },
    { value: 'پاکێت', label: translations.products.pack },
  ];

  const statusOptions = [
    { value: 'active', label: translations.products.active },
    { value: 'inactive', label: translations.products.inactive },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={product ? translations.products.edit_product : translations.products.add_product}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Barcodes Section */}
        <div className="p-4 bg-slate-50 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">بارکۆدەکان</label>
            <span className="text-xs text-slate-400">{(formData.barcodes || []).length} بارکۆد</span>
          </div>

          {/* Primary barcode */}
          <div className="flex gap-2">
            <Input
              value={formData.barcode}
              onChange={(e) => {
                const val = e.target.value;
                setFormData({
                  ...formData,
                  barcode: val,
                  barcodes: [val, ...(formData.barcodes || []).filter(b => b !== formData.barcode)],
                });
              }}
              placeholder="بارکۆدی سەرەکی"
              required
              disabled={!!product}
            />
            {!product && (
              <BarcodeGeneratorButton onSelect={(code) => {
                setFormData({
                  ...formData,
                  barcode: formData.barcode || code,
                  barcodes: [...(formData.barcodes || []), code],
                });
              }} />
            )}
          </div>

          {/* Existing barcodes list */}
          {(formData.barcodes || []).length > 0 && (
            <div className="space-y-1.5">
              {(formData.barcodes || []).map((bc, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
                  <span className="font-mono text-sm flex-1" dir="ltr">{bc}</span>
                  {bc === formData.barcode ? (
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-full">سەرەکی</span>
                  ) : (
                    <button type="button" onClick={() => handleSetPrimary(bc)} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] rounded-full hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                      سەرەکی بکە
                    </button>
                  )}
                  {(formData.barcodes || []).length > 1 && (
                    <button type="button" onClick={() => handleRemoveBarcode(bc)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add new barcode */}
          <div className="flex gap-2">
            <input
              type="text"
              value={extraBarcode}
              onChange={(e) => setExtraBarcode(e.target.value)}
              placeholder="بارکۆدی زیادە بنووسە..."
              className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              dir="ltr"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddBarcode(); } }}
            />
            <button type="button" onClick={handleAddBarcode} disabled={!extraBarcode.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              + زیادکردن
            </button>
          </div>

          <p className="text-xs text-slate-400">
            دەتوانیت چەند بارکۆدێک بۆ یەک کاڵا تۆمار بکەیت. بارکۆدی سەرەکی لە وەسڵ و ڕاپۆرتەکاندا بەکاردێت.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label={translations.products.category}
            value={formData.category_id || ''}
            onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
            options={categoryOptions}
          />
          <div /> {/* Spacer for grid alignment */}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={translations.products.name}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <Input
            label={translations.products.name_en}
            value={formData.name_en || ''}
            onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Select
            label={translations.products.unit}
            value={formData.unit || 'دانە'}
            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
            options={unitOptions}
          />
          <Input
            label={translations.products.cost_price}
            type="number"
            value={formData.cost_price}
            onChange={(e) => setFormData({ ...formData, cost_price: Number(e.target.value) })}
            disabled={!canChangePrice && !!product}
          />
          <Input
            label={translations.products.sale_price}
            type="number"
            value={formData.sale_price}
            onChange={(e) => setFormData({ ...formData, sale_price: Number(e.target.value) })}
            disabled={!canChangePrice && !!product}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input
            label={translations.products.stock_quantity}
            type="number"
            value={formData.stock_quantity}
            onChange={(e) => setFormData({ ...formData, stock_quantity: Number(e.target.value) })}
            disabled={!!product}
          />
          <Input
            label={translations.products.low_stock_limit}
            type="number"
            value={formData.low_stock_limit}
            onChange={(e) => setFormData({ ...formData, low_stock_limit: Number(e.target.value) })}
          />
          <Select
            label={translations.products.status}
            value={formData.status || 'active'}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
            options={statusOptions}
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto">
            {translations.common.cancel}
          </Button>
          <Button type="submit" className="w-full sm:w-auto">
            {translations.common.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
