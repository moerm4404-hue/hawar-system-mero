import React, { useState, useEffect } from 'react';
import { SupplyMovement, LocationType, Supplier, User, Product } from '../types.ts';
import { api } from '../services/api.ts';
import {
  Truck,
  Plus,
  RotateCcw,
  Trash2,
  Calendar,
  Layers,
  Search,
  CheckCircle2,
  X,
  Store,
  BookOpen,
  AlertCircle,
} from 'lucide-react';

interface SuppliesScreenProps {
  currentUser: User;
  activeLocation: LocationType;
  onLocationChange: (loc: LocationType) => void;
}

export const SuppliesScreen: React.FC<SuppliesScreenProps> = ({
  currentUser,
  activeLocation,
  onLocationChange,
}) => {
  const isAdmin = currentUser.role === 'admin';

  const [supplies, setSupplies] = useState<SupplyMovement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [existingProducts, setExistingProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Add Supply Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [productName, setProductName] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('قطعة');
  const [quantity, setQuantity] = useState<number>(1);
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [salePrice, setSalePrice] = useState<number>(0);
  const [location, setLocation] = useState<LocationType>(activeLocation);
  const [supplierId, setSupplierId] = useState<string>('');
  const [isReturn, setIsReturn] = useState<boolean>(false);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [suppliesData, suppliersData, productsData] = await Promise.all([
        api.getSupplies({ location: activeLocation }),
        api.getSuppliers(),
        api.getProducts({ location: activeLocation }),
      ]);
      setSupplies(suppliesData || []);
      setSuppliers(suppliersData || []);
      setExistingProducts(productsData || []);
    } catch (err: any) {
      console.warn('Notice loading supplies data:', err?.message || err);
      setLoadError('تعذر تحديث بعض بيانات التوريدات، يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setLocation(activeLocation);
  }, [activeLocation]);

  // When user types an existing SKU, autofill name, unit, cost & sale price
  const handleSkuChange = (val: string) => {
    setSku(val);
    const match = existingProducts.find((p) => p.sku.toLowerCase() === val.trim().toLowerCase());
    if (match) {
      setProductName(match.name);
      setUnit(match.unit);
      setPurchasePrice(match.purchaseCost);
      setSalePrice(match.salePrice);
    }
  };

  const handleCreateSupply = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!productName.trim() || !sku.trim() || quantity <= 0 || purchasePrice <= 0 || salePrice <= 0) {
      setFormError('يرجى ملء جميع الحقول الإلزامية وتحديد سعر الشراء وسعر البيع والكمية بشكل صحيح');
      return;
    }

    const selectedSupplier = suppliers.find((s) => s.id === supplierId);

    try {
      const res = await api.createSupply({
        productName: productName.trim(),
        sku: sku.trim(),
        unit: unit.trim(),
        quantity,
        purchasePrice,
        salePrice,
        location,
        supplierId: supplierId || undefined,
        supplierName: selectedSupplier ? selectedSupplier.name : undefined,
        isReturn,
        notes: notes.trim(),
        userId: currentUser.id,
        userName: currentUser.name,
      });

      if (res.success) {
        setShowAddModal(false);
        // Reset form
        setProductName('');
        setSku('');
        setUnit('قطعة');
        setQuantity(1);
        setPurchasePrice(0);
        setSalePrice(0);
        setIsReturn(false);
        setNotes('');
        loadData();
      } else {
        setFormError(res.error || 'فشل حفظ حركة التوريد');
      }
    } catch (err: any) {
      setFormError(err.message || 'فشل الاتصال بالخادم');
    }
  };

  const handleDeleteSupply = async (id: string, prod: string) => {
    if (!isAdmin) {
      alert('صلاحية إلغاء أو حذف حركة التوريد مخصصة للمدير العام فقط');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من إلغاء حركة التوريد للمنتج (${prod}) وعكس الكمية في المخزون؟`)) return;

    try {
      const res = await api.deleteSupply(id);
      if (res.success) {
        loadData();
      } else {
        alert(res.error || 'فشل حذف حركة التوريد');
      }
    } catch (err: any) {
      alert(err.message || 'فشل الاتصال بالخادم');
    }
  };

  const filteredSupplies = supplies.filter(
    (s) =>
      s.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.supplierName && s.supplierName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-indigo-600" />
            <span>حركات التوريد والمشتريات المخزنية</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            سجل حركات وأصناف التوريد المباشرة، زيادة أرصدة المخازن، وتحديث تكلفة الشراء
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-200/80 p-1 rounded-xl">
            <button
              onClick={() => onLocationChange('gallery')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeLocation === 'gallery'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>توريدات المعرض</span>
            </button>
            <button
              onClick={() => onLocationChange('stationery')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeLocation === 'stationery'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>توريدات المكتبة</span>
            </button>
          </div>

          <button
            onClick={() => {
              setShowAddModal(true);
              setLocation(activeLocation);
              setFormError(null);
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm shadow-indigo-900/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل توريد جديد</span>
          </button>
        </div>
      </div>

      {/* Error Alert if any */}
      {loadError && (
        <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            onClick={() => loadData()}
            className="px-3 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 font-bold rounded-lg cursor-pointer transition-colors text-xs"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Filter and Search */}
      <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-slate-200 mb-4 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث باسم المنتج، الكود، أو اسم المورد..."
            className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
        </div>

        <span className="text-xs text-slate-500 font-mono">
          إجمالي حركات التوريد: {filteredSupplies.length}
        </span>
      </div>

      {/* Supplies Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200 font-bold">
              <tr>
                <th className="p-3.5">#</th>
                <th className="p-3.5">التاريخ</th>
                <th className="p-3.5">اسم الصنف المورد</th>
                <th className="p-3.5">الكود / SKU</th>
                <th className="p-3.5 text-center">الكمية الموردة</th>
                <th className="p-3.5 text-center">سعر الشراء للوحدة</th>
                <th className="p-3.5 text-center">سعر البيع للوحدة</th>
                <th className="p-3.5 text-center">إجمالي الشراء</th>
                <th className="p-3.5">الموقع</th>
                <th className="p-3.5">المورد</th>
                <th className="p-3.5">المسؤول</th>
                {isAdmin && <th className="p-3.5 text-center">إلغاء / حذف</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 12 : 11} className="p-8 text-center text-slate-400">
                    جاري تحميل حركات التوريد...
                  </td>
                </tr>
              ) : filteredSupplies.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 12 : 11} className="p-8 text-center text-slate-400">
                    لا توجد حركات توريد مسجلة حتى الآن
                  </td>
                </tr>
              ) : (
                filteredSupplies.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 text-slate-400 font-mono">{idx + 1}</td>
                    <td className="p-3.5 font-mono text-slate-500">
                      {new Date(s.date).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="p-3.5">
                      <div className="font-bold text-slate-800 flex items-center gap-1.5">
                        {s.isReturn ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px]">
                            مرتجع
                          </span>
                        ) : null}
                        <span>{s.productName}</span>
                      </div>
                      <div className="text-[10px] text-slate-400">الوحدة: {s.unit}</div>
                    </td>
                    <td className="p-3.5 font-mono text-slate-600 font-semibold">{s.sku}</td>
                    <td className="p-3.5 text-center font-extrabold text-slate-800 font-mono">
                      {s.quantity} {s.unit}
                    </td>
                    <td className="p-3.5 text-center font-mono font-semibold text-slate-600">
                      {(Number(s.purchasePrice) || 0).toFixed(2)}
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold text-emerald-700">
                      {s.salePrice != null && Number(s.salePrice) > 0 ? (
                        <span>{(Number(s.salePrice) || 0).toFixed(2)}</span>
                      ) : (
                        <span className="text-slate-400 font-normal">-</span>
                      )}
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold text-indigo-700">
                      {((Number(s.quantity) || 0) * (Number(s.purchasePrice) || 0)).toFixed(2)} ج.م
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          s.location === 'gallery'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {s.location === 'gallery' ? 'المعرض' : 'المكتبة'}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-600 font-medium">
                      {s.supplierName || 'بدون مورد (شراء مباشر)'}
                    </td>
                    <td className="p-3.5 text-slate-500 text-[11px]">{s.createdByName}</td>
                    {isAdmin && (
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => handleDeleteSupply(s.id, s.productName)}
                          title="حذف الحركة وعكس الرصيد"
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Supply Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Truck className="w-4 h-4 text-indigo-600" />
                <span>تسجيل حركة توريد مخزنية جديدة</span>
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateSupply} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    الكود / الباركود (SKU) *
                  </label>
                  <input
                    type="text"
                    required
                    value={sku}
                    onChange={(e) => handleSkuChange(e.target.value)}
                    placeholder="امسح الباركود أو اكتب الكود"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    إذا كان المنتج موجوداً مسبقاً، سيتم جلب اسمه وسعره وتحديث رصيده تلقائياً.
                  </span>
                </div>

                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">اسم المنتج *</label>
                  <input
                    type="text"
                    required
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="اسم الصنف المورد"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">الوحدة</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="قطعة، كرتونة، دزينة"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">موقع التوريد *</label>
                  <select
                    value={location}
                    onChange={(e) => setLocation(e.target.value as LocationType)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="gallery">المعرض (الأدوات المنزلية)</option>
                    <option value="stationery">المكتبة</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">الكمية الموردة *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">سعر الشراء للوحدة (ج.م) *</label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={purchasePrice || ''}
                    onChange={(e) => {
                      const cost = Number(e.target.value);
                      setPurchasePrice(cost);
                      if (salePrice === 0 && cost > 0) {
                        setSalePrice(Math.round(cost * 1.3));
                      }
                    }}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block font-semibold text-emerald-800 mb-1 flex items-center justify-between">
                    <span>سعر البيع للوحدة للمنتج (ج.م) *</span>
                    {purchasePrice > 0 && salePrice > 0 && (
                      <span className={`text-[10px] font-normal ${salePrice < purchasePrice ? 'text-rose-600 font-bold' : 'text-emerald-700'}`}>
                        {salePrice >= purchasePrice
                          ? `هامش الربح للقطعة: +${(salePrice - purchasePrice).toFixed(2)} ج.م`
                          : 'تنبيه: سعر البيع أقل من التكلفة!'}
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={salePrice || ''}
                    onChange={(e) => setSalePrice(Number(e.target.value))}
                    placeholder="اكتب سعر البيع للجمهور..."
                    className="w-full px-3 py-2 bg-emerald-50/40 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-950 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500 block mt-1">
                    سيتم اعتماد هذا السعر في كارت الصنف وشاشات البيع وفواتير الكاشير.
                  </span>
                </div>

                {purchasePrice > 0 && salePrice > 0 && (
                  <div className={`col-span-2 p-2.5 rounded-xl text-[11px] flex items-center justify-between border ${
                    salePrice < purchasePrice
                      ? 'bg-rose-50 border-rose-200 text-rose-800 font-semibold'
                      : 'bg-emerald-50/70 border-emerald-200 text-emerald-900 font-medium'
                  }`}>
                    <span>
                      {salePrice < purchasePrice ? '⚠️ تنبيه: سعر البيع يقل عن سعر الشراء!' : 'هامش الربح المتوقع للوحدة:'}
                    </span>
                    <span className="font-bold font-mono">
                      {(salePrice - purchasePrice).toFixed(2)} ج.م ({(((salePrice - purchasePrice) / purchasePrice) * 100).toFixed(1)}%)
                    </span>
                  </div>
                )}

                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">المورد (اختياري)</label>
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">-- بدون مورد (شراء مباشر نقدي) --</option>
                    {suppliers.map((sup) => (
                      <option key={sup.id} value={sup.id}>
                        {sup.name} {sup.company ? `(${sup.company})` : ''} - {sup.phone}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isReturn}
                      onChange={(e) => setIsReturn(e.target.checked)}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span>توريد مرتجع (إرجاع كمية إلى المورد وخصمها من المخزون)</span>
                  </label>
                </div>

                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">ملاحظات التوريد</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="رقم إذن الاستلام أو ملاحظات الفحص"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex justify-between items-center font-bold text-indigo-900">
                <div className="flex flex-col">
                  <span>إجمالي تكلفة التوريد (شراء):</span>
                  {salePrice > 0 && (
                    <span className="text-[11px] font-normal text-indigo-700 font-mono">
                      القيمة البيعية المتوقعة: {((Number(quantity) || 0) * (Number(salePrice) || 0)).toFixed(2)} ج.م
                    </span>
                  )}
                </div>
                <span className="text-sm font-mono">{((Number(quantity) || 0) * (Number(purchasePrice) || 0)).toFixed(2)} ج.م</span>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  تأكيد التوريد وإضافة الرصيد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
