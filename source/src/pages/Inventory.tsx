import { useState } from 'react';
import {
  Warehouse,
  Search,
  Package,
  Plus,
  Minus,
  AlertTriangle,
  History,
  ArrowUpCircle,
  ArrowDownCircle,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { translations } from '../constants/translations';
import { PERMISSIONS } from '../constants/permissions';
import { PageHeader, PageContent } from '../components/layout/Layout';
import { Card, StatCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyTable, DataList, DataListItem } from '../components/ui/Table';
import { toast } from '../components/ui/Toast';
import { ExportCSVButton } from '../components/features/DataExport';
import { ReorderPlannerWidget } from '../components/features/ReorderPlanner';
import { cn } from '../utils/cn';
import type { Product } from '../types';
import { format } from 'date-fns';

export function InventoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showMovementsModal, setShowMovementsModal] = useState(false);

  const { hasPermission, user } = useAuthStore();
  const {
    getProducts,
    getLowStockProducts,
    getStockMovements,
    adjustStock,
  } = useDataStore();

  const products = getProducts().filter(p => p.status === 'active' && p.is_trackable);
  const lowStockProducts = getLowStockProducts();
  const stockMovements = getStockMovements();

  const totalStock = products.reduce((sum, p) => sum + p.stock_quantity, 0);

  const filteredProducts = products.filter(p => {
    const matchesSearch = searchQuery === '' ||
      p.name.includes(searchQuery) ||
      p.barcode.includes(searchQuery);
    const matchesLowStock = !showLowStock || p.stock_quantity <= p.low_stock_limit;
    return matchesSearch && matchesLowStock;
  });

  const handleAdjustStock = (productId: string, quantity: number, type: 'adjustment' | 'opening_stock' | 'damage' | 'lost', notes: string) => {
    if (!user) return;

    try {
      adjustStock(productId, quantity, type, user.id, notes);
      toast.success(translations.success.stock_adjusted);
      setShowAdjustModal(false);
      setSelectedProduct(null);
    } catch (error) {
      toast.error(translations.errors.STOCK_MOVEMENT_FAILED);
    }
  };

  const getProductMovements = (productId: string) => {
    return stockMovements
      .filter(m => m.product_id === productId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  };

  const movementTypeLabels: Record<string, string> = {
    opening_stock: translations.inventory.opening_stock,
    sale: translations.inventory.sale,
    purchase: translations.inventory.purchase,
    adjustment: translations.inventory.adjustment,
    damage: translations.inventory.damage,
    lost: translations.inventory.lost,
    return: translations.inventory.return,
    transfer: translations.inventory.transfer,
  };

  return (
    <div>
      <PageHeader
        title={translations.inventory.title}
        subtitle={`${products.length} کاڵا`}
        action={
          <ExportCSVButton
            headers={['بارکۆد', 'ناو', 'یەکە', 'کۆگا', 'کەمترین']}
            rows={filteredProducts.map(p => [p.barcode, p.name, p.unit, p.stock_quantity.toString(), p.low_stock_limit.toString()])}
            filename={`zhirox-inventory-${new Date().toISOString().slice(0, 10)}`}
            label="📥 CSV"
          />
        }
      />

      <PageContent>
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            title="کۆی یەکەی کۆگا"
            value={totalStock.toLocaleString()}
            icon={<Warehouse className="w-5 h-5" />}
            color="indigo"
          />
          <StatCard
            title={translations.inventory.low_stock}
            value={lowStockProducts.length}
            icon={<AlertTriangle className="w-5 h-5" />}
            color={lowStockProducts.length > 0 ? 'red' : 'emerald'}
          />
          <StatCard
            title="کاڵای چالاک"
            value={products.length}
            icon={<Package className="w-5 h-5" />}
            color="blue"
          />
        </div>

        {/* Reorder Planner */}
        <ReorderPlannerWidget />

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
            <Button
              variant={showLowStock ? 'primary' : 'outline'}
              onClick={() => setShowLowStock(!showLowStock)}
              className="w-full sm:w-auto"
            >
              <AlertTriangle className="w-4 h-4 ml-1" />
              {translations.inventory.low_stock}
            </Button>
          </div>
        </Card>

        {/* Mobile Inventory List */}
        <div className="lg:hidden">
          {filteredProducts.length === 0 ? (
            <Card>
              <EmptyTable
                message={translations.common.no_data}
                icon={<Warehouse className="w-12 h-12" />}
              />
            </Card>
          ) : (
            <DataList>
              {filteredProducts.map(product => {
                const isLowStock = product.stock_quantity <= product.low_stock_limit;

                return (
                  <DataListItem key={product.id}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{product.name}</p>
                        <p className="text-xs text-slate-500 font-mono">{product.barcode}</p>
                      </div>
                      <div className="text-left">
                        <p className={cn(
                          'font-bold text-lg',
                          isLowStock ? 'text-red-600' : 'text-slate-900'
                        )}>
                          {product.stock_quantity}
                          {isLowStock && <AlertTriangle className="w-4 h-4 inline mr-1" />}
                        </p>
                        <p className="text-xs text-slate-500">{product.unit}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-500 mb-3">
                      <span>کەمترین: {product.low_stock_limit}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedProduct(product);
                          setShowMovementsModal(true);
                        }}
                        className="flex-1"
                      >
                        <History className="w-4 h-4 ml-1" />
                        مێژوو
                      </Button>
                      {hasPermission(PERMISSIONS.INVENTORY_ADJUST) && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSelectedProduct(product);
                            setShowAdjustModal(true);
                          }}
                          className="flex-1"
                        >
                          {translations.inventory.adjust}
                        </Button>
                      )}
                    </div>
                  </DataListItem>
                );
              })}
            </DataList>
          )}
        </div>

        {/* Desktop Inventory Table */}
        <Card padding="none" className="hidden lg:block">
          {filteredProducts.length === 0 ? (
            <EmptyTable
              message={translations.common.no_data}
              icon={<Warehouse className="w-16 h-16" />}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{translations.products.barcode}</TableHead>
                  <TableHead>{translations.products.name}</TableHead>
                  <TableHead>{translations.products.unit}</TableHead>
                  <TableHead>{translations.inventory.current_stock}</TableHead>
                  <TableHead>{translations.products.low_stock_limit}</TableHead>
                  <TableHead>{translations.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map(product => {
                  const isLowStock = product.stock_quantity <= product.low_stock_limit;

                  return (
                    <TableRow key={product.id}>
                      <TableCell className="font-mono">{product.barcode}</TableCell>
                      <TableCell>
                        <p className="font-medium text-slate-900">{product.name}</p>
                      </TableCell>
                      <TableCell>{product.unit}</TableCell>
                      <TableCell>
                        <span className={cn(
                          'font-semibold',
                          isLowStock ? 'text-red-600' : 'text-slate-900'
                        )}>
                          {product.stock_quantity}
                        </span>
                        {isLowStock && (
                          <AlertTriangle className="w-4 h-4 text-amber-500 inline mr-1" />
                        )}
                      </TableCell>
                      <TableCell>{product.low_stock_limit}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedProduct(product);
                              setShowMovementsModal(true);
                            }}
                          >
                            <History className="w-4 h-4" />
                          </Button>
                          {hasPermission(PERMISSIONS.INVENTORY_ADJUST) && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setSelectedProduct(product);
                                setShowAdjustModal(true);
                              }}
                            >
                              {translations.inventory.adjust}
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

      {/* Adjust Stock Modal */}
      <AdjustStockModal
        isOpen={showAdjustModal}
        onClose={() => {
          setShowAdjustModal(false);
          setSelectedProduct(null);
        }}
        product={selectedProduct}
        onAdjust={handleAdjustStock}
      />

      {/* Stock Movements Modal */}
      <Modal
        isOpen={showMovementsModal}
        onClose={() => {
          setShowMovementsModal(false);
          setSelectedProduct(null);
        }}
        title={`${translations.inventory.stock_movements} - ${selectedProduct?.name}`}
        size="lg"
      >
        {selectedProduct && (
          <>
            <div className="mb-4 p-3 bg-slate-50 rounded-xl flex justify-between text-sm">
              <span className="text-slate-600">{translations.inventory.current_stock}:</span>
              <span className="font-semibold">{selectedProduct.stock_quantity} {selectedProduct.unit}</span>
            </div>

            {getProductMovements(selectedProduct.id).length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <History className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">هیچ جوڵەیەک نییە</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {getProductMovements(selectedProduct.id).map(movement => (
                  <div
                    key={movement.id}
                    className="p-3 bg-slate-50 rounded-xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      {movement.quantity > 0 ? (
                        <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <ArrowUpCircle className="w-5 h-5 text-emerald-600" />
                        </div>
                      ) : (
                        <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <ArrowDownCircle className="w-5 h-5 text-red-600" />
                        </div>
                      )}
                      <div>
                        <Badge variant={movement.quantity > 0 ? 'success' : 'danger'} size="sm">
                          {movementTypeLabels[movement.type] || movement.type}
                        </Badge>
                        <p className="text-xs text-slate-500 mt-1">
                          {format(new Date(movement.created_at), 'yyyy/MM/dd HH:mm')}
                        </p>
                        {movement.notes && (
                          <p className="text-xs text-slate-500">{movement.notes}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-left">
                      <p className={`font-semibold ${movement.quantity > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                      </p>
                      <p className="text-xs text-slate-500">
                        کۆگا: {movement.stock_after}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

interface AdjustStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onAdjust: (productId: string, quantity: number, type: 'adjustment' | 'opening_stock' | 'damage' | 'lost', notes: string) => void;
}

function AdjustStockModal({ isOpen, onClose, product, onAdjust }: AdjustStockModalProps) {
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'subtract'>('add');
  const [quantity, setQuantity] = useState<number>(0);
  const [reason, setReason] = useState<'adjustment' | 'opening_stock' | 'damage' | 'lost'>('adjustment');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || quantity <= 0) return;

    const finalQuantity = adjustmentType === 'add' ? quantity : -quantity;
    onAdjust(product.id, finalQuantity, reason, notes);

    setQuantity(0);
    setNotes('');
    setAdjustmentType('add');
    setReason('adjustment');
  };

  const reasonOptions = [
    { value: 'adjustment', label: translations.inventory.adjustment },
    { value: 'opening_stock', label: translations.inventory.opening_stock },
    { value: 'damage', label: translations.inventory.damage },
    { value: 'lost', label: translations.inventory.lost },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={translations.inventory.adjust_stock}
      size="md"
    >
      {product && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-4 bg-slate-50 rounded-xl">
            <div className="flex justify-between mb-2 text-sm">
              <span className="text-slate-600">{translations.inventory.product}:</span>
              <span className="font-medium">{product.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 text-sm">{translations.inventory.current_stock}:</span>
              <span className="font-semibold">{product.stock_quantity} {product.unit}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant={adjustmentType === 'add' ? 'success' : 'outline'}
              className="flex-1"
              onClick={() => setAdjustmentType('add')}
            >
              <Plus className="w-4 h-4 ml-1" />
              زیادکردن
            </Button>
            <Button
              type="button"
              variant={adjustmentType === 'subtract' ? 'danger' : 'outline'}
              className="flex-1"
              onClick={() => setAdjustmentType('subtract')}
            >
              <Minus className="w-4 h-4 ml-1" />
              کەمکردنەوە
            </Button>
          </div>

          <Input
            label={translations.inventory.quantity}
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            min={1}
            required
          />

          <Select
            label={translations.inventory.reason}
            value={reason}
            onChange={(e) => setReason(e.target.value as typeof reason)}
            options={reasonOptions}
          />

          <Input
            label={translations.inventory.notes}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {quantity > 0 && (
            <div className="p-3 bg-indigo-50 rounded-xl">
              <p className="text-sm text-slate-600">کۆگای نوێ:</p>
              <p className="text-xl font-bold text-indigo-600">
                {adjustmentType === 'add'
                  ? product.stock_quantity + quantity
                  : product.stock_quantity - quantity
                } {product.unit}
              </p>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-4 border-t">
            <Button type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto">
              {translations.common.cancel}
            </Button>
            <Button type="submit" disabled={quantity <= 0} className="w-full sm:w-auto">
              {translations.common.save}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
