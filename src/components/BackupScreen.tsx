import React, { useState, useEffect } from 'react';
import { User, AuditLog } from '../types.ts';
import { api } from '../services/api.ts';
import {
  HardDrive,
  Download,
  Upload,
  RefreshCcw,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  History,
  Lock,
  FileCheck,
  Server,
} from 'lucide-react';

interface BackupScreenProps {
  currentUser: User;
  onSystemResetSuccess: () => void;
}

export const BackupScreen: React.FC<BackupScreenProps> = ({ currentUser, onSystemResetSuccess }) => {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Status message
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Restore state
  const [isRestoring, setIsRestoring] = useState(false);

  // Reset System State
  const [showResetModal, setShowResetModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const loadLogs = async () => {
    setLoadingLogs(true);
    try {
      const logs = await api.getAuditLogs(100);
      setAuditLogs(logs);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // 1. Manual Backup Download
  const handleDownloadBackup = () => {
    window.open('/api/backup/download', '_blank');
    setStatusMessage({
      type: 'success',
      text: 'تم بدء تحميل النسخة الاحتياطية الموثقة لقاعدة SQLite بنجاح',
    });
    loadLogs();
  };

  // 2. Verified Restore
  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('تحذير: استعادة النسخة الاحتياطية ستستبدل البيانات الحالية بعد فحص التوقيع والسلامة الهيكلية. سيتم أخذ نسخة أمان تلقائية قبل التبديل. هل ترغب بالاستمرار؟')) {
      e.target.value = '';
      return;
    }

    setIsRestoring(true);
    setStatusMessage(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const b64 = (evt.target?.result as string).split(',')[1];
        const res = await api.restoreDatabase({
          fileBase64: b64,
          userId: currentUser.id,
          userName: currentUser.name,
        });

        if (res.success) {
          setStatusMessage({
            type: 'success',
            text: res.message || 'تم فحص توقيع SQLite والتكامل الهيكلي واستعادة قاعدة البيانات بنجاح تام',
          });
          loadLogs();
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } else {
          setStatusMessage({
            type: 'error',
            text: res.error || 'فشلت استعادة قاعدة البيانات: الملف غير صالح أو فشل اختبار PRAGMA integrity_check',
          });
        }
      } catch (err: any) {
        setStatusMessage({
          type: 'error',
          text: err.message || 'حدث خطأ أثناء قراءة ملف النسخة الاحتياطية',
        });
      } finally {
        setIsRestoring(false);
        e.target.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  // 3. Secure System Reset
  const handleExecuteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    if (!adminPassword.trim()) {
      setResetError('كلمة مرور المدير مطلوبة لتأكيد هذا الإجراء الحساس');
      return;
    }

    setResetting(true);
    try {
      const res = await api.resetSystem({
        adminPassword: adminPassword.trim(),
        userId: currentUser.id,
        userName: currentUser.name,
      });

      if (res.success) {
        setShowResetModal(false);
        alert('تم أخذ نسخة أمان تلقائية وإعادة ضبط النظام بنجاح. سيتم توجيهك الآن لشاشة التهيئة الأولى.');
        onSystemResetSuccess();
      } else {
        setResetError(res.error || 'فشلت عملية إعادة ضبط النظام');
      }
    } catch (err: any) {
      setResetError(err.message || 'فشل الاتصال بالخادم');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto" dir="rtl">
      {/* Top Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-indigo-600" />
          <span>النسخ الاحتياطي والصيانة والتدقيق الأمني</span>
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          إدارة نسخ قاعدة بيانات SQLite وفحص السلامة الهيكلية ومعالجة أخطاء القفل وسجل تدقيق العمليات الحساسة
        </p>
      </div>

      {statusMessage && (
        <div
          className={`mb-6 p-4 rounded-2xl text-xs font-semibold flex items-center justify-between border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="font-bold text-base px-2">×</button>
        </div>
      )}

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {/* Backup Download */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
              <Download className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-800 mb-1">نسخ احتياطي يدوي فوري</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              تحميل نسخة كاملة ومحدثة من قاعدة بيانات SQLite تشمل المنتجات، المبيعات، الأقساط، والمصروفات.
            </p>
          </div>

          <button
            onClick={handleDownloadBackup}
            className="mt-4 w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>تحميل نسخة SQLite (.sqlite)</span>
          </button>
        </div>

        {/* Restore Database with Verification */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
              <FileCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-800 mb-1">استعادة قاعدة بيانات مفحوصة</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              يتم فحص ترويسة SQLite (SQLite format 3)، واختبار التكامل الهيكلي PRAGMA integrity_check، وأخذ نسخة أمان قبل الاستبدال.
            </p>
          </div>

          <label className="mt-4 w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-colors text-center">
            <Upload className="w-4 h-4" />
            <span>{isRestoring ? 'جاري الفحص والاستعادة...' : 'استعادة وفحص ملف نسخة'}</span>
            <input
              type="file"
              accept=".sqlite, .db"
              disabled={isRestoring}
              onChange={handleRestoreFile}
              className="hidden"
            />
          </label>
        </div>

        {/* Reset System */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-800 mb-1">إعادة ضبط النظام</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              تصفير كافة الجداول لبدء سنة مالية جديدة. يتطلب كلمة مرور المدير ويقوم بحفظ نسخة أمان تلقائياً أولاً.
            </p>
          </div>

          <button
            onClick={() => setShowResetModal(true)}
            className="mt-4 w-full py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <RefreshCcw className="w-4 h-4 text-rose-600" />
            <span>بدء إجراء إعادة الضبط</span>
          </button>
        </div>
      </div>

      {/* Windows EXE Installer Guide Banner */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-xl border border-slate-800 mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold mb-1">
            <Server className="w-4 h-4" />
            <span>جاهزية مثبت Windows EXE المستقل</span>
          </div>
          <h3 className="font-bold text-sm">وضع التحديث (الحفاظ على البيانات) مقابل التثبيت النظيف</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            قاعدة بيانات النظام تعمل بمحرك SQLite الداخلي الآمن (In-Memory + Atomic Flush) لمنع أخطاء قفل ملفات الـ WAL تماماً، ويتم حفظ ملف البيانات في المسار المحلي مع حماية ملفات النسخ من الحذف عند التحديث.
          </p>
        </div>
        <div className="text-xs bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 font-mono text-slate-300">
          hawr-gallery.sqlite
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-xs text-slate-800">سجل تدقيق العمليات الحساسة والأمان (Audit Log)</h3>
          </div>
          <button
            onClick={loadLogs}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
          >
            تحديث السجل
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">التاريخ والوقت</th>
                <th className="p-3">نوع الإجراء</th>
                <th className="p-3">التفاصيل والبيان</th>
                <th className="p-3">المستخدم المسؤول</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingLogs ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">
                    جاري تحميل سجل الأمان...
                  </td>
                </tr>
              ) : auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">
                    لا توجد سجلات مسجلة
                  </td>
                </tr>
              ) : (
                auditLogs.map((log, idx) => (
                  <tr key={log.id || idx} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3 text-slate-400 font-mono">{idx + 1}</td>
                    <td className="p-3 font-mono text-slate-500 text-[11px]">
                      {new Date(log.timestamp).toLocaleString('ar-EG')}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono text-[10px] font-bold">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 text-slate-700 font-medium">{log.details}</td>
                    <td className="p-3 font-bold text-slate-800">{log.userName}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <ShieldAlert className="w-6 h-6" />
              <h2 className="text-base font-bold text-slate-900">تأكيد إعادة ضبط النظام بالكامل</h2>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              سيتم تفريغ فواتير المبيعات، المخزون، الأقساط، والمصروفات. سيقوم النظام بحفظ نسخة أمان احتياطية تلقائياً قبل البدء. هذا الإجراء غير قابل للتراجع.
            </p>

            {resetError && (
              <div className="mb-4 p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200">
                {resetError}
              </div>
            )}

            <form onSubmit={handleExecuteReset} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  أدخل كلمة مرور حساب المدير العام للتأكيد *
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-rose-500 pr-9"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={resetting}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  {resetting ? 'جاري الحفظ وإعادة الضبط...' : 'تأكيد وإعادة الضبط'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
