import React, { useState, useEffect } from 'react';
import { Customer, Supplier, User } from '../types.ts';
import { api } from '../services/api.ts';
import { Users, Truck, Plus, Search, Phone, MapPin, Building, Edit2, Trash2, X } from 'lucide-react';

interface CustomersSuppliersScreenProps {
  currentUser: User;
}

export const CustomersSuppliersScreen: React.FC<CustomersSuppliersScreenProps> = ({ currentUser }) => {
  const isAdmin = currentUser.role === 'admin';
  const [activeSection, setActiveSection] = useState<'customers' | 'suppliers'>('customers');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cData, sData] = await Promise.all([api.getCustomers(), api.getSuppliers()]);
      setCustomers(cData);
      setSuppliers(sData);
    } catch (err) {
      console.error('Failed to load customers & suppliers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAddModal = () => {
    setName('');
    setPhone('');
    setCompany('');
    setAddress('');
    setNotes('');
    setFormError(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !phone.trim()) {
      setFormError('الاسم ورقم الهاتف مطلوبان');
      return;
    }

    try {
      if (activeSection === 'customers') {
        const res = await api.createCustomer({
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          notes: notes.trim(),
        });
        if (res.success) {
          setShowModal(false);
          loadData();
        } else {
          setFormError(res.error || 'فشل إضافة العميل');
        }
      } else {
        const res = await api.createSupplier({
          name: name.trim(),
          phone: phone.trim(),
          company: company.trim(),
          address: address.trim(),
          notes: notes.trim(),
        });
        if (res.success) {
          setShowModal(false);
          loadData();
        } else {
          setFormError(res.error || 'فشل إضافة المورد');
        }
      }
    } catch (err: any) {
      setFormError(err.message || 'فشل الاتصال بالخادم');
    }
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.company && s.company.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" />
            <span>إدارة العملاء والموردين المستقلة</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            فصل تام بين سجلات العملاء وسجلات الموردين وفقاً لقواعد المنظومة
          </p>
        </div>

        {/* Section Switcher Tabs */}
        <div className="flex items-center gap-2 bg-slate-200/80 p-1 rounded-xl">
          <button
            onClick={() => {
              setActiveSection('customers');
              setSearchQuery('');
            }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSection === 'customers'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>دليل العملاء ({customers.length})</span>
          </button>
          <button
            onClick={() => {
              setActiveSection('suppliers');
              setSearchQuery('');
            }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSection === 'suppliers'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>دليل الموردين ({suppliers.length})</span>
          </button>
        </div>
      </div>

      {/* Filter and Add */}
      <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-slate-200 mb-4 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeSection === 'customers'
                ? 'ابحث باسم العميل أو رقم الهاتف...'
                : 'ابحث باسم المورد أو الشركة أو الهاتف...'
            }
            className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
        </div>

        <button
          onClick={openAddModal}
          className={`px-4 py-2 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${
            activeSection === 'customers'
              ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20'
              : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/20'
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>{activeSection === 'customers' ? 'إضافة عميل جديد' : 'إضافة مورد جديد'}</span>
        </button>
      </div>

      {/* Tables based on activeSection */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          {activeSection === 'customers' ? (
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200 font-bold">
                <tr>
                  <th className="p-3.5">#</th>
                  <th className="p-3.5">اسم العميل</th>
                  <th className="p-3.5">رقم الهاتف</th>
                  <th className="p-3.5">العنوان</th>
                  <th className="p-3.5">تاريخ التسجيل</th>
                  <th className="p-3.5">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      جاري التحميل...
                    </td>
                  </tr>
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      لا يوجد عملاء مسجلين
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((c, idx) => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="p-3.5 font-bold text-slate-800">{c.name}</td>
                      <td className="p-3.5 font-mono text-slate-600 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {c.phone}
                      </td>
                      <td className="p-3.5 text-slate-600">{c.address || '-'}</td>
                      <td className="p-3.5 font-mono text-slate-400 text-[11px]">
                        {new Date(c.createdAt).toLocaleDateString('ar-EG')}
                      </td>
                      <td className="p-3.5 text-slate-500 text-[11px]">{c.notes || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200 font-bold">
                <tr>
                  <th className="p-3.5">#</th>
                  <th className="p-3.5">اسم المورد</th>
                  <th className="p-3.5">الشركة / المؤسسة</th>
                  <th className="p-3.5">رقم الهاتف</th>
                  <th className="p-3.5">العنوان</th>
                  <th className="p-3.5">تاريخ التسجيل</th>
                  <th className="p-3.5">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      جاري التحميل...
                    </td>
                  </tr>
                ) : filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      لا يوجد موردين مسجلين
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map((s, idx) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="p-3.5 font-bold text-slate-800">{s.name}</td>
                      <td className="p-3.5 text-indigo-700 font-semibold">{s.company || '-'}</td>
                      <td className="p-3.5 font-mono text-slate-600 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {s.phone}
                      </td>
                      <td className="p-3.5 text-slate-600">{s.address || '-'}</td>
                      <td className="p-3.5 font-mono text-slate-400 text-[11px]">
                        {new Date(s.createdAt).toLocaleDateString('ar-EG')}
                      </td>
                      <td className="p-3.5 text-slate-500 text-[11px]">{s.notes || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h2 className="text-base font-bold text-slate-800">
                {activeSection === 'customers' ? 'إضافة عميل جديد' : 'إضافة مورد جديد'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200">
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {activeSection === 'customers' ? 'اسم العميل *' : 'اسم المورد المسؤول *'}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {activeSection === 'suppliers' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">اسم الشركة / المعمل</label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="مثال: شركة النصر للمنظفات"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">رقم الهاتف *</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010xxxxxxxx"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">العنوان</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="المدينة / المنطقة"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">ملاحظات</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 text-white font-bold rounded-xl shadow-xs cursor-pointer ${
                    activeSection === 'customers'
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-indigo-600 hover:bg-indigo-500'
                  }`}
                >
                  حفظ السجل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
