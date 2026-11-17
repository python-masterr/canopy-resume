import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider } from '../firebase.ts';
import { checkUserIsAdmin, syncUserProfile } from '../lib/firestoreService.ts';

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
  authReady: boolean;
  signingIn: boolean;
  authError: string | null;
  clearAuthMessages: () => void;
  signInWithGoogle: () => Promise<boolean>;
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
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return err instanceof Error ? err.message : 'Google sign-in failed. Please try again.';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

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
        clearAuthMessages,
        signInWithGoogle,
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
