import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { Lock, User, ShieldCheck, AlertCircle } from "lucide-react";

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(username, password);
      if (user.role === "ADMIN") {
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/dashboard/employee", { replace: true });
      }
    } catch (err: any) {
      setError(err.message || "Invalid credentials. Please verify your username and password.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900">
            Attendance Portal
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Centralized Employee Attendance & WFH Compliance
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Username or Corporate Email
            </label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <User className="h-4 w-4" />
              </span>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin or alice.chen@company.com"
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm text-slate-900 transition focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Password
            </label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Lock className="h-4 w-4" />
              </span>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm text-slate-900 transition focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 focus:outline-none disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Sign In to Dashboard"}
          </button>
        </form>

        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Quick Test Autofill
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin("admin", "AdminPass123!")}
              className="flex-1 rounded-md border border-slate-200 bg-white py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
            >
              Admin Demo
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin("emp001", "EmpPass123!")}
              className="flex-1 rounded-md border border-slate-200 bg-white py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
            >
              Employee Demo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
