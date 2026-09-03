import React, { useState, useEffect } from 'react';
import { InstallmentRecord, LocationType, User } from '../types.ts';
import { api } from '../services/api.ts';
import {
  CreditCard,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  User as UserIcon,
  Phone,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  DollarSign,
  X,
  FileText,
  Store,
  BookOpen,
} from 'lucide-react';

interface InstallmentsScreenProps {
  currentUser: User;
  activeLocation: LocationType;
  onLocationChange: (loc: LocationType) => void;
}

export const InstallmentsScreen: React.FC<InstallmentsScreenProps> = ({
  currentUser,
  activeLocation,
  onLocationChange,
}) => {
  const [installments, setInstallments] = useState<InstallmentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');

  // Payment Modal
  const [activeInstallment, setActiveInstallment] = useState<InstallmentRecord | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState('نقدي');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [receiptNotice, setReceiptNotice] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Expanded payment audit log row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadInstallments = async () => {
    setLoading(true);
    try {
      const data = await api.getInstallments({
        location: activeLocation,
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: searchQuery,
      });
      setInstallments(data);
    } catch (err) {
      console.error('Failed to load installments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInstallments();
  }, [activeLocation, statusFilter, searchQuery]);

  const openPaymentModal = (inst: InstallmentRecord) => {
    setActiveInstallment(inst);
    setPaymentAmount(inst.remainingAmount); // default to full payment
    setPaymentMethod('نقدي');
    setPaymentNotes('');
    setReceiptNotice(null);
    setPaymentError(null);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeInstallment) return;
    setPaymentError(null);

    if (paymentAmount <= 0) {
      setPaymentError('مبلغ السداد يجب أن يكون أكبر من الصفر');
      return;
    }

    if (paymentAmount > activeInstallment.remainingAmount) {
      setPaymentError(`المبلغ المطلوب سداده (${paymentAmount}) يتجاوز المتبقي (${activeInstallment.remainingAmount})`);
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const res = await api.addInstallmentPayment(activeInstallment.id, {
        amount: paymentAmount,
        paymentMethod,
        notes: paymentNotes.trim(),
        receivedById: currentUser.id,
        receivedByName: currentUser.name,
      });

      if (res.success) {
        setReceiptNotice(res.receiptMessage || 'تم تسجيل السداد بنجاح');
        loadInstallments();
        // Update active installment locally so user can see immediate update in modal
        if (res.newPaid !== undefined && res.newRemaining !== undefined) {
          setActiveInstallment({
            ...activeInstallment,
            paidAmount: res.newPaid,
            remainingAmount: res.newRemaining,
            paymentCount: activeInstallment.paymentCount + 1,
            status: res.newRemaining <= 0 ? 'completed' : 'active',
          });
        }
      } else {
        setPaymentError(res.error || 'فشل تسجيل السداد');
      }
    } catch (err: any) {
      setPaymentError(err.message || 'فشل الاتصال بالخادم');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Metrics
  const totalInstallmentSales = installments.reduce((acc, i) => acc + i.totalAmount, 0);
  const totalPaid = installments.reduce((acc, i) => acc + i.paidAmount, 0);
  const totalRemaining = installments.reduce((acc, i) => acc + i.remainingAmount, 0);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-amber-600" />
            <span>إدارة الأقساط وسداد الدفعات</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            متابعة دقيقة لأقساط العملاء، توثيق دفعات السداد الجزئي والكامل بالوقت والتاريخ، وتحديث الفواتير والإيصالات فورياً
          </p>
        </div>

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
            <span>أقساط المعرض</span>
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
            <span>أقساط المكتبة</span>
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200">
          <span className="text-xs font-semibold text-slate-500 block mb-1">إجمالي مبيعات الأقساط</span>
          <span className="text-xl font-extrabold text-slate-900 font-mono">
            {totalInstallmentSales.toFixed(2)} ج.م
          </span>
          <span className="text-[11px] text-slate-400 block mt-1">
            إجمالي الفواتير الآجلة في {activeLocation === 'gallery' ? 'المعرض' : 'المكتبة'}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200">
          <span className="text-xs font-semibold text-emerald-600 block mb-1">المبالغ المسددة والمحصلة</span>
          <span className="text-xl font-extrabold text-emerald-700 font-mono">
            {totalPaid.toFixed(2)} ج.م
          </span>
          <span className="text-[11px] text-slate-400 block mt-1">
            نسبة التحصيل: {totalInstallmentSales > 0 ? ((totalPaid / totalInstallmentSales) * 100).toFixed(1) : 0}%
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200">
          <span className="text-xs font-semibold text-amber-600 block mb-1">المبالغ المتبقية للتحصيل</span>
          <span className="text-xl font-extrabold text-amber-700 font-mono">
            {totalRemaining.toFixed(2)} ج.م
          </span>
          <span className="text-[11px] text-slate-400 block mt-1">
            مستحقات قيد المتابعة والتحصيل
          </span>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-slate-200 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث باسم العميل، رقم الهاتف، أو رقم الفاتورة..."
            className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-amber-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">الحالة:</span>
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                statusFilter === 'active' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-500'
              }`}
            >
              متبقي (نشط)
            </button>
            <button
              onClick={() => setStatusFilter('completed')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                statusFilter === 'completed' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500'
              }`}
            >
              مسدد بالكامل
            </button>
          </div>
        </div>
      </div>

      {/* Installments Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200 font-bold">
              <tr>
                <th className="p-3.5">#</th>
                <th className="p-3.5">رقم الفاتورة</th>
                <th className="p-3.5">العميل ورقم الهاتف</th>
                <th className="p-3.5 text-center">إجمالي القسط</th>
                <th className="p-3.5 text-center">المسدد</th>
                <th className="p-3.5 text-center">المتبقي</th>
                <th className="p-3.5 text-center">عدد الدفعات</th>
                <th className="p-3.5">تاريخ الاستحقاق</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5">البائع المسؤول</th>
                <th className="p-3.5 text-center">سداد / تفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-400">
                    جاري تحميل سجل الأقساط...
                  </td>
                </tr>
              ) : installments.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-400">
                    لا توجد سجلات أقساط مسجلة في هذا القسم
                  </td>
                </tr>
              ) : (
                installments.map((inst, idx) => {
                  const isCompleted = inst.remainingAmount <= 0;
                  const isExpanded = expandedId === inst.id;

                  return (
                    <React.Fragment key={inst.id}>
                      <tr className={`hover:bg-slate-50/80 transition-colors ${!isCompleted ? 'bg-amber-50/20' : ''}`}>
                        <td className="p-3.5 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3.5 font-mono font-bold text-slate-700">
                          {inst.invoiceNumber}
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-slate-800">{inst.customerName}</div>
                          <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {inst.customerPhone}
                          </div>
                        </td>
                        <td className="p-3.5 text-center font-bold text-slate-800 font-mono">
                          {inst.totalAmount.toFixed(2)}
                        </td>
                        <td className="p-3.5 text-center font-bold text-emerald-600 font-mono">
                          {inst.paidAmount.toFixed(2)}
                        </td>
                        <td className="p-3.5 text-center font-extrabold text-amber-700 font-mono">
                          {inst.remainingAmount.toFixed(2)}
                        </td>
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : inst.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] cursor-pointer"
                          >
                            <span>{inst.paymentCount} دفعات</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </td>
                        <td className="p-3.5 font-mono text-slate-600 text-[11px]">
                          {inst.dueDate}
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              isCompleted
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {isCompleted ? 'مسدد بالكامل' : 'نشط (متبقي)'}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-600 text-[11px]">
                          {inst.sellerName} ({inst.sellerCode})
                        </td>
                        <td className="p-3.5 text-center">
                          {!isCompleted ? (
                            <button
                              onClick={() => openPaymentModal(inst)}
                              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-xs cursor-pointer"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>سداد دفعة</span>
                            </button>
                          ) : (
                            <span className="text-emerald-600 font-bold text-[11px] flex items-center justify-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              تم الإتمام
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded Payment Audit Log */}
                      {isExpanded && (
                        <tr className="bg-slate-50/90 border-b border-slate-200">
                          <td colSpan={11} className="p-4">
                            <div className="bg-white rounded-xl border border-slate-200 p-3.5">
                              <div className="font-bold text-xs text-slate-800 mb-2 flex items-center justify-between">
                                <span>سجل تواريخ وأوقات دفعات السداد للقسط ({inst.invoiceNumber})</span>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  إجمالي المرات: {inst.payments?.length || 0}
                                </span>
                              </div>

                              {!inst.payments || inst.payments.length === 0 ? (
                                <div className="text-center text-slate-400 text-xs py-2">
                                  لم يتم تسجيل أي دفعات بعد
                                </div>
                              ) : (
                                <table className="w-full text-right text-xs">
                                  <thead className="bg-slate-50 text-slate-500 text-[11px]">
                                    <tr>
                                      <th className="p-2">#</th>
                                      <th className="p-2">تاريخ ووقت السداد</th>
                                      <th className="p-2">المبلغ المسدد</th>
                                      <th className="p-2">طريقة الدفع</th>
                                      <th className="p-2">الموظف المستلم</th>
                                      <th className="p-2">ملاحظات</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                                    {inst.payments.map((p, pIdx) => (
                                      <tr key={p.id || pIdx}>
                                        <td className="p-2 text-slate-400">{pIdx + 1}</td>
                                        <td className="p-2 text-slate-700 font-sans">
                                          {p.date} {p.time}
                                        </td>
                                        <td className="p-2 font-bold text-emerald-600">
                                          {p.amount.toFixed(2)} ج.م
                                        </td>
                                        <td className="p-2 font-sans text-slate-600">{p.paymentMethod}</td>
                                        <td className="p-2 font-sans text-slate-600">{p.receivedByName}</td>
                                        <td className="p-2 font-sans text-slate-400">{p.notes || '-'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Payment Modal */}
      {activeInstallment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-600" />
                <span>سداد قسط (سداد جزئي أو كامل)</span>
              </h2>
              <button onClick={() => setActiveInstallment(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Receipt Notice Banner according to required prompt specs */}
            {receiptNotice && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{receiptNotice}</span>
              </div>
            )}

            {paymentError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{paymentError}</span>
              </div>
            )}

            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">العميل:</span>
                  <span className="font-bold text-slate-800">{activeInstallment.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">رقم الفاتورة:</span>
                  <span className="font-mono font-bold text-slate-700">{activeInstallment.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">المبلغ الإجمالي:</span>
                  <span className="font-mono">{activeInstallment.totalAmount.toFixed(2)} ج.م</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">المسدد حتى الآن:</span>
                  <span className="font-mono text-emerald-600">{activeInstallment.paidAmount.toFixed(2)} ج.م</span>
                </div>
                <div className="flex justify-between text-amber-800 font-extrabold pt-1 border-t border-slate-200">
                  <span>المبلغ المتبقي:</span>
                  <span className="font-mono">{activeInstallment.remainingAmount.toFixed(2)} ج.م</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  مبلغ السداد الحالي (ج.م) *
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    max={activeInstallment.remainingAmount}
                    step="0.5"
                    required
                    value={paymentAmount || ''}
                    onChange={(e) => setPaymentAmount(Number(e.target.value))}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(activeInstallment.remainingAmount)}
                    className="px-3 py-2 bg-amber-50 text-amber-800 font-bold rounded-xl border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
                  >
                    سداد كامل
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {paymentAmount === activeInstallment.remainingAmount
                    ? 'سيتم إغلاق القسط وتحديده كمسدد بالكامل'
                    : `سداد جزئي، وسيتبقى في القسط: ${(activeInstallment.remainingAmount - paymentAmount).toFixed(2)} ج.م`}
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">طريقة الدفع</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                >
                  <option value="نقدي">نقدي (كاش)</option>
                  <option value="شبكة / بطاقة">شبكة / بطاقة بنكية</option>
                  <option value="تحويل بنكي / فودافون كاش">تحويل بنكي / محفظة إلكترونية</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">ملاحظات السداد</label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="رقم إيصال التحويل أو ملاحظات إضافية"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveInstallment(null)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  إغلاق
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  {isSubmittingPayment ? 'جاري توثيق السداد...' : 'تأكيد السداد وتحديث الفاتورة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
