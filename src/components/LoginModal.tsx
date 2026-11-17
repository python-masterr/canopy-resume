import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

interface LoginModalProps {
  open: boolean;
  initialMode?: 'signup' | 'signin';
  onClose: () => void;
}

export function LoginModal({ open, initialMode = 'signup', onClose }: LoginModalProps) {
  const { signInWithGoogle, signingIn, authError, clearAuthMessages } = useAuth();

  const onCloseRef = useRef(onClose);
  const wasOpenRef = useRef(false);

  onCloseRef.current = onClose;

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      clearAuthMessages();
    }
    wasOpenRef.current = open;
  }, [open, clearAuthMessages]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearAuthMessages();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, clearAuthMessages]);

  if (!open) return null;

  const handleClose = () => {
    clearAuthMessages();
    onClose();
  };

  const handleGoogleSignIn = async () => {
    const ok = await signInWithGoogle();
    if (ok) {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="canopy-login-title"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-5 py-10 overflow-y-auto text-white"
      style={{
        background: 'radial-gradient(ellipse at 50% 0, #1d3a2a 0, #0e1a13 55%, #0a110d 100%)',
      }}
    >
      <button
        type="button"
        onClick={handleClose}
        className="absolute top-5 left-5 inline-flex items-center gap-2 text-sm text-[#cfe0d5] hover:text-white transition-colors px-3 py-2 rounded-lg cursor-pointer"
      >
        <X className="w-4 h-4" />
        <span>Back to Canopy</span>
      </button>

      <div
        className="w-full max-w-sm rounded-3xl p-8 flex flex-col items-center shadow-2xl border border-white/10"
        style={{
          background: 'linear-gradient(to right, rgba(255,255,255,0.08), rgba(14,26,19,0.94))',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center mb-5">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14z" />
            <path d="M5 19 14 10" />
          </svg>
        </div>

        <h2 id="canopy-login-title" className="text-2xl font-semibold tracking-tight text-center mb-1.5">
          {initialMode === 'signup' ? 'Welcome to Canopy' : 'Sign in to Canopy'}
        </h2>
        <p className="text-sm text-[#b9c9bf] text-center mb-6">
          Continue with your Google account to screen resumes and save candidate pools.
        </p>

        {authError && (
          <div
            role="alert"
            className="w-full rounded-xl bg-[#b9482a]/20 border border-[#ee8a68]/40 px-3.5 py-2.5 text-xs text-[#ffb8a4] mb-4"
          >
            {authError}
          </div>
        )}

        <button
          type="button"
          disabled={signingIn}
          onClick={() => void handleGoogleSignIn()}
          className="w-full flex items-center justify-center gap-3 rounded-xl px-5 py-3.5 text-sm font-semibold text-[#12261b] bg-white hover:bg-[#f4f7f5] disabled:opacity-60 transition-colors cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"
            />
            <path
              fill="#FBBC05"
              d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.3 0 11.8-2.1 15.7-5.7l-7.5-5.8c-2.1 1.4-4.8 2.3-8.2 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
            />
          </svg>
          <span>{signingIn ? 'Connecting with Google…' : 'Continue with Google'}</span>
        </button>

        <button
          type="button"
          onClick={handleClose}
          className="mt-5 text-xs text-[#aebfb5] hover:text-white underline cursor-pointer"
        >
          Continue to screener without signing in
        </button>
      </div>
    </div>
  );
}
