import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, MailCheck, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

interface LoginModalProps {
  open: boolean;
  initialMode?: 'signup' | 'signin';
  onClose: () => void;
}

export function LoginModal({ open, initialMode = 'signup', onClose }: LoginModalProps) {
  const {
    user,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendResetEmail,
    resendVerification,
    refreshUser,
    logout,
    signingIn,
    authError,
    authNotice,
    clearAuthMessages,
  } = useAuth();

  const [isSignUp, setIsSignUp] = useState(initialMode === 'signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const onCloseRef = useRef(onClose);
  const wasOpenRef = useRef(false);

  onCloseRef.current = onClose;

  // Sync mode only when transitioning from closed -> open
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setIsSignUp(initialMode === 'signup');
      setLocalError(null);
      clearAuthMessages();
    }
    wasOpenRef.current = open;
  }, [open, initialMode, clearAuthMessages]);

  // Manage body scroll lock and Escape key cleanly without stealing focus on re-renders
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearAuthMessages();
        setLocalError(null);
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, clearAuthMessages]);

  // Focus initial field only when modal opens or user switches Sign Up / Sign In mode
  useEffect(() => {
    if (!open || (user && !user.emailVerified)) return;
    const timer = setTimeout(() => {
      if (isSignUp) nameRef.current?.focus();
      else emailRef.current?.focus();
    }, 30);
    return () => clearTimeout(timer);
  }, [open, isSignUp, user]);

  if (!open) return null;

  const handleClose = () => {
    clearAuthMessages();
    setLocalError(null);
    onClose();
  };

  const handleSwitchMode = () => {
    clearAuthMessages();
    setLocalError(null);
    setIsSignUp((prev) => !prev);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthMessages();
    setLocalError(null);

    const cleanEmail = email.trim();
    const cleanName = name.trim();

    if (!cleanEmail || !password || (isSignUp && !cleanName)) {
      setLocalError(
        isSignUp
          ? 'Please enter your full name, email, and password.'
          : 'Please enter both your email and password.',
      );
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setLocalError('Please enter a valid email address.');
      return;
    }

    if (isSignUp && password.length < 8) {
      setLocalError('Use at least 8 characters for your password.');
      return;
    }

    const ok = isSignUp
      ? await signUpWithEmail(cleanName, cleanEmail, password)
      : await signInWithEmail(cleanEmail, password);

    if (ok) {
      setPassword('');
      // If sign-in (or already verified), close modal right away;
      // if unverified sign-up, keep modal open to show the verification step.
      if (!isSignUp) {
        onClose();
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setLocalError(null);
    const ok = await signInWithGoogle();
    if (ok) {
      onClose();
    }
  };

  const handleForgotPassword = async () => {
    setLocalError(null);
    await sendResetEmail(email);
  };

  const displayedError = localError || authError;
  const pendingVerification = Boolean(user && !user.emailVerified);

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
          {pendingVerification ? (
            <MailCheck className="w-6 h-6 text-[#e6b448]" />
          ) : (
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
          )}
        </div>

        {pendingVerification && user ? (
          <div className="w-full text-center space-y-4">
            <h2 id="canopy-login-title" className="text-2xl font-semibold tracking-tight">
              Verify your email
            </h2>
            <p className="text-sm text-[#b9c9bf]">
              We sent a verification link to{' '}
              <strong className="text-white font-medium">{user.email}</strong>. Click the link in
              your inbox to unlock saving screenings to Cloud Firestore.
            </p>

            {displayedError && (
              <div
                role="alert"
                className="w-full rounded-xl bg-[#b9482a]/20 border border-[#ee8a68]/40 px-3.5 py-2.5 text-xs text-[#ffb8a4] text-left"
              >
                {displayedError}
              </div>
            )}

            {authNotice && (
              <div
                role="status"
                className="w-full rounded-xl bg-[#2c7a4b]/30 border border-[#5fc388]/40 px-3.5 py-2.5 text-xs text-[#d6f5e1] text-left"
              >
                {authNotice}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                void refreshUser().then((verified) => {
                  if (verified) onClose();
                });
              }}
              className="w-full rounded-xl px-5 py-3 text-sm font-semibold text-[#12261b] bg-[#e6b448] hover:brightness-105 cursor-pointer"
            >
              I&apos;ve verified — continue
            </button>

            <button
              type="button"
              onClick={() => void resendVerification()}
              className="w-full rounded-xl px-5 py-2.5 text-xs font-semibold text-white border border-white/20 hover:bg-white/10 cursor-pointer"
            >
              Resend verification email
            </button>

            <div className="flex items-center justify-between pt-2 text-xs text-[#aebfb5]">
              <button type="button" onClick={handleClose} className="underline hover:text-white cursor-pointer">
                Continue to screener
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="underline hover:text-white cursor-pointer"
              >
                Use another account
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2
              id="canopy-login-title"
              className="text-2xl font-semibold tracking-tight text-center mb-1"
            >
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-sm text-[#b9c9bf] text-center mb-5">
              {isSignUp
                ? 'Start screening and saving candidate pools in a minute.'
                : 'Sign in to keep your screenings in one place.'}
            </p>

            <button
              type="button"
              disabled={signingIn}
              onClick={() => void handleGoogleSignIn()}
              className="w-full flex items-center justify-center gap-3 rounded-xl px-5 py-3 text-sm font-semibold text-white border border-white/15 bg-[#232526] hover:bg-[#2d2e30] disabled:opacity-60 transition-colors cursor-pointer"
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
              <span>Continue with Google</span>
            </button>

            <div className="w-full flex items-center gap-3 my-4 text-xs text-[#aebfb5]">
              <span className="flex-1 h-px bg-white/15" />
              <span>or with email</span>
              <span className="flex-1 h-px bg-white/15" />
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} noValidate className="w-full space-y-3">
              {isSignUp && (
                <div>
                  <label htmlFor="canopy-login-name" className="sr-only">
                    Full name
                  </label>
                  <input
                    ref={nameRef}
                    id="canopy-login-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    autoComplete="name"
                    className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-[#c3d0c8] border border-white/10 focus:border-[#9bd8b2] focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label htmlFor="canopy-login-email" className="sr-only">
                  Email
                </label>
                <input
                  ref={emailRef}
                  id="canopy-login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                  className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-[#c3d0c8] border border-white/10 focus:border-[#9bd8b2] focus:outline-none"
                />
              </div>

              <div className="relative">
                <label htmlFor="canopy-login-password" className="sr-only">
                  Password
                </label>
                <input
                  id="canopy-login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSignUp ? 'Password (8+ characters)' : 'Password'}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  className="w-full rounded-xl bg-white/10 pl-4 pr-11 py-3 text-sm text-white placeholder:text-[#c3d0c8] border border-white/10 focus:border-[#9bd8b2] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#c3d0c8] hover:text-white cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {!isSignUp && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={signingIn}
                    onClick={() => void handleForgotPassword()}
                    className="text-xs text-[#b9c9bf] hover:text-white underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {displayedError && (
                <div
                  role="alert"
                  className="w-full rounded-xl bg-[#b9482a]/20 border border-[#ee8a68]/40 px-3.5 py-2.5 text-xs text-[#ffb8a4]"
                >
                  {displayedError}
                </div>
              )}

              {authNotice && (
                <div
                  role="status"
                  className="w-full rounded-xl bg-[#2c7a4b]/30 border border-[#5fc388]/40 px-3.5 py-2.5 text-xs text-[#d6f5e1]"
                >
                  {authNotice}
                </div>
              )}

              <button
                type="submit"
                disabled={signingIn}
                className="w-full rounded-xl px-5 py-3 text-sm font-semibold text-[#12261b] bg-[#e6b448] hover:brightness-105 disabled:opacity-60 transition-all cursor-pointer"
              >
                {signingIn
                  ? isSignUp
                    ? 'Creating account…'
                    : 'Signing in…'
                  : isSignUp
                    ? 'Create account'
                    : 'Sign in'}
              </button>
            </form>

            <div className="mt-5 text-xs text-[#aebfb5] text-center">
              {isSignUp ? 'Already have an account?' : 'Don’t have an account?'}{' '}
              <button
                type="button"
                onClick={handleSwitchMode}
                className="text-white underline font-medium cursor-pointer"
              >
                {isSignUp ? 'Sign in' : 'Sign up, it’s free'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
