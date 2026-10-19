import React, { useState, useEffect, useRef } from 'react';
import { tenantsApi, type Tenant } from '../../api';
import { Building2, ChevronDown, Plus, Check, ShieldCheck, X, AlertCircle, Sparkles } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

export const TenantSwitcher: React.FC = () => {
  const { user, tenantId, setTenantId } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [newTenant, setNewTenant] = useState({
    tenant_id: '',
    name: '',
    plan: 'ENTERPRISE',
    max_employees: 500,
  });

  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const currentTenantId = tenantId || user?.tenant_id || 'default';

  const generateSlug = (text: string) =>
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

  const loadTenants = async () => {
    try {
      const data = await tenantsApi.list();
      setTenants(data);
    } catch {
      setTenants([
        { tenant_id: 'default', name: 'Global / Default Organization', plan: 'ENTERPRISE', max_employees: 1000, is_active: true, total_employees: 5 },
        { tenant_id: 'acme-corp', name: 'Acme Corporation', plan: 'PRO', max_employees: 250, is_active: true, total_employees: 2 },
      ]);
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      loadTenants();
    }
  }, [user]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleSelectTenant = (tid: string) => {
    setTenantId(tid);
    setIsOpen(false);
    window.location.reload();
  };

  const handleNameChange = (val: string) => {
    const slug = generateSlug(val);
    setNewTenant((prev) => ({
      ...prev,
      name: val,
      tenant_id: prev.tenant_id === '' || prev.tenant_id === generateSlug(prev.name) ? slug : prev.tenant_id,
    }));
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const targetSlug = (newTenant.tenant_id || generateSlug(newTenant.name)).toLowerCase().trim();
    if (!targetSlug || targetSlug.length < 2) {
      setErrorMsg('Please provide a valid Tenant ID / Slug (minimum 2 alphanumeric characters).');
      return;
    }

    try {
      setCreating(true);
      const payload = {
        ...newTenant,
        tenant_id: targetSlug,
      };
      await tenantsApi.create(payload);
      setShowCreateModal(false);
      setNewTenant({ tenant_id: '', name: '', plan: 'ENTERPRISE', max_employees: 500 });
      await loadTenants();
      handleSelectTenant(targetSlug);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Failed to provision tenant.');
    } finally {
      setCreating(false);
    }
  };

  const currentTenantObj = tenants.find((t) => t.tenant_id === currentTenantId);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-indigo-200/90 bg-indigo-50/80 hover:bg-indigo-100/70 text-indigo-900 text-xs font-semibold shadow-2xs transition active:scale-95"
      >
        <Building2 className="w-3.5 h-3.5 text-indigo-600" />
        <span className="truncate max-w-[140px]">{currentTenantObj?.name || `Org: ${currentTenantId}`}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-indigo-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-72 rounded-2xl bg-white shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in duration-150">
          <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Tenant Partition
            </span>
            <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">
              Multi-Tenancy
            </span>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-slate-50 p-1">
            {tenants.map((t) => {
              const active = t.tenant_id === currentTenantId;
              return (
                <button
                  key={t.tenant_id}
                  onClick={() => handleSelectTenant(t.tenant_id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs flex items-center justify-between transition ${
                    active ? 'bg-indigo-50 text-indigo-900 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-900">{t.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ID: {t.tenant_id} · {t.total_employees} users
                    </span>
                  </div>
                  {active && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                </button>
              );
            })}
          </div>

          {user?.role === 'ADMIN' && (
            <div className="p-2 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setErrorMsg(null);
                  setShowCreateModal(true);
                }}
                className="w-full py-2 px-3 rounded-xl border border-dashed border-indigo-300 hover:border-indigo-500 bg-white hover:bg-indigo-50/50 text-indigo-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Provision New Tenant
              </button>
            </div>
          )}
        </div>
      )}

      {/* Provision Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md my-auto overflow-hidden animate-in fade-in duration-200">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-600">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Provision Organization Tenant</h3>
                  <p className="text-[11px] text-slate-500">Logical multi-tenant schema partition</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error callout */}
            {errorMsg && (
              <div className="m-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateTenant} className="p-4 sm:p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Company / Organization Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Corporation"
                  value={newTenant.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Tenant ID (Slug) <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-indigo-600 font-medium flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Auto-derived
                  </span>
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. acme-corporation"
                  pattern="^[a-z0-9-]+$"
                  value={newTenant.tenant_id}
                  onChange={(e) => setNewTenant({ ...newTenant, tenant_id: e.target.value.toLowerCase() })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-mono shadow-2xs bg-slate-50/50"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Lowercase alphanumeric slug used for isolated database indexing.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Plan Tier</label>
                  <select
                    value={newTenant.plan}
                    onChange={(e) => setNewTenant({ ...newTenant, plan: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-2xs"
                  >
                    <option value="STARTER">Starter</option>
                    <option value="PRO">Professional</option>
                    <option value="ENTERPRISE">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Employee Quota</label>
                  <input
                    type="number"
                    min="1"
                    value={newTenant.max_employees}
                    onChange={(e) => setNewTenant({ ...newTenant, max_employees: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-200 text-xs font-semibold text-slate-600 rounded-xl hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 transition flex items-center gap-1.5"
                >
                  {creating ? 'Provisioning...' : 'Provision Partition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
