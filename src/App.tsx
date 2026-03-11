/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Trash2, 
  ArrowUpRight, 
  ArrowDownRight,
  AlertCircle,
  History,
  Wallet,
  Landmark,
  Users,
  Box,
  Pencil,
  MapPin,
  LogOut,
  Archive,
  Search,
  Home,
  X,
  ChevronUp,
  ChevronDown,
  Lock,
  User,
  Eye,
  EyeOff,
  Info,
  HelpCircle,
  PlayCircle,
  Mail
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { cn, formatCurrency, formatDate } from './lib/utils';
import { Material, Income, Expense, Summary, Laboratory, ArchiveMaterial } from './types';

type Tab = 'dashboard' | 'inventory' | 'finances' | 'archive';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [laboratories, setLaboratories] = useState<Laboratory[]>([]);
  const [selectedLab, setSelectedLab] = useState<Laboratory | null>(null);
  const [viewingArchive, setViewingArchive] = useState(false);
  const [viewingInfo, setViewingInfo] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [archiveMaterials, setArchiveMaterials] = useState<ArchiveMaterial[]>([]);
  const [income, setIncome] = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalIncome: 0,
    totalExpenses: 0,
    netProfit: 0,
    breakdown: { materials: 0, salaries: 0, other: 0 }
  });
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Form states
  const [showLabForm, setShowLabForm] = useState(false);
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [showArchiveForm, setShowArchiveForm] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [selectedArchiveItem, setSelectedArchiveItem] = useState<ArchiveMaterial | null>(null);
  const [editingArchiveItem, setEditingArchiveItem] = useState<ArchiveMaterial | null>(null);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archivePageSearch, setArchivePageSearch] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [labToDelete, setLabToDelete] = useState<number | null>(null);
  const [archiveSort, setArchiveSort] = useState<{ key: keyof ArchiveMaterial; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc'
  });
  const [confirmToast, setConfirmToast] = useState<{
    show: boolean;
    message: string;
    onConfirm: () => void;
    type: 'danger' | 'warning';
  }>({ show: false, message: '', onConfirm: () => {}, type: 'warning' });

  const fetchLabs = async () => {
    const res = await fetch('/api/laboratories');
    const data = await res.json();
    setLaboratories(data);
    return data;
  };

  const fetchArchive = async () => {
    const res = await fetch('/api/archive');
    setArchiveMaterials(await res.json());
  };

  const fetchData = async (labId: number) => {
    try {
      const [mRes, iRes, eRes, sRes] = await Promise.all([
        fetch(`/api/materials?laboratory_id=${labId}`),
        fetch(`/api/income?laboratory_id=${labId}`),
        fetch(`/api/expenses?laboratory_id=${labId}`),
        fetch(`/api/summary?laboratory_id=${labId}`)
      ]);
      
      if (mRes.ok) setMaterials(await mRes.json());
      if (iRes.ok) setIncome(await iRes.json());
      if (eRes.ok) setExpenses(await eRes.json());
      if (sRes.ok) {
        const sData = await sRes.json();
        if (sData && sData.breakdown) {
          setSummary(sData);
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      setUser(data);
    } catch (e) {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      setLoading(true);
      fetchLabs().finally(() => setLoading(false));
      fetchArchive();
    }
  }, [user]);

  useEffect(() => {
    if (user && selectedLab) {
      setLoading(true);
      fetchData(selectedLab.id);
    }
  }, [user, selectedLab]);

  const [technicalError, setTechnicalError] = useState('');

  const handleAuth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError('');
    setTechnicalError('');
    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    const endpoint = isRegistering ? '/api/auth/register' : '/api/auth/login';

    try {
      console.log(`Sending auth request to ${endpoint}...`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        setLoginError('Il server ha risposto con un formato non valido (probabile crash del backend).');
        setTechnicalError(text.substring(0, 500));
        return;
      }
      
      if (res.ok) {
        setUser(data);
      } else {
        setLoginError(data.error || `Errore del server (${res.status})`);
        setTechnicalError(JSON.stringify(data, null, 2));
      }
    } catch (e) {
      console.error("Fetch error:", e);
      setLoginError(`Connessione impossibile: ${(e as Error).message}.`);
      setTechnicalError((e as Error).stack || '');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setSelectedLab(null);
  };

  const handleAddLab = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
    };

    try {
      const res = await fetch('/api/laboratories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const { id } = await res.json();
        setShowLabForm(false);
        const labs = await fetchLabs();
        const newLab = labs.find((l: Laboratory) => l.id === id);
        if (newLab) setSelectedLab(newLab);
      } else if (res.status === 401) {
        setUser(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setShowLabForm(false);
    }
  };

  const handleAddMaterial = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLab) return;
    const formData = new FormData(e.currentTarget);
    const data = {
      laboratory_id: selectedLab.id,
      name: formData.get('name') as string,
      unit: formData.get('unit') as string,
      total_quantity: Number(formData.get('total_quantity')),
      unit_cost: Number(formData.get('unit_cost')),
      location: formData.get('location') as string,
    };

    if (editingMaterial) {
      await fetch(`/api/materials/${editingMaterial.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editingMaterial, ...data }),
      });
    } else {
      await fetch('/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    }
    
    setShowMaterialForm(false);
    setEditingMaterial(null);
    setArchiveSearch('');
    fetchData(selectedLab.id);
    fetchArchive();
  };

  const handleAddUsage = async (id: number, quantity: number) => {
    if (!selectedLab) return;
    await fetch(`/api/materials/${id}/usage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ used_quantity: quantity }),
    });
    await fetchData(selectedLab.id);
    await fetchArchive();
  };

  const handleAddIncome = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLab) return;
    const formData = new FormData(e.currentTarget);
    const data = {
      laboratory_id: selectedLab.id,
      description: formData.get('description') as string,
      amount: Number(formData.get('amount')),
      date: formData.get('date') as string || new Date().toISOString(),
    };

    await fetch('/api/income', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setShowIncomeForm(false);
    fetchData(selectedLab.id);
  };

  const handleAddExpense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLab) return;
    const formData = new FormData(e.currentTarget);
    const data = {
      laboratory_id: selectedLab.id,
      category: formData.get('category') as string,
      description: formData.get('description') as string,
      amount: Number(formData.get('amount')),
      date: formData.get('date') as string || new Date().toISOString(),
    };

    await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setShowExpenseForm(false);
    fetchData(selectedLab.id);
  };

  const handleDelete = async (type: 'materials' | 'income' | 'expenses' | 'laboratories' | 'archive', id: number) => {
    setConfirmToast({
      show: true,
      message: 'Sei sicuro di voler eliminare questo elemento?',
      type: 'danger',
      onConfirm: async () => {
        await fetch(`/api/${type}/${id}`, { method: 'DELETE' });
        if (type === 'laboratories') {
          if (selectedLab?.id === id) setSelectedLab(null);
          fetchLabs();
        } else if (type === 'archive') {
          fetchArchive();
        } else if (selectedLab) {
          fetchData(selectedLab.id);
        }
        setConfirmToast(prev => ({ ...prev, show: false }));
      }
    });
  };

  const handleClearData = async () => {
    if (!selectedLab) return;
    if (confirm('ATTENZIONE: Questa azione eliminerà TUTTI i dati (inventario, entrate e uscite) di questo laboratorio. Sei sicuro?')) {
      await fetch(`/api/laboratories/${selectedLab.id}/clear`, { method: 'POST' });
      fetchData(selectedLab.id);
    }
  };

  const handleAddArchive = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      unit: formData.get('unit') as string,
      quantity: Number(formData.get('quantity')),
    };

    const res = await fetch('/api/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      setShowArchiveForm(false);
      fetchArchive();
    } else {
      const err = await res.json();
      alert(err.error);
    }
  };

  const handleTransfer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedArchiveItem) return;
    const formData = new FormData(e.currentTarget);
    const data = {
      archive_id: selectedArchiveItem.id,
      laboratory_id: Number(formData.get('laboratory_id')),
      quantity: Number(formData.get('quantity')),
    };

    const res = await fetch('/api/archive/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      setShowTransferForm(false);
      setSelectedArchiveItem(null);
      await fetchArchive();
      if (selectedLab) await fetchData(selectedLab.id);
    } else {
      const err = await res.json();
      alert(err.error);
    }
  };

  const handleEditArchive = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingArchiveItem) return;
    const formData = new FormData(e.currentTarget);
    await fetch(`/api/archive/${editingArchiveItem.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.get('name') as string,
        unit: formData.get('unit') as string,
        quantity: Number(formData.get('quantity')),
      }),
    });
    setEditingArchiveItem(null);
    fetchArchive();
    if (selectedLab) fetchData(selectedLab.id);
  };

  if (authLoading) {
    return (
      <div className="app-bg min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="brand-logo w-14 h-14 flex items-center justify-center">
            <LayoutDashboard className="text-white w-7 h-7" />
          </div>
          <div className="flex gap-1.5">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-sage-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-bg min-h-screen flex items-center justify-center p-4">
        {/* Decorative blobs */}
        <div className="fixed top-0 left-0 w-96 h-96 bg-sage-200/30 rounded-full -translate-x-1/2 -translate-y-1/2 blur-3xl pointer-events-none" />
        <div className="fixed bottom-0 right-0 w-80 h-80 bg-blush-200/20 rounded-full translate-x-1/2 translate-y-1/2 blur-3xl pointer-events-none" />

        <motion.div 
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-md relative z-10"
        >
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: 'spring', damping: 14 }}
              className="brand-logo w-20 h-20 flex items-center justify-center mx-auto mb-5"
            >
              <LayoutDashboard className="text-white w-10 h-10" />
            </motion.div>
            <h1 style={{ fontFamily: 'Nunito, sans-serif' }} className="text-4xl font-black text-warm-900 tracking-tight">LabManager</h1>
            <p className="text-warm-500 mt-1 font-medium">
              {isRegistering ? 'Crea il tuo account ✨' : 'Bentornata, accedi per continuare 🌿'}
            </p>
          </div>

          <div className="modal-panel p-8 space-y-6">
            <form onSubmit={handleAuth} className="space-y-5">
              <div>
                <label className="form-label">Username</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none transition-colors group-focus-within:text-sage-600">
                    <User size={18} className="text-sage-400 group-focus-within:text-sage-600 transition-colors" />
                  </div>
                  <input 
                    name="username" type="text" required autoFocus
                    placeholder="Inserisci username"
                    className="form-input h-12"
                    style={{ paddingLeft: '50px' }}
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Password</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none transition-colors group-focus-within:text-sage-600">
                    <Lock size={18} className="text-sage-400 group-focus-within:text-sage-600 transition-colors" />
                  </div>
                  <input 
                    name="password" type={showPassword ? "text" : "password"} required
                    placeholder="••••••••"
                    className="form-input pr-12 h-12"
                    style={{ paddingLeft: '50px' }}
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-sage-400 hover:text-sage-600 p-1 rounded-lg transition-all active:scale-90"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {loginError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="badge badge-rose p-3 rounded-xl flex flex-col gap-1.5 w-full text-left">
                      <div className="flex items-center gap-2 font-bold">
                        <AlertCircle size={13} />
                        <span>{loginError}</span>
                      </div>
                      {technicalError && (
                        <details className="text-[10px] opacity-70">
                          <summary className="cursor-pointer">Dettagli tecnici</summary>
                          <pre className="mt-1 whitespace-pre-wrap break-all">{technicalError}</pre>
                        </details>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <button type="submit" className="btn-primary w-full mt-1 text-center flex items-center justify-center gap-2">
                {isRegistering ? '✨ Crea account' : '🌿 Accedi'}
              </button>
            </form>

            <div className="pt-4 border-t border-warm-100 text-center">
              <button 
                onClick={() => { setIsRegistering(!isRegistering); setLoginError(''); }}
                className="text-sage-600 font-bold text-sm hover:text-sage-800 transition-colors"
              >
                {isRegistering ? '← Hai già un account? Accedi' : 'Prima volta? Registrati →'}
              </button>
            </div>
          </div>

          {!isRegistering && (
            <p className="text-center text-warm-400 text-sm mt-6">
              Default: <span className="font-bold text-warm-600">admin / admin</span>
            </p>
          )}
        </motion.div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="app-bg min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="brand-logo w-14 h-14 flex items-center justify-center">
            <LayoutDashboard className="text-white w-7 h-7" />
          </div>
          <div className="flex gap-1.5">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-sage-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="text-warm-500 text-sm font-semibold">Caricamento dati...</p>
        </div>
      </div>
    );
  }

  // Removed early return for !selectedLab to ensure sidebar visibility

  const pieData = (summary && summary.breakdown) ? [
    { name: 'Materiali', value: summary.breakdown.materials || 0, color: '#10b981' },
    { name: 'Stipendi', value: summary.breakdown.salaries || 0, color: '#3b82f6' },
    { name: 'Altro', value: summary.breakdown.other || 0, color: '#f59e0b' },
  ].filter(d => d.value > 0) : [];

  const sortedArchiveMaterials = [...archiveMaterials].sort((a, b) => {
    const aValue = a[archiveSort.key];
    const bValue = b[archiveSort.key];
    
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      const comparison = aValue.localeCompare(bValue);
      return archiveSort.direction === 'asc' ? comparison : -comparison;
    }
    
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return archiveSort.direction === 'asc' ? aValue - bValue : bValue - aValue;
    }
    
    return 0;
  });

  const toggleArchiveSort = (key: keyof ArchiveMaterial) => {
    setArchiveSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  return (
    <div className="app-bg min-h-screen flex flex-col md:flex-row pb-20 md:pb-0">
      {/* Mobile Top Bar */}
      <div className="md:hidden top-bar p-4 flex justify-between items-center sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="brand-logo p-1.5">
            <LayoutDashboard className="text-white w-5 h-5" />
          </div>
          <div>
            <div style={{ fontFamily: 'Nunito, sans-serif' }} className="font-black text-lg text-warm-900 leading-none">LabManager</div>
            <div className="text-[10px] text-sage-600 font-bold uppercase tracking-wider">{user?.username}</div>
          </div>
        </div>
        <button onClick={handleLogout} className="logout-btn" title="Esci">
          <LogOut size={20} />
        </button>
      </div>

      {/* Sidebar / Bottom Nav */}
      <nav className="sidebar fixed bottom-0 left-0 right-0 md:sticky md:top-0 md:w-64 md:h-screen p-2 md:p-5 flex md:flex-col gap-1 md:gap-1.5 z-50 border-t md:border-t-0">
        {/* Brand */}
        <div className="hidden md:flex items-center gap-3 px-3 mb-8 mt-2">
          <div className="brand-logo p-2.5 rounded-xl">
            <LayoutDashboard className="text-white w-5 h-5" />
          </div>
          <div>
            <div style={{ fontFamily: 'Nunito, sans-serif' }} className="font-black text-lg text-warm-900 leading-none">LabManager</div>
            <div className="text-[11px] text-sage-600 font-bold uppercase tracking-wider mt-0.5">User: {user?.username}</div>
          </div>
        </div>

        {/* Active context pill */}
        <div className="hidden md:block mb-5 px-1">
          <div className="bg-sage-50 border border-sage-100 rounded-2xl p-3">
            <div className="text-[9px] uppercase font-black text-sage-500 tracking-widest mb-1">
              {viewingArchive ? "Magazzino" : selectedLab ? "Lab attivo" : "Panoramica"}
            </div>
            <div className="font-bold text-warm-800 text-sm truncate">
              {viewingArchive ? "Archivio Globale" : selectedLab?.name ?? "Seleziona laboratorio"}
            </div>
            <button onClick={handleLogout} className="logout-btn mt-2 px-0 text-[11px]">
              <LogOut size={13} /> Esci dall'account
            </button>
          </div>
        </div>

        {/* Nav items */}
        <NavItem active={!selectedLab && !viewingArchive && !viewingInfo} onClick={() => { setSelectedLab(null); setViewingArchive(false); setViewingInfo(false); }} icon={<Home size={18} />} label="Home" />

        {!viewingArchive && !viewingInfo ? (
          <>
            {selectedLab && (
              <>
                <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={18} />} label="Panoramica" />
                <NavItem active={activeTab === 'finances'} onClick={() => setActiveTab('finances')} icon={<TrendingUp size={18} />} label="Cassa" />
                <NavItem active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} icon={<Package size={18} />} label="Materiali Lab" />
              </>
            )}
            {!selectedLab && (
              <NavItem active={false} onClick={() => { setViewingArchive(true); setActiveTab('archive'); }} icon={<Archive size={18} />} label="Magazzino" />
            )}
          </>
        ) : viewingArchive ? (
          <>
            <NavItem active={activeTab === 'archive'} onClick={() => setActiveTab('archive')} icon={<Archive size={18} />} label="Magazzino" />
            {selectedLab && (
              <NavItem active={false} onClick={() => { setViewingArchive(false); setActiveTab('dashboard'); }} icon={<LayoutDashboard size={18} />} label="Torna al Lab" />
            )}
          </>
        ) : (
          <NavItem active={true} onClick={() => setViewingInfo(true)} icon={<Info size={18} />} label="Info" />
        )}

        {/* Info button only on Home (when no lab selected and not in archive) */}
        {!selectedLab && !viewingArchive && !viewingInfo && (
          <NavItem active={false} onClick={() => { setViewingInfo(true); setViewingArchive(false); setSelectedLab(null); }} icon={<Info size={18} />} label="Info" />
        )}
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {!selectedLab && !viewingArchive && !viewingInfo && (
            <motion.div key="home" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="space-y-10">
              <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5">
                <div>
                  <h2 className="section-title">I Tuoi Laboratori 🌿</h2>
                  <p className="section-subtitle">Seleziona un laboratorio per gestire materiali e finanze</p>
                </div>
                <button onClick={() => setShowLabForm(true)} className="btn-primary flex items-center gap-2 whitespace-nowrap">
                  <Plus size={18} /> Nuovo Lab
                </button>
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {laboratories.map((lab, i) => (
                  <motion.div
                    key={lab.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    whileHover={{ y: -4 }}
                    className="glass-card p-7 cursor-pointer group relative overflow-hidden"
                    onClick={() => { setSelectedLab(lab); setActiveTab('dashboard'); }}
                  >
                    <AnimatePresence>
                      {labToDelete === lab.id && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="absolute inset-0 z-20 bg-blush-600/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center rounded-2xl"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <AlertCircle className="text-white mb-2" size={28} />
                          <p className="text-white font-bold mb-4 text-sm">Eliminare questo laboratorio?</p>
                          <div className="flex gap-2 w-full">
                            <button onClick={() => setLabToDelete(null)} className="flex-1 bg-white/20 hover:bg-white/30 text-white py-2 rounded-xl font-bold text-sm">Annulla</button>
                            <button onClick={() => { handleDelete('laboratories', lab.id); setLabToDelete(null); }} className="flex-1 bg-white text-blush-600 py-2 rounded-xl font-bold text-sm">Elimina</button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); setLabToDelete(lab.id); }} className="p-2 text-warm-300 hover:text-blush-500 hover:bg-blush-50 rounded-xl transition-all">
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="flex items-center gap-4 mb-5">
                      <div className="bg-sage-50 border border-sage-100 p-4 rounded-2xl group-hover:bg-sage-500 group-hover:border-sage-500 transition-all">
                        <Box size={28} className="text-sage-500 group-hover:text-white transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 style={{ fontFamily: 'Nunito, sans-serif' }} className="font-black text-xl text-warm-900 truncate">{lab.name}</h3>
                        <p className="text-warm-400 text-sm line-clamp-1">{lab.description || 'Nessuna descrizione'}</p>
                      </div>
                    </div>

                    <div className="flex justify-between items-end pt-4 border-t border-sage-50">
                      <span className="text-[10px] font-black text-sage-500 uppercase tracking-widest flex items-center gap-1">Entra <ArrowUpRight size={12} /></span>
                      <div className="text-right">
                        <div className="text-[9px] uppercase font-black text-warm-300 tracking-widest mb-0.5">Utile Netto</div>
                        <div className={cn("font-black text-2xl", (lab.netProfit || 0) >= 0 ? "text-sage-600" : "text-blush-600")}>
                          {formatCurrency(lab.netProfit || 0)}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
                {laboratories.length === 0 && (
                  <div className="col-span-full py-24 text-center space-y-4">
                    <div className="bg-sage-50 border border-sage-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                      <Box size={36} className="text-sage-400" />
                    </div>
                    <div>
                      <h3 style={{ fontFamily: 'Nunito, sans-serif' }} className="text-xl font-black text-warm-800">Nessun laboratorio</h3>
                      <p className="text-warm-400">Inizia creando il tuo primo laboratorio</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'dashboard' && selectedLab && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="space-y-8">
              <header className="flex flex-col sm:flex-row justify-between items-end gap-4">
                <div>
                  <h2 className="section-title">Panoramica</h2>
                  <p className="section-subtitle italic">Laboratorio: {selectedLab?.name}</p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase font-black text-warm-400 tracking-widest mb-1">Totale Utile Netto</div>
                  <div className={cn("text-3xl font-black", { fontFamily: 'Nunito, sans-serif' }, (summary?.netProfit || 0) >= 0 ? "text-sage-600" : "text-blush-600")}>
                    {formatCurrency(summary?.netProfit || 0)}
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <StatCard title="Entrate Totali" value={formatCurrency(summary?.totalIncome || 0)} icon={<ArrowUpRight className="text-sage-600" />} trend="positive" />
                <StatCard title="Uscite Totali" value={formatCurrency(summary?.totalExpenses || 0)} icon={<ArrowDownRight className="text-blush-500" />} trend="negative" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Chart Section */}
                <div className="glass-card p-6">
                  <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <TrendingDown size={20} className="text-slate-400" />
                    Ripartizione Spese
                  </h3>
                  <div className="h-64">
                    {pieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            formatter={(value: number) => formatCurrency(value)}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-400 italic">
                        Nessun dato disponibile
                      </div>
                    )}
                  </div>
                  <div className="flex justify-center gap-6 mt-4">
                    {pieData.map((d) => (
                      <div key={d.name} className="flex items-center gap-2 text-sm">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                        <span className="text-slate-600">{d.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Low Stock Alerts */}
                <div className="glass-card p-6">
                  <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <AlertCircle size={20} className="text-amber-500" />
                    Materiale Lab in Esaurimento
                  </h3>
                  <div className="space-y-4">
                    {materials.filter(m => (m.total_quantity - m.used_quantity) < 3).length > 0 ? (
                      materials
                        .filter(m => (m.total_quantity - m.used_quantity) < 3)
                        .map(m => (
                          <div key={m.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-100">
                            <div>
                              <p className="font-medium text-amber-900">{m.name}</p>
                              <p className="text-xs text-amber-700">Rimanente: {m.total_quantity - m.used_quantity} {m.unit}</p>
                            </div>
                            <div className="text-amber-600 font-bold text-sm">
                              Sotto soglia
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-400 italic py-12">
                        Tutto il materiale lab è ok
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'inventory' && selectedLab && (
            <motion.div
              key="inventory"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <header>
                  <h2 className="section-title flex items-center gap-2"><Package size={26} className="text-sage-500" />Materiali Lab</h2>
                  <p className="section-subtitle">Gestisci i materiali e il loro utilizzo</p>
                </header>
                <button onClick={() => setShowMaterialForm(true)} className="btn-primary flex items-center gap-2 whitespace-nowrap">
                  <Plus size={18} /> Nuovo Materiale
                </button>
              </div>

              <div className="search-box">
                <Search size={17} className="icon" />
                <input
                  type="text"
                  placeholder="Cerca materiale per nome o posizione..."
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {materials
                  .filter(m => 
                    m.name.toLowerCase().includes(inventorySearch.toLowerCase()) || 
                    (m.location || '').toLowerCase().includes(inventorySearch.toLowerCase())
                  )
                  .map(material => (
                    <MaterialCard 
                      key={material.id} 
                      material={material} 
                      onAddUsage={(qty) => handleAddUsage(material.id, qty)}
                      onDelete={() => handleDelete('materials', material.id)}
                      onEdit={() => {
                        setEditingMaterial(material);
                        setShowMaterialForm(true);
                      }}
                    />
                  ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'finances' && selectedLab && (
            <motion.div
              key="finances"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="section-title flex items-center gap-2"><Wallet size={26} className="text-sage-500" />Cassa</h2>
                  <p className="section-subtitle">Entrate dalle quote e uscite varie</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button onClick={() => setShowIncomeForm(true)} className="btn-primary flex-1 sm:flex-none flex items-center justify-center gap-2">
                    <ArrowUpRight size={18} /> + Entrata
                  </button>
                  <button onClick={() => setShowExpenseForm(true)} className="btn-danger flex-1 sm:flex-none flex items-center justify-center gap-2">
                    <ArrowDownRight size={18} /> - Uscita
                  </button>
                </div>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Income List */}
                <div className="glass-card overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <TrendingUp className="text-emerald-500" size={20} />
                      Quote Iscritti
                    </h3>
                    <span className="text-emerald-600 font-bold">{formatCurrency(income.reduce((acc, i) => acc + i.amount, 0))}</span>
                  </div>
                  <div className="divide-y divide-slate-50 max-h-[500px] overflow-y-auto">
                    {income.map(item => (
                      <div key={item.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div>
                          <p className="font-medium text-slate-800">{item.description}</p>
                          <p className="text-xs text-slate-400">{formatDate(item.date)}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-bold text-emerald-600">+{formatCurrency(item.amount)}</span>
                          <button onClick={() => handleDelete('income', item.id)} className="text-slate-300 hover:text-rose-500 transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {income.length === 0 && <div className="p-12 text-center text-slate-400 italic">Nessuna entrata registrata</div>}
                  </div>
                </div>

                {/* Expense List */}
                <div className="glass-card overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <TrendingDown className="text-rose-500" size={20} />
                      Uscite Totali
                    </h3>
                    <span className="text-rose-600 font-bold">{formatCurrency(expenses.reduce((acc, e) => acc + e.amount, 0))}</span>
                  </div>
                  <div className="divide-y divide-slate-50 max-h-[500px] overflow-y-auto">
                    {expenses
                      .filter(item => !item.description.startsWith('Trasferimento da Archivio:'))
                      .map(item => (
                        <div key={item.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "p-2 rounded-lg",
                              item.category === 'salary' ? "bg-blue-50 text-blue-600" : 
                              item.category === 'material_purchase' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                            )}>
                              {item.category === 'salary' ? <Users size={16} /> : 
                               item.category === 'material_purchase' ? <Box size={16} /> : <History size={16} />}
                            </div>
                            <div>
                              <p className="font-medium text-slate-800">{item.description}</p>
                              <p className="text-xs text-slate-400">{formatDate(item.date)} • {
                                item.category === 'salary' ? 'Stipendio' : 
                                item.category === 'material_purchase' ? 'Materiale' : 'Altro'
                              }</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="font-bold text-rose-600">-{formatCurrency(item.amount)}</span>
                            <button onClick={() => handleDelete('expenses', item.id)} className="text-slate-300 hover:text-rose-500 transition-colors">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    {expenses.filter(item => !item.description.startsWith('Trasferimento da Archivio:')).length === 0 && (
                      <div className="p-12 text-center text-slate-400 italic">Nessuna spesa registrata</div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          {activeTab === 'archive' && viewingArchive && (
            <motion.div key="archive" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="space-y-6">
              <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="section-title">Magazzino 📦</h2>
                  <p className="section-subtitle">Database centrale dei materiali</p>
                </div>
                <button onClick={() => setShowArchiveForm(true)} className="btn-primary flex items-center gap-2 whitespace-nowrap">
                  <Plus size={18} /> Nuovo Materiale
                </button>
              </header>

              {/* Search */}
              <div className="search-box">
                <Search size={17} className="icon" />
                <input
                  type="text"
                  placeholder="Cerca per nome o unità..."
                  value={archivePageSearch}
                  onChange={(e) => setArchivePageSearch(e.target.value)}
                />
              </div>

              <div className="glass-card overflow-hidden">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse tbl">
                    <thead>
                      <tr>
                        <th onClick={() => toggleArchiveSort('name')} className="cursor-pointer hover:text-sage-600 transition-colors">
                          <div className="flex items-center gap-1">Nome {archiveSort.key === 'name' && (archiveSort.direction === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}</div>
                        </th>
                        <th onClick={() => toggleArchiveSort('unit')} className="cursor-pointer hover:text-sage-600 transition-colors">
                          <div className="flex items-center gap-1">Unità {archiveSort.key === 'unit' && (archiveSort.direction === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}</div>
                        </th>
                        <th onClick={() => toggleArchiveSort('quantity')} className="cursor-pointer hover:text-sage-600 transition-colors">
                          <div className="flex items-center gap-1">Giacenza {archiveSort.key === 'quantity' && (archiveSort.direction === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}</div>
                        </th>
                        <th className="text-right">Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedArchiveMaterials
                        .filter(m => m.name.toLowerCase().includes(archivePageSearch.toLowerCase()) || m.unit.toLowerCase().includes(archivePageSearch.toLowerCase()))
                        .map((m, i) => (
                        <motion.tr key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }} className="border-b border-sage-50 hover:bg-sage-50/40 transition-colors">
                          <td className="font-bold text-warm-900">{m.name}</td>
                          <td className="text-warm-500">{m.unit}</td>
                          <td>
                            <span className={cn("badge", m.quantity > 0 ? "badge-green" : "badge-rose")}>
                              {m.quantity} {m.unit}
                            </span>
                          </td>
                          <td>
                            <div className="flex justify-end items-center gap-2">
                              <button
                                onClick={() => { setSelectedArchiveItem(m); setShowTransferForm(true); }}
                                className="btn-primary flex items-center gap-1.5 text-xs px-3 py-2"
                                style={{ padding: '7px 14px', fontSize: '0.78rem' }}
                              >
                                <ArrowUpRight size={14} /> Invia → Lab
                              </button>
                              <button onClick={() => setEditingArchiveItem(m)} className="btn-secondary flex items-center gap-1 text-xs px-3 py-2" style={{ padding: '7px 12px', fontSize: '0.78rem' }}>
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => handleDelete('archive', m.id)} className="btn-ghost text-blush-400 hover:text-blush-600 p-2">
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                      {sortedArchiveMaterials.filter(m => m.name.toLowerCase().includes(archivePageSearch.toLowerCase())).length === 0 && (
                        <tr><td colSpan={4} className="p-12 text-center text-warm-400 italic">Nessun materiale trovato</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-sage-50">
                  {sortedArchiveMaterials
                    .filter(m => m.name.toLowerCase().includes(archivePageSearch.toLowerCase()))
                    .map(m => (
                    <div key={m.id} className="p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-warm-900">{m.name}</h4>
                          <p className="text-xs text-warm-400">Unità: {m.unit}</p>
                        </div>
                        <span className={cn("badge", m.quantity > 0 ? "badge-green" : "badge-rose")}>{m.quantity} {m.unit}</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setSelectedArchiveItem(m); setShowTransferForm(true); }} className="btn-primary flex-1 text-xs flex items-center justify-center gap-1.5" style={{ padding: '9px 12px', fontSize: '0.78rem' }}>
                          <ArrowUpRight size={14} /> Invia → Lab
                        </button>
                        <button onClick={() => setEditingArchiveItem(m)} className="btn-secondary px-3 py-2 flex items-center gap-1 text-xs">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDelete('archive', m.id)} className="btn-ghost px-3 py-2 text-blush-400">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {sortedArchiveMaterials.length === 0 && (
                    <div className="p-8 text-center text-warm-400 italic text-sm">Il magazzino è vuoto.</div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {viewingInfo && (
            <motion.div 
              key="info" 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              transition={{ duration: 0.4, ease: "easeOut" }} 
              className="space-y-10"
            >
              <header className="text-center space-y-3 py-4">
                <div className="inline-flex p-4 rounded-3xl bg-sage-50 border border-sage-100 mb-2">
                  <Info size={36} className="text-sage-600" />
                </div>
                <h2 className="section-title text-3xl font-black">Informazioni e Supporto</h2>
                <p className="text-warm-500 max-w-xl mx-auto">Tutto quello che c'è da sapere per gestire al meglio il tuo laboratorio creativo.</p>
              </header>

              <div className="flex justify-center">
                <button 
                  onClick={() => setShowTutorial(true)}
                  className="glass-card p-8 flex flex-col items-center text-center gap-4 hover:border-sage-300 transition-all group max-w-sm w-full"
                >
                  <div className="w-16 h-16 rounded-full bg-sage-50 flex items-center justify-center text-sage-600 group-hover:bg-sage-100 group-hover:scale-110 transition-all">
                    <PlayCircle size={32} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-warm-900 mb-1">Guida Rapida</h3>
                    <p className="text-sm text-warm-500">Scopri come usare ogni sezione dell'app in pochi passi.</p>
                  </div>
                </button>
              </div>

              <div className="glass-card p-10 overflow-hidden relative">
                <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                  <HelpCircle size={160} className="text-warm-900" />
                </div>
                
                <div className="space-y-6 relative z-10">
                  <h3 className="text-2xl font-black text-warm-900 flex items-center gap-2">
                    <History size={24} className="text-sage-500" />
                    Info Progetto
                  </h3>
                  
                  <div className="space-y-4">
                    <p className="text-warm-700 leading-relaxed font-medium">
                      Lab Manager è l'applicativo ideale per le scuole dell'infanzia e istituti scolastici per la gestione dei laboratori creativi e delle attività didattiche dei bambini. Uno strumento completo che permette di gestire più laboratori contemporaneamente, monitorare i materiali in magazzino e in uso, e coordinare tutta la parte economica e amministrativa in modo semplice e intuitivo.
                    </p>
                    
                    <div className="bg-sage-600/5 rounded-2xl p-6 border border-sage-600/10 space-y-2">
                      <p className="text-warm-800 font-bold text-lg">Lab Manager realizzata da Castro Massimo</p>
                      <p className="text-warm-500 text-sm font-bold uppercase tracking-widest">versione 1.0 • anno 2026</p>
                    </div>

                    <div className="pt-8 flex flex-col items-center text-center gap-3">
                      <div className="p-3 bg-sage-50 text-sage-600 rounded-full">
                        <Mail size={24} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-warm-400 text-sm italic">Per informazioni, sviluppo di app personalizzate o giochi:</p>
                        <a 
                          href="mailto:castromassimo@gmail.com" 
                          className="text-sage-600 font-black text-lg hover:text-sage-700 transition-colors flex items-center justify-center gap-2 underline decoration-sage-200 underline-offset-4"
                        >
                          castromassimo@gmail.com
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <Modal show={showLabForm} onClose={() => setShowLabForm(false)} title="🌿 Nuovo Laboratorio">
        <form onSubmit={handleAddLab} className="space-y-4">
          <Input label="Nome Laboratorio" name="name" required placeholder="es. Laboratorio Ceramica" />
          <Input label="Descrizione" name="description" placeholder="es. Produzione oggettistica e corsi" />
          <button type="submit" className="btn-primary w-full">Crea Laboratorio</button>
        </form>
      </Modal>

      <Modal 
        show={showMaterialForm} 
        onClose={() => {
          setShowMaterialForm(false);
          setEditingMaterial(null);
          setArchiveSearch('');
        }} 
        title={editingMaterial ? "Modifica Materiale" : "Aggiungi Materiale"}
      >
        <form onSubmit={handleAddMaterial} className="space-y-4">
          {!editingMaterial && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Search size={14} className="text-emerald-600" />
                  Cerca in Archivio
                </div>
                <button 
                  type="button"
                  onClick={() => {
                    setShowMaterialForm(false);
                    setViewingArchive(true);
                    setActiveTab('archive');
                  }}
                  className="text-[10px] text-emerald-600 font-bold hover:underline flex items-center gap-1"
                >
                  <Archive size={10} />
                  Vai a Magazzino
                </button>
              </label>
              <div className="relative">
                <input 
                  type="text"
                  value={archiveSearch}
                  onChange={(e) => setArchiveSearch(e.target.value)}
                  placeholder="Digita per cercare..."
                  className="w-full px-4 py-2 text-base rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                />
                {archiveSearch && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                    {archiveMaterials
                      .filter(m => m.name.toLowerCase().includes(archiveSearch.toLowerCase()))
                      .map(m => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            const form = document.querySelector('form') as HTMLFormElement;
                            if (form) {
                              (form.elements.namedItem('name') as HTMLInputElement).value = m.name;
                              (form.elements.namedItem('unit') as HTMLInputElement).value = m.unit;
                            }
                            setArchiveSearch('');
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-emerald-50 text-sm border-b border-slate-50 last:border-0"
                        >
                          <div className="font-bold text-slate-800">{m.name}</div>
                          <div className="text-xs text-slate-500">{m.unit} - Giacenza: {m.quantity}</div>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <Input 
            label="Nome Materiale" 
            name="name" 
            required 
            placeholder="es. Argilla, Tempere..." 
            defaultValue={editingMaterial?.name}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="Unità di misura" 
              name="unit" 
              required 
              placeholder="es. kg, litri, pz" 
              defaultValue={editingMaterial?.unit}
            />
            <Input 
              label="Quantità Totale" 
              name="total_quantity" 
              type="number" 
              step="0.01" 
              required 
              defaultValue={editingMaterial?.total_quantity}
            />
          </div>
          <Input 
            label="Costo Unitario (€)" 
            name="unit_cost" 
            type="number" 
            step="0.01" 
            required 
            defaultValue={editingMaterial?.unit_cost}
          />
          <Input 
            label="Posizione / Scaffale" 
            name="location" 
            placeholder="es. Scaffale A, Armadio 2..." 
            defaultValue={editingMaterial?.location}
          />
          <button type="submit" className="btn-primary w-full">
            {editingMaterial ? "Aggiorna Materiale" : "Salva Materiale"}
          </button>
        </form>
      </Modal>

      <Modal show={showArchiveForm} onClose={() => setShowArchiveForm(false)} title="Nuovo Materiale Magazzino">
        <form onSubmit={handleAddArchive} className="space-y-4">
          <Input label="Nome Materiale" name="name" required placeholder="es. Argilla Rossa" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Unità" name="unit" required placeholder="es. kg, litri" />
            <Input label="Quantità" name="quantity" type="number" step="0.01" required />
          </div>
          <button type="submit" className="btn-primary w-full">Aggiungi al Magazzino</button>
        </form>
      </Modal>

      <Modal show={showTransferForm} onClose={() => { setShowTransferForm(false); setSelectedArchiveItem(null); }} title={`Invia ${selectedArchiveItem?.name} → Lab`}>
        <div className="mb-4 p-3 bg-sage-50 border border-sage-100 rounded-xl text-sm text-sage-700 font-medium">
          Disponibile: <strong>{selectedArchiveItem?.quantity} {selectedArchiveItem?.unit}</strong>
        </div>
        <form onSubmit={handleTransfer} className="space-y-4">
          <div>
            <label className="form-label">Laboratorio Destinazione</label>
            <select name="laboratory_id" required className="form-input">
              <option value="">Seleziona laboratorio...</option>
              {laboratories.map(lab => (
                <option key={lab.id} value={lab.id}>{lab.name}</option>
              ))}
            </select>
          </div>
          <Input label={`Quantità (${selectedArchiveItem?.unit})`} name="quantity" type="number" step="0.01" max={selectedArchiveItem?.quantity} required />
          <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2">
            <ArrowUpRight size={18} /> Conferma Trasferimento
          </button>
        </form>
      </Modal>

      <Modal show={showIncomeForm} onClose={() => setShowIncomeForm(false)} title="✨ Registra Entrata">
        <form onSubmit={handleAddIncome} className="space-y-4">
          <Input label="Descrizione" name="description" required placeholder="es. Quota Mario Rossi" />
          <Input label="Importo (€)" name="amount" type="number" step="0.01" required />
          <Input label="Data" name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} />
          <button type="submit" className="btn-primary w-full">Salva Entrata</button>
        </form>
      </Modal>

      <Modal show={showExpenseForm} onClose={() => setShowExpenseForm(false)} title="📤 Registra Uscita">
        <form onSubmit={handleAddExpense} className="space-y-4">
          <div>
            <label className="form-label">Categoria</label>
            <select name="category" className="form-input">
              <option value="salary">Stipendio Dipendente</option>
              <option value="other">Altra Uscita</option>
            </select>
          </div>
          <Input label="Descrizione" name="description" required placeholder="es. Stipendio Febbraio" />
          <Input label="Importo (€)" name="amount" type="number" step="0.01" required />
          <Input label="Data" name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} />
          <button type="submit" className="btn-danger w-full">Salva Uscita</button>
        </form>
      </Modal>

      <AnimatePresence>
        {confirmToast.show && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md"
          >
            <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-lg",
                  confirmToast.type === 'danger' ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400"
                )}>
                  <AlertCircle size={20} />
                </div>
                <p className="text-sm font-medium">{confirmToast.message}</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setConfirmToast(prev => ({ ...prev, show: false }))}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:bg-slate-800 transition-colors"
                >
                  Annulla
                </button>
                <button 
                  onClick={confirmToast.onConfirm}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95",
                    confirmToast.type === 'danger' ? "bg-rose-600 hover:bg-rose-700 text-white" : "bg-amber-500 hover:bg-amber-600 text-white"
                  )}
                >
                  Conferma
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Archive Modal */}
      <Modal show={!!editingArchiveItem} onClose={() => setEditingArchiveItem(null)} title="Modifica Materiale Magazzino">
        <form onSubmit={handleEditArchive} className="space-y-4">
          <Input label="Nome" name="name" required defaultValue={editingArchiveItem?.name} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Unità" name="unit" required defaultValue={editingArchiveItem?.unit} />
            <Input label="Quantità" name="quantity" type="number" step="0.01" required defaultValue={editingArchiveItem?.quantity} />
          </div>
          <button type="submit" className="btn-primary w-full">Salva Modifiche</button>
        </form>
      </Modal>

      {/* Tutorial Modal */}
      <Modal show={showTutorial} onClose={() => setShowTutorial(false)} title="📖 Tutorial LabManager">
        <div className="space-y-6 py-2 max-h-[70vh] overflow-y-auto pr-2 scrollbar-thin">
          <section className="space-y-3">
            <h4 className="font-black text-sage-600 flex items-center gap-2 italic">1. Creare un Laboratorio</h4>
            <p className="text-sm text-warm-700">Inizia dalla Home cliccando su <strong>"Nuovo Lab"</strong>. Assegna un nome e una descrizione. Ogni lab è un'unità di produzione indipendente.</p>
          </section>

          <section className="space-y-3">
            <h4 className="font-black text-sage-600 flex items-center gap-2 italic">2. Panoramica & Dashboard</h4>
            <p className="text-sm text-warm-700">Entrando in un laboratorio, la <strong>Panoramica</strong> ti mostra subito l'utile netto, il grafico delle uscite e gli avvisi per i materiali che stanno finendo.</p>
          </section>

          <section className="space-y-3">
            <h4 className="font-black text-sage-600 flex items-center gap-2 italic">3. Cassa (Entrate e Uscite)</h4>
            <p className="text-sm text-warm-700">Nella sezione <strong>Cassa</strong> registri i guadagni (quote, vendite) e le uscite (stipendi, affitti, acquisti vari). Il sistema calcola automaticamente il bilancio.</p>
          </section>

          <section className="space-y-3">
            <h4 className="font-black text-sage-600 flex items-center gap-2 italic">4. Gestione Materiali Lab</h4>
            <p className="text-sm text-warm-700">In <strong>Materiali Lab</strong> inserisci quello che compri specificamente per il lab. Puoi registrare quanto materiale usi: il costo viene scalato dalle entrate e la giacenza aggiornata nel lab e nell'archivio.</p>
          </section>

          <section className="space-y-3">
            <h4 className="font-black text-sage-600 flex items-center gap-2 italic">5. Magazzino (Scorta Centrale)</h4>
            <p className="text-sm text-warm-700">Il <strong>Magazzino</strong> è la tua scorta globale. Qui carichi grandi acquisti e puoi <strong>"Inviare al Lab"</strong> le quantità specifiche. Se un lab viene chiuso, il materiale non usato resta disponibile qui per altri laboratori.</p>
          </section>
          
          <div className="pt-4">
            <button onClick={() => setShowTutorial(false)} className="btn-primary w-full py-4 rounded-2xl font-black">Ho capito, andiamo!</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// --- Subcomponents ---

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "nav-item flex-1 md:flex-none flex-col md:flex-row justify-center md:justify-start text-[10px] md:text-sm",
        active ? "active" : ""
      )}
    >
      <span className={cn("transition-transform group-hover:scale-110", active ? "text-sage-600" : "text-warm-400")}>
        {icon}
      </span>
      <span className="font-semibold">{label}</span>
    </button>
  );
}

function StatCard({ title, value, icon, trend, highlight }: { title: string, value: string, icon: React.ReactNode, trend?: 'positive' | 'negative', highlight?: boolean }) {
  return (
    <div className={cn("stat-card", highlight && "highlight")}>
      <div className="flex justify-between items-start mb-3">
        <span className={cn("text-sm font-semibold", highlight ? "text-sage-200" : "text-warm-500")}>{title}</span>
        <div className={cn("p-2 rounded-xl", highlight ? "bg-white/10" : "bg-sage-50 border border-sage-100")}>{icon}</div>
      </div>
      <div className={cn("text-2xl font-black tracking-tight", highlight ? "text-white" : trend === 'positive' ? "text-sage-600" : trend === 'negative' ? "text-blush-600" : "text-warm-900")}>
        {value}
      </div>
    </div>
  );
}

interface MaterialCardProps {
  key?: React.Key;
  material: Material;
  onAddUsage: (qty: number) => void;
  onDelete: () => void;
  onEdit: () => void;
}

function MaterialCard({ material, onAddUsage, onDelete, onEdit }: MaterialCardProps) {
  const [usage, setUsage] = useState('');
  const remaining = material.total_quantity - material.used_quantity;
  const percentage = Math.max(0, Math.round((remaining / material.total_quantity) * 100));

  return (
    <motion.div whileHover={{ y: -2 }} className="glass-card p-6 space-y-4">
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 style={{ fontFamily: 'Nunito, sans-serif' }} className="font-black text-lg text-warm-900">{material.name}</h4>
            {material.archive_id && (
              <span className="badge badge-green">Magazzino</span>
            )}
          </div>
          <div className="flex flex-col gap-0.5 mt-1">
            <p className="text-xs text-warm-400 flex items-center gap-1"><Wallet size={11} />Costo unitario: {formatCurrency(material.unit_cost)}</p>
            {material.location && <p className="text-xs text-warm-500 flex items-center gap-1"><MapPin size={11} className="text-sage-400" />{material.location}</p>}
          </div>
        </div>
        <div className="flex gap-1.5 ml-2">
          <button onClick={onEdit} className="btn-ghost p-2 text-sage-400 hover:text-sage-600"><Pencil size={16} /></button>
          <button onClick={onDelete} className="btn-ghost p-2 text-warm-300 hover:text-blush-500"><Trash2 size={16} /></button>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-warm-500 font-medium">Rimanente</span>
          <span className={cn("font-black text-sm", remaining < 3 ? "text-blush-600" : "text-sage-600")}>
            {remaining.toFixed(2)} {material.unit} ({percentage}%)
          </span>
        </div>
        <div className="progress-track">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            className={cn("progress-fill", remaining < 3 && "danger")}
          />
        </div>
      </div>

      <div className="pt-2 flex gap-2">
        <input
          type="number"
          value={usage}
          onChange={(e) => setUsage(e.target.value)}
          placeholder={`Utilizzo (${material.unit})`}
          className="form-input flex-1 text-sm"
        />
        <button
          onClick={() => { if (usage && Number(usage) > 0) { onAddUsage(Number(usage)); setUsage(''); } }}
          className="btn-primary text-sm px-4"
          style={{ padding: '10px 16px' }}
        >
          Registra
        </button>
      </div>
    </motion.div>
  );
}

function Modal({ show, onClose, title, children }: { show: boolean, onClose: () => void, title: string, children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94 }}
        transition={{ type: 'spring', damping: 22, stiffness: 350 }}
        className="modal-panel w-full max-w-md overflow-hidden"
      >
        <div className="p-6 border-b border-warm-100 flex justify-between items-center">
          <h3 style={{ fontFamily: 'Nunito, sans-serif' }} className="text-xl font-black text-warm-900">{title}</h3>
          <button onClick={onClose} className="btn-ghost p-2 rounded-xl"><X size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </motion.div>
    </div>
  );
}

function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="form-label">{label}</label>
      <input {...props} className="form-input" />
    </div>
  );
}
