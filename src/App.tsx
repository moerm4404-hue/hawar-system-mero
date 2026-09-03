import React, { useState, useEffect } from 'react';
import { User, LocationType } from './types.ts';
import { api } from './services/api.ts';
import { AuthScreen } from './components/AuthScreen.tsx';
import { Header } from './components/Header.tsx';
import { PosScreen } from './components/PosScreen.tsx';
import { ProductsScreen } from './components/ProductsScreen.tsx';
import { SuppliesScreen } from './components/SuppliesScreen.tsx';
import { InstallmentsScreen } from './components/InstallmentsScreen.tsx';
import { CustomersSuppliersScreen } from './components/CustomersSuppliersScreen.tsx';
import { ExpensesScreen } from './components/ExpensesScreen.tsx';
import { ReportsScreen } from './components/ReportsScreen.tsx';
import { EmployeesScreen } from './components/EmployeesScreen.tsx';
import { BackupScreen } from './components/BackupScreen.tsx';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('hawr_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const [isInitialized, setIsInitialized] = useState<boolean>(true);
  const [checkingInit, setCheckingInit] = useState<boolean>(true);

  // Active operational location (gallery vs stationery)
  const [activeLocation, setActiveLocation] = useState<LocationType>('gallery');

  // Navigation tab (defaults to pos - "أزل صفحة نظرة عامة واجعل التنقل يبدأ بالصفحات التشغيلية الأساسية")
  const [activeTab, setActiveTab] = useState<string>('pos');

  const checkInitialization = async () => {
    setCheckingInit(true);
    try {
      const res = await api.getSystemInit();
      setIsInitialized(res.initialized);
      if (!res.initialized) {
        // No admin yet, wipe any stale session
        setCurrentUser(null);
        localStorage.removeItem('hawr_user');
      }
    } catch (err) {
      console.error('Failed to check initialization status:', err);
    } finally {
      setCheckingInit(false);
    }
  };

  useEffect(() => {
    checkInitialization();
  }, []);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('hawr_user', JSON.stringify(user));
    setIsInitialized(true);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('hawr_user');
  };

  const handleSystemResetSuccess = () => {
    setCurrentUser(null);
    localStorage.removeItem('hawr_user');
    setIsInitialized(false);
    setActiveTab('pos');
  };

  if (checkingInit) {
    return (
      <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center p-4 font-sans text-slate-800" dir="rtl">
        <div className="text-center text-slate-600 space-y-3 bg-white p-8 rounded-2xl border border-slate-200 shadow-xs">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold tracking-wide">جاري فحص حالة قاعدة بيانات معرض حور...</p>
        </div>
      </div>
    );
  }

  // If user is not authenticated or system needs first-boot admin creation
  if (!currentUser) {
    return (
      <AuthScreen
        isInitialized={isInitialized}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F1F5F9] flex flex-col font-sans text-slate-800" dir="rtl">
      {/* Top Header & Navigation */}
      <Header
        currentUser={currentUser}
        activeLocation={activeLocation}
        onLocationChange={setActiveLocation}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLogout={handleLogout}
      />

      {/* Main Workspace View */}
      <main className="flex-1 overflow-x-hidden">
        {activeTab === 'pos' && (
          <PosScreen
            currentUser={currentUser}
            activeLocation={activeLocation}
          />
        )}

        {activeTab === 'products' && (
          <ProductsScreen
            currentUser={currentUser}
            activeLocation={activeLocation}
            onLocationChange={setActiveLocation}
          />
        )}

        {activeTab === 'supplies' && (
          <SuppliesScreen
            currentUser={currentUser}
            activeLocation={activeLocation}
            onLocationChange={setActiveLocation}
          />
        )}

        {activeTab === 'installments' && (
          <InstallmentsScreen
            currentUser={currentUser}
            activeLocation={activeLocation}
            onLocationChange={setActiveLocation}
          />
        )}

        {activeTab === 'customers_suppliers' && (
          <CustomersSuppliersScreen
            currentUser={currentUser}
          />
        )}

        {activeTab === 'expenses' && (
          <ExpensesScreen
            currentUser={currentUser}
            activeLocation={activeLocation}
            onLocationChange={setActiveLocation}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsScreen
            currentUser={currentUser}
            activeLocation={activeLocation}
            onLocationChange={setActiveLocation}
          />
        )}

        {activeTab === 'employees' && (
          <EmployeesScreen
            currentUser={currentUser}
          />
        )}

        {activeTab === 'backup' && (
          <BackupScreen
            currentUser={currentUser}
            onSystemResetSuccess={handleSystemResetSuccess}
          />
        )}
      </main>
    </div>
  );
}
