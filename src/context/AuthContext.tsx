import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase.ts';
import { checkUserIsAdmin, syncUserProfile } from '../lib/firestoreService.ts';

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
  authReady: boolean;
  signingIn: boolean;
  authError: string | null;
  authNotice: string | null;
  clearAuthMessages: () => void;
  signInWithGoogle: () => Promise<boolean>;
  signInWithEmail: (email: string, password: string) => Promise<boolean>;
  signUpWithEmail: (name: string, email: string, password: string) => Promise<boolean>;
  sendResetEmail: (email: string) => Promise<boolean>;
  resendVerification: () => Promise<boolean>;
  refreshUser: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string }).code || '';
  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Sign-in popup was closed before completing.';
    case 'auth/popup-blocked':
      return 'Browser blocked the sign-in popup. Allow popups and try again.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 8 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'Email/Password sign-up is not enabled in Firebase Console yet (Authentication → Sign-in method → Enable Email/Password), or use Continue with Google below.';
    default:
      return err instanceof Error ? err.message : 'Authentication failed. Please try again.';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [, setAuthRevision] = useState(0);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsAdmin(checkUserIsAdmin(nextUser));
      setAuthReady(true);
      if (nextUser?.emailVerified) {
        void syncUserProfile(nextUser).catch((err) => {
          console.error('Failed to sync profile:', err);
        });
      }
    });
    return () => unsubscribe();
  }, []);

  const clearAuthMessages = useCallback(() => {
    setAuthError(null);
    setAuthNotice(null);
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<boolean> => {
    clearAuthMessages();
    setSigningIn(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      setIsAdmin(checkUserIsAdmin(result.user));
      if (result.user.emailVerified) {
        void syncUserProfile(result.user).catch((err) => {
          console.error('Background profile sync failed:', err);
        });
      }
      return true;
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
      return false;
    } finally {
      setSigningIn(false);
    }
  }, [clearAuthMessages]);

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      clearAuthMessages();
      setSigningIn(true);
      try {
        const result = await signInWithEmailAndPassword(auth, email.trim(), password);
        setIsAdmin(checkUserIsAdmin(result.user));
        if (result.user.emailVerified) {
          void syncUserProfile(result.user).catch((err) => {
            console.error('Background profile sync failed:', err);
          });
        }
        return true;
      } catch (err) {
        setAuthError(mapFirebaseAuthError(err));
        return false;
      } finally {
        setSigningIn(false);
      }
    },
    [clearAuthMessages],
  );

  const signUpWithEmail = useCallback(
    async (name: string, email: string, password: string): Promise<boolean> => {
      clearAuthMessages();
      setSigningIn(true);
      try {
        const cleanEmail = email.trim();
        const result = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const cleanName = name.trim().slice(0, 120);

        await Promise.all([
          cleanName ? updateProfile(result.user, { displayName: cleanName }) : Promise.resolve(),
          sendEmailVerification(result.user),
        ]);

        setUser(auth.currentUser);
        setIsAdmin(checkUserIsAdmin(auth.currentUser));
        setAuthRevision((r) => r + 1);
        setAuthNotice(
          `Verification link sent to ${cleanEmail}. Verify your email to save screenings to Cloud Firestore.`,
        );
        return true;
      } catch (err) {
        setAuthError(mapFirebaseAuthError(err));
        return false;
      } finally {
        setSigningIn(false);
      }
    },
    [clearAuthMessages],
  );

  const sendResetEmail = useCallback(
    async (email: string): Promise<boolean> => {
      clearAuthMessages();
      const trimmed = email.trim();
      if (!trimmed) {
        setAuthError('Enter your email address above first so we can send a reset link.');
        return false;
      }
      setSigningIn(true);
      try {
        await sendPasswordResetEmail(auth, trimmed);
        setAuthNotice(`Password reset email sent to ${trimmed}.`);
        return true;
      } catch (err) {
        setAuthError(mapFirebaseAuthError(err));
        return false;
      } finally {
        setSigningIn(false);
      }
    },
    [clearAuthMessages],
  );

  const resendVerification = useCallback(async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    clearAuthMessages();
    try {
      await sendEmailVerification(auth.currentUser);
      setAuthNotice('Verification email sent. Check your inbox and spam folder.');
      return true;
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
      return false;
    }
  }, [clearAuthMessages]);

  const refreshUser = useCallback(async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    clearAuthMessages();
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    setUser(auth.currentUser);
    setIsAdmin(checkUserIsAdmin(auth.currentUser));
    setAuthRevision((r) => r + 1);
    if (auth.currentUser.emailVerified) {
      void syncUserProfile(auth.currentUser).catch((err) => {
        console.error('Background profile sync failed:', err);
      });
      return true;
    }
    setAuthError('Email is not verified yet. Please click the link in your inbox first.');
    return false;
  }, [clearAuthMessages]);

  const logout = useCallback(async (): Promise<void> => {
    clearAuthMessages();
    setIsAdmin(false);
    await signOut(auth);
  }, [clearAuthMessages]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin,
        authReady,
        signingIn,
        authError,
        authNotice,
        clearAuthMessages,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendResetEmail,
        resendVerification,
        refreshUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
