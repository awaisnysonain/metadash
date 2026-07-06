import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, Lock, User, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--color-ground)' }}>
      {/* Left panel — editorial branding */}
      <div
        className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-16"
        style={{ background: 'var(--color-ink)', color: 'var(--color-ground)' }}
      >
        {/* Ambient teal wash — restrained, one accent used once. */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full"
            style={{ background: 'radial-gradient(closest-side, rgba(15, 91, 77, 0.55), transparent 70%)' }}
          />
          <div
            className="absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full"
            style={{ background: 'radial-gradient(closest-side, rgba(15, 91, 77, 0.28), transparent 70%)' }}
          />
        </div>

        {/* Brand mark */}
        <div className="relative z-10 flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-[12px]"
            style={{ background: 'var(--color-ground)' }}
          >
            <img src="/metadash-icon.svg" alt="" className="h-7 w-7 object-contain" />
          </div>
          <div>
            <p className="font-editorial italic text-xl" style={{ letterSpacing: '-0.01em' }}>MetaDash</p>
            <p className="text-[10.5px] font-medium tracking-[0.14em] uppercase" style={{ color: 'rgba(246, 245, 240, 0.55)' }}>
              Comment operations
            </p>
          </div>
        </div>

        {/* Editorial thesis */}
        <div className="relative z-10 max-w-lg">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'rgba(246, 245, 240, 0.5)' }}>
            An inbox that reads like a desk
          </p>
          <h1
            className="font-editorial mt-4"
            style={{ fontSize: 48, lineHeight: 1.05, letterSpacing: '-0.02em', textWrap: 'balance' }}
          >
            Every comment on every ad,{' '}
            <em style={{ color: '#7FB29F' }}>triaged</em>{' '}
            in one place.
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed" style={{ color: 'rgba(246, 245, 240, 0.72)' }}>
            Facebook and Instagram, paid and organic. Assigned, replied to, or hidden — with the source, spend, and history in view.
          </p>
        </div>

        {/* Footer meta */}
        <div className="relative z-10 grid grid-cols-3 gap-8">
          {[
            { k: 'Under', v: '15 min', label: 'Median first response' },
            { k: 'Across', v: '24 accounts', label: 'FB &amp; IG business' },
            { k: 'Kept for', v: '3 days', label: 'Live retention window' },
          ].map(item => (
            <div key={item.label}>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'rgba(246, 245, 240, 0.5)' }}>
                {item.k}
              </p>
              <p className="font-editorial mt-1 tabular" style={{ fontSize: 22, lineHeight: 1.1, color: '#EFEDE7' }}>
                {item.v}
              </p>
              <p
                className="mt-1 text-[11px]"
                style={{ color: 'rgba(246, 245, 240, 0.55)' }}
                dangerouslySetInnerHTML={{ __html: item.label }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — sign in */}
      <div
        className="flex-1 flex items-center justify-center p-8"
        style={{ background: 'var(--color-ground)' }}
      >
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-[12px]"
              style={{ background: 'var(--color-ink)' }}
            >
              <img src="/metadash-icon.svg" alt="" className="h-7 w-7 object-contain" />
            </div>
            <div>
              <p className="font-editorial italic text-lg" style={{ color: 'var(--color-ink)' }}>MetaDash</p>
              <p className="text-[10.5px] font-medium tracking-[0.14em] uppercase" style={{ color: 'var(--color-muted)' }}>
                Comment operations
              </p>
            </div>
          </div>

          <div
            className="rounded-2xl p-8"
            style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)', boxShadow: '0 20px 40px -30px rgba(15,18,24,0.15)' }}
          >
            <div className="mb-7">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--color-muted)' }}>
                Sign in
              </p>
              <h2 className="font-editorial mt-1" style={{ fontSize: 26, lineHeight: 1.15, letterSpacing: '-0.015em', color: 'var(--color-ink)' }}>
                Welcome back.
              </h2>
              <p className="mt-1 text-[13px]" style={{ color: 'var(--color-muted)' }}>
                Use your team account to continue.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.12em] block mb-1.5" style={{ color: 'var(--color-muted)' }}>
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-muted-2)' }} />
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="your.username"
                    required
                    autoComplete="username"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-[13.5px] focus:outline-none transition-all"
                    style={{
                      background: 'var(--color-ground-2)',
                      border: '1px solid var(--color-line)',
                      color: 'var(--color-ink)',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(15,91,77,0.12)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-line)'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.12em] block mb-1.5" style={{ color: 'var(--color-muted)' }}>
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-muted-2)' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl text-[13.5px] focus:outline-none transition-all"
                    style={{
                      background: 'var(--color-ground-2)',
                      border: '1px solid var(--color-line)',
                      color: 'var(--color-ink)',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(15,91,77,0.12)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-line)'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: 'var(--color-muted-2)' }}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--color-ink)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--color-muted-2)'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  className="p-3 rounded-xl text-[13px]"
                  style={{ background: 'var(--color-sem-red-soft)', border: '1px solid rgba(181,69,69,0.2)', color: 'var(--color-sem-red)' }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-xl text-[13.5px] font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: 'var(--color-accent)', color: '#FFFFFF' }}
                onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--color-accent-ink)'; }}
                onMouseLeave={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--color-accent)'; }}
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>

          <p className="text-center text-[11px] mt-5" style={{ color: 'var(--color-muted-2)' }}>
            Authorized team members only. Contact your admin for access.
          </p>
        </div>
      </div>
    </div>
  );
}
