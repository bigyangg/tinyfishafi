import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function Auth() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(searchParams.get('mode') === 'signup' ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setMode(searchParams.get('mode') === 'signup' ? 'signup' : 'login');
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Email and password are required.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await signup(email, password);
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err?.message || err?.response?.data?.detail || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col" data-testid="auth-page">
      {/* Minimal nav */}
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="font-mono font-bold text-lg text-white tracking-wider" data-testid="auth-nav-logo">AFI</Link>
        <Link to="/pricing" className="text-xs text-zinc-500 hover:text-white transition-colors duration-75">Pricing</Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm" data-testid="auth-form-container">
          {/* Header */}
          <div className="mb-8">
            <h1 className="font-sans font-bold text-2xl text-white mb-2" data-testid="auth-title">
              {mode === 'login' ? 'Sign in to AFI' : 'Create your account'}
            </h1>
            <p className="text-zinc-500 text-sm">
              {mode === 'login'
                ? 'Welcome back. Your alert feed is ready.'
                : 'Start monitoring SEC filings in minutes.'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" data-testid="auth-form">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-black border border-zinc-800 focus:border-[#0066FF] focus:outline-none text-white text-sm px-3 py-2.5 placeholder-zinc-700 transition-colors duration-75"
                data-testid="email-input"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
                  className="w-full bg-black border border-zinc-800 focus:border-[#0066FF] focus:outline-none text-white text-sm px-3 py-2.5 pr-10 placeholder-zinc-700 transition-colors duration-75"
                  data-testid="password-input"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors duration-75"
                  data-testid="toggle-password"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-[#FF3333]/10 border border-[#FF3333]/20 px-3 py-2.5" data-testid="auth-error">
                <AlertCircle size={14} className="text-[#FF3333] mt-0.5 shrink-0" />
                <span className="text-[#FF3333] text-xs">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0066FF] hover:bg-[#0052CC] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 transition-colors duration-75"
              data-testid="auth-submit"
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {/* Toggle */}
          <div className="mt-6 pt-6 border-t border-zinc-800 text-center" data-testid="auth-toggle">
            <span className="text-zinc-500 text-sm">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            </span>
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
              className="text-[#0066FF] hover:text-white text-sm transition-colors duration-75"
              data-testid="auth-switch-mode"
            >
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </div>

          <p className="mt-6 text-center text-[10px] text-zinc-700 leading-relaxed">
            AFI provides informational signals only. Not investment advice.<br />By continuing, you agree to our Terms and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
