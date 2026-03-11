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
  User
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

  // Form states
  const [showLabForm, setShowLabForm] = useState(false);
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [showArchiveForm, setShowArchiveForm] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [selectedArchiveItem, setSelectedArchiveItem] = useState<ArchiveMaterial | null>(null);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [archiveSearch, setArchiveSearch] = useState('');
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
      
      setMaterials(await mRes.json());
      setIncome(await iRes.json());
      setExpenses(await eRes.json());
      setSummary(await sRes.json());
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

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <div className="bg-emerald-600 w-16 h-16 rounded-2xl shadow-xl shadow-emerald-200 flex items-center justify-center mx-auto mb-4">
              <LayoutDashboard className="text-white w-8 h-8" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">LabManager</h1>
            <p className="text-slate-500 font-medium">{isRegistering ? 'Crea un nuovo account' : 'Accedi per gestire la tua attività'}</p>
          </div>

          <div className="glass-card p-8 space-y-6">
            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Username</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    name="username"
                    type="text"
                    required
                    placeholder="Il tuo username"
                    className="w-full pl-12 pr-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-slate-50/50"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    name="password"
                    type="password"
                    required
                    placeholder="••••••••"
                    className="w-full pl-12 pr-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-slate-50/50"
                  />
                </div>
              </div>

              {loginError && (
                <div className="text-rose-600 text-xs font-bold bg-rose-50 p-4 rounded-xl border border-rose-100 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={14} />
                    <span>Errore:</span>
                  </div>
                  <p className="opacity-80 break-words leading-relaxed">{loginError}</p>
                  
                  {technicalError && (
                    <details className="mt-2 bg-white/50 p-2 rounded-lg border border-rose-200">
                      <summary className="cursor-pointer text-[10px] text-rose-400 uppercase tracking-widest hover:text-rose-600">Dettagli tecnici</summary>
                      <pre className="mt-2 text-[10px] font-mono overflow-auto max-h-32 text-slate-600 whitespace-pre-wrap">
                        {technicalError}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              <button 
                type="submit"
                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-[0.98] mt-2"
              >
                {isRegistering ? 'Registrati' : 'Accedi'}
              </button>
            </form>

            <div className="pt-4 border-t border-slate-100 text-center">
              <button 
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setLoginError('');
                }}
                className="text-emerald-600 font-bold text-sm hover:underline"
              >
                {isRegistering ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati'}
              </button>
            </div>
          </div>
          {!isRegistering && (
            <p className="text-center text-slate-400 text-sm mt-8">
              Credenziali predefinite: <span className="font-bold text-slate-600">admin / admin</span>
            </p>
          )}
        </motion.div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!selectedLab && !viewingArchive) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8 flex flex-col items-center">
        <header className="w-full max-w-4xl flex flex-col sm:flex-row justify-between items-center gap-6 mb-8 md:mb-12">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-3 rounded-2xl shadow-lg shadow-emerald-200">
              <LayoutDashboard className="text-white w-8 h-8" />
            </div>
            <div>
              <h1 className="font-black text-2xl md:text-3xl tracking-tight text-slate-900">LabManager</h1>
              <p className="text-slate-500 text-xs md:text-sm font-medium">Gestione Laboratori & Inventario</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button 
              onClick={() => {
                setViewingArchive(true);
                setActiveTab('archive');
              }}
              className="w-full sm:w-auto bg-white text-slate-700 border border-slate-200 px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all shadow-sm active:scale-95"
            >
              <Archive size={20} className="text-emerald-600" />
              Archivio Materiali
            </button>
            <button 
              onClick={() => setShowLabForm(true)}
              className="w-full sm:w-auto bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 active:scale-95"
            >
              <Plus size={20} />
              Nuovo Laboratorio
            </button>
          </div>
        </header>

        <div className="w-full max-w-4xl grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
          {laboratories.map(lab => (
            <motion.div
              key={lab.id}
              whileHover={{ y: -4 }}
              className="glass-card p-8 cursor-pointer group relative overflow-hidden"
              onClick={() => setSelectedLab(lab)}
            >
              <AnimatePresence>
                {labToDelete === lab.id && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-20 bg-rose-600/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <AlertCircle className="text-white mb-2" size={32} />
                    <p className="text-white font-bold mb-4">Eliminare definitivamente questo laboratorio?</p>
                    <div className="flex gap-3 w-full">
                      <button 
                        onClick={() => setLabToDelete(null)}
                        className="flex-1 bg-white/20 hover:bg-white/30 text-white py-2.5 rounded-xl font-bold transition-colors"
                      >
                        Annulla
                      </button>
                      <button 
                        onClick={() => {
                          handleDelete('laboratories', lab.id);
                          setLabToDelete(null);
                        }}
                        className="flex-1 bg-white text-rose-600 py-2.5 rounded-xl font-bold transition-colors shadow-lg"
                      >
                        Elimina
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setLabToDelete(lab.id);
                  }}
                  className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                >
                  <Trash2 size={20} />
                </button>
              </div>
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-slate-100 p-4 rounded-2xl group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                  <Box size={32} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-800">{lab.name}</h3>
                  <p className="text-slate-500">{lab.description || "Nessuna descrizione"}</p>
                </div>
              </div>
              
              <div className="flex justify-between items-end">
                <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                  Gestisci Laboratorio
                  <ArrowUpRight size={16} />
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase font-black text-slate-400 tracking-widest flex items-center justify-end gap-1">
                    <Landmark size={12} className="text-slate-400" /> Totale Utile Netto
                  </div>
                  <div className={cn(
                    "font-bold text-lg",
                    (lab.netProfit || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                  )}>
                    {formatCurrency(lab.netProfit || 0)}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
          {laboratories.length === 0 && (
            <div className="col-span-full py-20 text-center space-y-4">
              <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto text-slate-400">
                <Box size={40} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">Nessun laboratorio</h3>
                <p className="text-slate-500">Inizia creando il tuo primo laboratorio</p>
              </div>
            </div>
          )}
        </div>

        <Modal show={showLabForm} onClose={() => setShowLabForm(false)} title="Nuovo Laboratorio">
          <form onSubmit={handleAddLab} className="space-y-4">
            <Input label="Nome Laboratorio" name="name" required placeholder="es. Laboratorio Ceramica" />
            <Input label="Descrizione" name="description" placeholder="es. Sede centrale, piano terra..." />
            <button type="submit" className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95">
              Crea Laboratorio
            </button>
          </form>
        </Modal>
      </div>
    );
  }

  const pieData = summary ? [
    { name: 'Materiali', value: summary.breakdown.materials, color: '#10b981' },
    { name: 'Stipendi', value: summary.breakdown.salaries, color: '#3b82f6' },
    { name: 'Altro', value: summary.breakdown.other, color: '#f59e0b' },
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
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row pb-20 md:pb-0">
      {/* Mobile Top Bar */}
      <div className="md:hidden bg-white border-b border-slate-200 p-4 flex justify-between items-center sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-600 p-1.5 rounded-lg">
            <LayoutDashboard className="text-white w-5 h-5" />
          </div>
          <h1 className="font-bold text-lg tracking-tight text-slate-800">LabManager</h1>
        </div>
        <button 
          onClick={handleLogout}
          className="text-slate-400 hover:text-rose-500 p-2 rounded-lg transition-colors border border-transparent hover:border-rose-100 hover:bg-rose-50"
          title="Esci"
        >
          <LogOut size={24} />
        </button>
      </div>

      {/* Sidebar / Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 md:sticky md:top-0 md:w-64 md:h-screen bg-white border-t md:border-t-0 md:border-r border-slate-200 p-2 md:p-4 flex md:flex-col gap-1 md:gap-2 z-50">
        <div className="hidden md:flex items-center gap-2 px-2 mb-8">
          <div className="bg-emerald-600 p-2 rounded-lg">
            <LayoutDashboard className="text-white w-6 h-6" />
          </div>
          <h1 className="font-bold text-xl tracking-tight text-slate-800">LabManager</h1>
        </div>

        <div className="hidden md:block mb-6 px-2">
          <div className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-2">
            {viewingArchive ? "Sola Lettura" : "Laboratorio Attivo"}
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <div className="font-bold text-slate-800 truncate">
              {viewingArchive ? "Archivio Globale" : selectedLab?.name}
            </div>
            <button 
              onClick={handleLogout}
              className="text-slate-400 hover:text-rose-600 transition-all mt-2 p-1 hover:bg-rose-50 rounded-lg inline-flex items-center justify-center font-bold text-xs gap-1"
              title="Esci"
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>

        {/* Home Button (List of Labs) */}
        <NavItem 
          active={!selectedLab && !viewingArchive} 
          onClick={() => {
            setSelectedLab(null);
            setViewingArchive(false);
          }}
          icon={<Home size={20} />}
          label="Home"
        />

        {!viewingArchive ? (
          <>
            {selectedLab && (
              <>
                <NavItem 
                  active={activeTab === 'dashboard'} 
                  onClick={() => setActiveTab('dashboard')}
                  icon={<LayoutDashboard size={20} />}
                  label="Laboratorio"
                />
                <NavItem 
                  active={activeTab === 'finances'} 
                  onClick={() => setActiveTab('finances')}
                  icon={<TrendingUp size={20} />}
                  label="Cassa"
                />
                <NavItem 
                  active={activeTab === 'inventory'} 
                  onClick={() => setActiveTab('inventory')}
                  icon={<Package size={20} />}
                  label="Materiale Lab"
                />
              </>
            )}
            <NavItem 
              active={false} 
              onClick={() => {
                setViewingArchive(true);
                setActiveTab('archive');
              }}
              icon={<Archive size={20} />}
              label="Magazzino"
            />
          </>
        ) : (
          <>
            <NavItem 
              active={activeTab === 'archive'} 
              onClick={() => setActiveTab('archive')}
              icon={<Archive size={20} />}
              label="Magazzino"
            />
            {selectedLab && (
              <NavItem 
                active={false} 
                onClick={() => {
                  setViewingArchive(false);
                  setActiveTab('dashboard');
                }}
                icon={<LayoutDashboard size={20} />}
                label="Torna al Lab"
              />
            )}
          </>
        )}
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <header className="flex justify-between items-start">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900">Panoramica</h2>
                  <p className="text-slate-500">Stato attuale della tua attività</p>
                </div>
              </header>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard 
                  title="Totale Utile Netto" 
                  value={formatCurrency(summary.netProfit)} 
                  icon={<Landmark className="text-blue-600" />}
                  highlight={true}
                />
                <StatCard 
                  title="Entrate Totali" 
                  value={formatCurrency(summary.totalIncome)} 
                  icon={<ArrowUpRight className="text-emerald-600" />}
                  trend="positive"
                />
                <StatCard 
                  title="Uscite Totali" 
                  value={formatCurrency(summary.totalExpenses)} 
                  icon={<ArrowDownRight className="text-rose-600" />}
                  trend="negative"
                />
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

          {activeTab === 'inventory' && (
            <motion.div
              key="inventory"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <header>
                  <h2 className="text-3xl font-bold text-slate-900">Inventario</h2>
                  <p className="text-slate-500">Gestisci i materiali e il loro utilizzo</p>
                </header>
                <button 
                  onClick={() => setShowMaterialForm(true)}
                  className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <Plus size={20} />
                  Nuovo Materiale
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input 
                  type="text"
                  placeholder="Cerca materiale per nome o posizione..."
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-sm bg-white"
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

          {activeTab === 'finances' && (
            <motion.div
              key="finances"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900">Economia</h2>
                  <p className="text-slate-500">Entrate dalle quote e uscite varie</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button 
                    onClick={() => setShowIncomeForm(true)}
                    className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
                  >
                    <ArrowUpRight size={20} />
                    Entrata
                  </button>
                  <button 
                    onClick={() => setShowExpenseForm(true)}
                    className="flex-1 sm:flex-none bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
                  >
                    <ArrowDownRight size={20} />
                    Uscita
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
            <motion.div
              key="archive"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900">Archivio Materiali</h2>
                  <p className="text-slate-500">Database centrale dei materiali condiviso</p>
                </div>
                <button 
                  onClick={() => setShowArchiveForm(true)}
                  className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-100 active:scale-95"
                >
                  <Plus size={20} />
                  Nuovo Materiale Archivio
                </button>
              </header>

              <div className="glass-card overflow-hidden">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th 
                          className="p-4 text-xs font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-emerald-600 transition-colors"
                          onClick={() => toggleArchiveSort('name')}
                        >
                          <div className="flex items-center gap-1">
                            Nome
                            {archiveSort.key === 'name' && (
                              archiveSort.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                            )}
                          </div>
                        </th>
                        <th 
                          className="p-4 text-xs font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-emerald-600 transition-colors"
                          onClick={() => toggleArchiveSort('unit')}
                        >
                          <div className="flex items-center gap-1">
                            Unità
                            {archiveSort.key === 'unit' && (
                              archiveSort.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                            )}
                          </div>
                        </th>
                        <th 
                          className="p-4 text-xs font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-emerald-600 transition-colors"
                          onClick={() => toggleArchiveSort('quantity')}
                        >
                          <div className="flex items-center gap-1">
                            Giacenza Archivio
                            {archiveSort.key === 'quantity' && (
                              archiveSort.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                            )}
                          </div>
                        </th>
                        <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedArchiveMaterials.map(m => (
                        <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <td className="p-4 font-bold text-slate-800">{m.name}</td>
                          <td className="p-4 text-slate-600">{m.unit}</td>
                          <td className="p-4">
                            <span className={cn(
                              "px-3 py-1 rounded-full text-xs font-bold",
                              m.quantity > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                            )}>
                              {m.quantity} {m.unit}
                            </span>
                          </td>
                          <td className="p-4 text-right flex justify-end gap-2">
                            <button 
                              onClick={() => {
                                setSelectedArchiveItem(m);
                                setShowTransferForm(true);
                              }}
                              className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                            >
                              <ArrowUpRight size={16} />
                              Invia a Laboratorio
                            </button>
                            <button 
                              onClick={() => handleDelete('archive', m.id)}
                              className="text-slate-300 hover:text-rose-500 p-2 rounded-lg transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {sortedArchiveMaterials.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-12 text-center text-slate-400 italic">
                            L'archivio è vuoto. Aggiungi materiali per usarli nei laboratori.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  <div className="p-4 bg-slate-50 flex gap-2 overflow-x-auto no-scrollbar">
                    <button 
                      onClick={() => toggleArchiveSort('name')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all",
                        archiveSort.key === 'name' ? "bg-emerald-600 text-white" : "bg-white text-slate-600 border border-slate-200"
                      )}
                    >
                      Nome {archiveSort.key === 'name' && (archiveSort.direction === 'asc' ? '↑' : '↓')}
                    </button>
                    <button 
                      onClick={() => toggleArchiveSort('unit')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all",
                        archiveSort.key === 'unit' ? "bg-emerald-600 text-white" : "bg-white text-slate-600 border border-slate-200"
                      )}
                    >
                      Unità {archiveSort.key === 'unit' && (archiveSort.direction === 'asc' ? '↑' : '↓')}
                    </button>
                    <button 
                      onClick={() => toggleArchiveSort('quantity')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all",
                        archiveSort.key === 'quantity' ? "bg-emerald-600 text-white" : "bg-white text-slate-600 border border-slate-200"
                      )}
                    >
                      Quantità {archiveSort.key === 'quantity' && (archiveSort.direction === 'asc' ? '↑' : '↓')}
                    </button>
                  </div>
                  {sortedArchiveMaterials.map(m => (
                    <div key={m.id} className="p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-slate-800">{m.name}</h4>
                          <p className="text-xs text-slate-500">Unità: {m.unit}</p>
                        </div>
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                          m.quantity > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                        )}>
                          {m.quantity} {m.unit}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setSelectedArchiveItem(m);
                            setShowTransferForm(true);
                          }}
                          className="flex-1 bg-emerald-50 text-emerald-700 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1"
                        >
                          <ArrowUpRight size={14} />
                          Invia a Laboratorio
                        </button>
                        <button 
                          onClick={() => handleDelete('archive', m.id)}
                          className="px-3 bg-slate-50 text-slate-400 py-2 rounded-xl"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {sortedArchiveMaterials.length === 0 && (
                    <div className="p-8 text-center text-slate-400 italic text-sm">
                      L'archivio è vuoto.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
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
          <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-semibold hover:bg-emerald-700 transition-colors">
            {editingMaterial ? "Aggiorna Materiale" : "Salva Materiale"}
          </button>
        </form>
      </Modal>

      <Modal show={showArchiveForm} onClose={() => setShowArchiveForm(false)} title="Nuovo Materiale Archivio">
        <form onSubmit={handleAddArchive} className="space-y-4">
          <Input label="Nome Materiale" name="name" required placeholder="es. Argilla Rossa" />
          <Input label="Unità di misura" name="unit" required placeholder="es. kg, litri, pz" />
          <Input label="Quantità Iniziale" name="quantity" type="number" step="0.01" required />
          <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-semibold hover:bg-emerald-700 transition-colors">
            Aggiungi all'Archivio
          </button>
        </form>
      </Modal>

      <Modal 
        show={showTransferForm} 
        onClose={() => {
          setShowTransferForm(false);
          setSelectedArchiveItem(null);
        }} 
        title={`Invia ${selectedArchiveItem?.name} a Laboratorio`}
      >
        <form onSubmit={handleTransfer} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Laboratorio Destinazione</label>
            <select name="laboratory_id" required className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all">
              <option value="">Seleziona laboratorio...</option>
              {laboratories.map(lab => (
                <option key={lab.id} value={lab.id}>{lab.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <Input 
              label={`Quantità (${selectedArchiveItem?.unit})`} 
              name="quantity" 
              type="number" 
              step="0.01" 
              max={selectedArchiveItem?.quantity}
              required 
            />
          </div>
          <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-semibold hover:bg-emerald-700 transition-colors">
            Conferma Trasferimento
          </button>
        </form>
      </Modal>

      <Modal show={showIncomeForm} onClose={() => setShowIncomeForm(false)} title="Registra Entrata">
        <form onSubmit={handleAddIncome} className="space-y-4">
          <Input label="Descrizione" name="description" required placeholder="es. Quota Mario Rossi" />
          <Input label="Importo (€)" name="amount" type="number" step="0.01" required />
          <Input label="Data" name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} />
          <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-semibold hover:bg-emerald-700 transition-colors">
            Salva Entrata
          </button>
        </form>
      </Modal>

      <Modal show={showExpenseForm} onClose={() => setShowExpenseForm(false)} title="Registra Uscita">
        <form onSubmit={handleAddExpense} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Categoria</label>
            <select name="category" className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all">
              <option value="salary">Stipendio Dipendente</option>
              <option value="other">Altra Uscita</option>
            </select>
          </div>
          <Input label="Descrizione" name="description" required placeholder="es. Stipendio Febbraio" />
          <Input label="Importo (€)" name="amount" type="number" step="0.01" required />
          <Input label="Data" name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} />
          <button type="submit" className="w-full bg-rose-600 text-white py-3 rounded-xl font-semibold hover:bg-rose-700 transition-colors">
            Salva Uscita
          </button>
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
    </div>
  );
}

// --- Subcomponents ---

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-2 md:px-4 py-2 md:py-3 rounded-xl transition-all duration-200 group flex-1 md:flex-none",
        active 
          ? "bg-emerald-50 text-emerald-700 font-bold shadow-sm" 
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      )}
    >
      <span className={cn("transition-transform group-hover:scale-110", active ? "text-emerald-600" : "text-slate-400")}>
        {icon}
      </span>
      <span className="text-[10px] md:text-sm font-medium">{label}</span>
    </button>
  );
}

function StatCard({ title, value, icon, trend, highlight }: { title: string, value: string, icon: React.ReactNode, trend?: 'positive' | 'negative', highlight?: boolean }) {
  return (
    <div className={cn(
      "glass-card p-6 flex flex-col justify-between h-32 transition-transform hover:scale-[1.02]",
      highlight && "bg-slate-900 border-slate-800"
    )}>
      <div className="flex justify-between items-start">
        <span className={cn("text-sm font-medium", highlight ? "text-slate-400" : "text-slate-500")}>{title}</span>
        <div className={cn("p-2 rounded-lg", highlight ? "bg-slate-800" : "bg-slate-50")}>
          {icon}
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn("text-2xl font-bold tracking-tight", highlight ? "text-white" : "text-slate-900")}>{value}</span>
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
    <div className="glass-card p-6 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-lg text-slate-800">{material.name}</h4>
            {material.archive_id && (
              <span className="bg-emerald-50 text-emerald-600 text-[9px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider border border-emerald-100">Archivio</span>
            )}
          </div>
          <div className="flex flex-col gap-1 mt-1">
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Wallet size={12} />
              Costo unitario: {formatCurrency(material.unit_cost)}
            </p>
            {material.location && (
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <MapPin size={12} className="text-emerald-500" />
                {material.location}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onEdit} className="text-slate-300 hover:text-emerald-600 transition-colors">
            <Pencil size={18} />
          </button>
          <button onClick={onDelete} className="text-slate-300 hover:text-rose-500 transition-colors">
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Rimanente</span>
          <span className={cn("font-bold", remaining < 3 ? "text-rose-600" : "text-emerald-600")}>
            {remaining.toFixed(2)} {material.unit} ({percentage}%)
          </span>
        </div>
        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            className={cn(
              "h-full rounded-full transition-colors",
              remaining < 3 ? "bg-rose-500" : "bg-emerald-500"
            )}
          />
        </div>
      </div>

      <div className="pt-4 flex gap-2">
        <input 
          type="number" 
          value={usage}
          onChange={(e) => setUsage(e.target.value)}
          placeholder={`Utilizzo (${material.unit})`}
          className="flex-1 px-3 py-2 text-base rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
        />
        <button 
          onClick={() => {
            if (usage && Number(usage) > 0) {
              onAddUsage(Number(usage));
              setUsage('');
            }
          }}
          className="bg-slate-900 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
        >
          Registra
        </button>
      </div>
    </div>
  );
}

function Modal({ show, onClose, title, children }: { show: boolean, onClose: () => void, title: string, children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <Plus size={24} className="rotate-45" />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </motion.div>
    </div>
  );
}

function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <input 
        {...props}
        className="w-full px-4 py-2 text-base rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
      />
    </div>
  );
}
