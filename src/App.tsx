import { useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkCheck, Moon, Sun, Upload, X } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import {
  DEFAULT_ROLES,
  SAMPLE_RESUMES,
  parsePastedResumes,
  type ResumeInput,
  type ScreeningPoolResponse,
} from './shared/screener.ts';
import {
  saveScreeningToFirestore,
  subscribeCustomRoles,
  subscribeUserScreenings,
  type SavedCustomRoleRecord,
  type SavedScreeningRecord,
} from './lib/firestoreService.ts';
import { AdminPage } from './components/AdminPage.tsx';
import { CandidateCard } from './components/CandidateCard.tsx';
import { CustomRolesPanel } from './components/CustomRolesPanel.tsx';
import { LoginModal } from './components/LoginModal.tsx';
import { SavedScreeningsPanel } from './components/SavedScreeningsPanel.tsx';
import { ScoreHistogram, type ScoreBin } from './components/ScoreHistogram.tsx';

interface UploadedFileEntry {
  id: string;
  name: string;
  fileName: string;
  status: string;
  text: string;
  error?: boolean;
}

const MORPH_WORDS = ['Engineers', 'Designers', 'Analysts', 'Marketers', 'Founders'];

const LEAVES = Array.from({ length: 9 }, (_, i) => ({
  id: i,
  left: `${(i * 11 + 4) % 95}%`,
  duration: `${9 + (i % 5) * 2}s`,
  delay: `-${(i * 2.3) % 14}s`,
  scale: 0.6 + (i % 4) * 0.2,
}));

function CanopyWorkspace() {
  const {
    user,
    isAdmin,
    authReady,
    logout,
    resendVerification,
    refreshUser,
    authNotice,
    authError,
  } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<'signup' | 'signin'>('signup');
  const [hasDismissedGate, setHasDismissedGate] = useState(false);
  const [activePage, setActivePage] = useState<'workspace' | 'admin'>(() =>
    typeof window !== 'undefined' && window.location.hash === '#admin' ? 'admin' : 'workspace',
  );

  // Open Sign Up page automatically on initial website load when signed out
  useEffect(() => {
    if (!authReady) return;
    if (!user && !hasDismissedGate && activePage !== 'admin') {
      setLoginMode('signup');
      setLoginOpen(true);
    }
    if (user && user.emailVerified) {
      setLoginOpen(false);
    }
  }, [authReady, user, hasDismissedGate, activePage]);

  useEffect(() => {
    const onHashChange = () => {
      setActivePage(window.location.hash === '#admin' ? 'admin' : 'workspace');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const openAuthModal = (mode: 'signup' | 'signin') => {
    setLoginMode(mode);
    setLoginOpen(true);
  };

  const closeAuthModal = () => {
    setHasDismissedGate(true);
    setLoginOpen(false);
  };

  const navigateToAdmin = () => {
    window.location.hash = 'admin';
    setActivePage('admin');
  };

  const navigateToWorkspace = () => {
    if (window.location.hash === '#admin') {
      window.location.hash = 'try';
    }
    setActivePage('workspace');
  };

  // Theme state
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem('canopy-theme');
    if (stored === 'dark' || stored === 'light') return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    localStorage.setItem('canopy-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Morphing hero word
  const [wordIndex, setWordIndex] = useState(0);
  const [wordFading, setWordFading] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const interval = setInterval(() => {
      setWordFading(true);
      setTimeout(() => {
        setWordIndex((prev) => (prev + 1) % MORPH_WORDS.length);
        setWordFading(false);
      }, 320);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  // Screener input state
  const [pastedText, setPastedText] = useState('');
  const [files, setFiles] = useState<UploadedFileEntry[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [targetRole, setTargetRole] = useState('All Roles');
  const [analyzing, setAnalyzing] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [poolResult, setPoolResult] = useState<ScreeningPoolResponse | null>(null);
  const [selectedScoreBin, setSelectedScoreBin] = useState<ScoreBin | null>(null);

  // Save screening state
  const [batchTitle, setBatchTitle] = useState('');
  const [savingBatch, setSavingBatch] = useState(false);
  const [savedBatchId, setSavedBatchId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Firestore subscriptions
  const [savedScreenings, setSavedScreenings] = useState<SavedScreeningRecord[]>([]);
  const [loadingScreenings, setLoadingScreenings] = useState(false);
  const [selectedScreeningId, setSelectedScreeningId] = useState<string | null>(null);
  const [customRoles, setCustomRoles] = useState<SavedCustomRoleRecord[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user) {
      setSavedScreenings([]);
      setCustomRoles([]);
      setSelectedScreeningId(null);
      return;
    }

    setLoadingScreenings(true);
    const unsubScreenings = subscribeUserScreenings(
      user.uid,
      (rows) => {
        setSavedScreenings(rows);
        setLoadingScreenings(false);
        setSelectedScreeningId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? null));
      },
      (err) => {
        console.error(err);
        setLoadingScreenings(false);
      },
    );

    const unsubRoles = subscribeCustomRoles(
      user.uid,
      (roles) => setCustomRoles(roles),
      (err) => console.error(err),
    );

    return () => {
      unsubScreenings();
      unsubRoles();
    };
  }, [user]);

  const availableRoleOptions = useMemo(() => {
    const names = new Set<string>(['All Roles']);
    customRoles.forEach((r) => names.add(r.title));
    DEFAULT_ROLES.forEach((r) => names.add(r.title));
    return Array.from(names);
  }, [customRoles]);

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const picked = Array.from(fileList).slice(0, 20);

    const placeholders: UploadedFileEntry[] = picked.map((f, idx) => ({
      id: `${Date.now()}_${idx}_${f.name}`,
      name:
        f.name
          .replace(/\.[^.]+$/, '')
          .replace(/[_-]+/g, ' ')
          .trim()
          .slice(0, 60) || 'Resume',
      fileName: f.name,
      status: 'Extracting on server…',
      text: '',
    }));

    setFiles((prev) => [...prev, ...placeholders].slice(0, 20));

    const formData = new FormData();
    picked.forEach((f) => formData.append('files', f));

    try {
      const response = await fetch('/api/extract-text', {
        method: 'POST',
        body: formData,
      });
      const payload = (await response.json()) as {
        files?: Array<{
          name: string;
          fileName: string;
          text: string;
          wordCount: number;
          error?: string;
        }>;
        error?: string;
      };

      if (!response.ok || !payload.files) {
        throw new Error(payload.error || 'Server could not extract text from uploaded files.');
      }

      setFiles((prev) =>
        prev.map((entry) => {
          const placeholderIdx = placeholders.findIndex((p) => p.id === entry.id);
          if (placeholderIdx === -1) return entry;
          const extracted = payload.files?.[placeholderIdx];
          if (!extracted) return entry;
          if (extracted.error || !extracted.text) {
            return {
              ...entry,
              error: true,
              status: extracted.error || 'No text found.',
            };
          }
          return {
            ...entry,
            name: extracted.name,
            text: extracted.text,
            error: false,
            status: `Ready · ${extracted.wordCount} words`,
          };
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setFiles((prev) =>
        prev.map((entry) =>
          placeholders.some((p) => p.id === entry.id)
            ? { ...entry, error: true, status: msg }
            : entry,
        ),
      );
    }
  };

  const runScreening = async (overrideText?: string) => {
    setScreenError(null);
    setSavedBatchId(null);
    setSaveError(null);
    setSelectedScoreBin(null);

    if (files.some((f) => f.status.startsWith('Extracting'))) {
      setScreenError('Files are still being extracted on the server. Try again in a moment.');
      return;
    }

    const textToParse = overrideText !== undefined ? overrideText : pastedText;
    const resumes: ResumeInput[] = [
      ...parsePastedResumes(textToParse),
      ...files
        .filter((f) => f.text.trim().length > 0)
        .map((f) => ({
          name: f.name,
          text: f.text,
          sourceFileName: f.fileName,
        })),
    ];

    if (resumes.length === 0) {
      setScreenError('Add at least one resume. Upload a file or paste resume text above.');
      return;
    }

    setAnalyzing(true);
    try {
      const res = await fetch('/api/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumes,
          targetRole,
          customRoles: customRoles.map((r) => ({ title: r.title, skills: r.skills })),
        }),
      });
      const data = (await res.json()) as ScreeningPoolResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Screening failed.');
      }
      setPoolResult(data);
      setBatchTitle(
        targetRole !== 'All Roles'
          ? `${targetRole} · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
          : `Resume Batch · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
      );
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    } catch (err) {
      setScreenError(err instanceof Error ? err.message : 'Unable to analyze resumes.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveBatch = async () => {
    if (!poolResult) return;
    if (!user) {
      openAuthModal('signin');
      return;
    }
    if (!user.emailVerified) {
      setSaveError('Please verify your email address (see the banner at the top) before saving to Cloud Firestore.');
      return;
    }
    setSavingBatch(true);
    setSaveError(null);
    try {
      const newId = await saveScreeningToFirestore(user.uid, batchTitle, poolResult);
      setSavedBatchId(newId);
      setSelectedScreeningId(newId);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save screening.');
    } finally {
      setSavingBatch(false);
    }
  };

  const firstName = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Account';

  if (activePage === 'admin') {
    return (
      <>
        <AdminPage
          onBackToWorkspace={navigateToWorkspace}
          onOpenSignIn={() => openAuthModal('signin')}
        />
        <LoginModal open={loginOpen} initialMode={loginMode} onClose={closeAuthModal} />
      </>
    );
  }

  if (!authReady) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center text-white"
        style={{
          background: 'radial-gradient(ellipse at 50% 0, #1d3a2a 0, #0e1a13 55%, #0a110d 100%)',
        }}
      >
        <div className="text-2xl font-bold tracking-tight mb-2">Canopy</div>
        <p className="text-xs text-[#aebfb5]">Loading workspace…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero with 3-zone Top Bar */}
      <header className="canopy-hero relative min-h-[92svh] grid place-items-center text-center text-[var(--on)] overflow-hidden px-5 pt-28 pb-16">
        <nav
          aria-label="Main"
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between gap-8 px-4 sm:px-8 lg:px-12 py-5 max-w-[1440px] mx-auto"
        >
          <a
            href="#top"
            className="text-xl font-bold tracking-tight text-[var(--on)] whitespace-nowrap shrink-0"
          >
            Canopy
          </a>

          <div className="hidden md:flex items-center gap-7 text-sm font-medium">
            <a href="#try" className="opacity-90 hover:opacity-100 hover:underline whitespace-nowrap shrink-0">
              Screener
            </a>
            <a href="#saved" className="opacity-90 hover:opacity-100 hover:underline whitespace-nowrap shrink-0">
              Saved
            </a>
            <a href="#how" className="opacity-90 hover:opacity-100 hover:underline whitespace-nowrap shrink-0">
              How it works
            </a>
            <a href="#faq" className="opacity-90 hover:opacity-100 hover:underline whitespace-nowrap shrink-0">
              FAQ
            </a>
            {(!user || isAdmin) && (
              <a
                href="#admin"
                onClick={(e) => {
                  e.preventDefault();
                  navigateToAdmin();
                }}
                className={`opacity-90 hover:opacity-100 hover:underline whitespace-nowrap shrink-0 ${
                  isAdmin ? 'text-[var(--gold)]' : ''
                }`}
              >
                Admin
              </a>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {(!user || isAdmin) && (
              <a
                href="#admin"
                onClick={(e) => {
                  e.preventDefault();
                  navigateToAdmin();
                }}
                className="md:hidden text-xs font-medium opacity-90 hover:opacity-100 hover:underline whitespace-nowrap shrink-0"
              >
                Admin
              </a>
            )}
            {user ? (
              <button
                type="button"
                onClick={() => {
                  setHasDismissedGate(true);
                  void logout();
                }}
                className="rounded-lg border border-white/35 px-4 py-2 text-xs font-semibold text-[var(--on)] hover:bg-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign out ({firstName})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal('signin')}
                className="rounded-lg bg-[var(--on)] text-[#12261b] px-4 py-2 text-xs font-semibold hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign in
              </button>
            )}
          </div>
        </nav>

        {/* Drifting golden leaves */}
        {LEAVES.map((leaf) => (
          <span
            key={leaf.id}
            aria-hidden="true"
            className="canopy-leaf"
            style={{
              left: leaf.left,
              animationDuration: leaf.duration,
              animationDelay: leaf.delay,
              transform: `scale(${leaf.scale})`,
            }}
          />
        ))}

        <div className="relative z-10 max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-6xl lg:text-8xl font-semibold tracking-tight leading-[1.02] mb-6 text-balance">
            Screen resumes for{' '}
            <span
              className={`font-serif-editorial inline-block text-[var(--gold)] pr-1 transition-all duration-300 ${
                wordFading ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
              }`}
            >
              {MORPH_WORDS[wordIndex]}
            </span>
            <br />
            and see every skill gap.
          </h1>
          <p className="max-w-xl mx-auto text-base sm:text-lg opacity-90 mb-8">
            Upload resumes and Canopy scores each one, suggests the jobs it fits, and saves ranked candidate pools to your workspace.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="#try"
              className="rounded-xl bg-[var(--gold)] text-[#1b1405] px-6 py-3 text-sm font-semibold hover:opacity-95 transition-opacity whitespace-nowrap shrink-0"
            >
              Screen resumes
            </a>
            <a
              href="#how"
              className="rounded-xl border border-white/50 text-[var(--on)] px-6 py-3 text-sm font-semibold hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
            >
              How it works
            </a>
          </div>
        </div>
      </header>

      {/* Interactive Screener Section */}
      <main className="flex-1">
        {user && !user.emailVerified && (
          <div className="px-4 sm:px-8 lg:px-12 pt-6 max-w-[1200px] mx-auto">
            <div
              role="status"
              className="rounded-2xl border border-[var(--gold)] bg-[var(--card)] p-4 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="text-sm">
                <strong className="font-semibold text-[var(--ink)]">Verify your email address</strong>{' '}
                <span className="text-[var(--mut)]">
                  to save screening batches and custom roles to Cloud Firestore.
                </span>
                {authNotice && <div className="text-xs text-[var(--acc)] mt-1">{authNotice}</div>}
                {authError && <div className="text-xs text-[var(--bad)] mt-1">{authError}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void resendVerification()}
                  className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] hover:border-[var(--acc)] cursor-pointer"
                >
                  Resend email
                </button>
                <button
                  type="button"
                  onClick={() => void refreshUser()}
                  className="rounded-lg bg-[var(--acc)] text-[var(--on)] px-3 py-1.5 text-xs font-semibold cursor-pointer"
                >
                  I&apos;ve verified
                </button>
              </div>
            </div>
          </div>
        )}
        <section id="try" className="px-4 sm:px-8 lg:px-12 py-16 lg:py-24 max-w-[1200px] mx-auto">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-tight mb-3">
                Resume screener
              </h2>
              <p className="text-[var(--mut)] max-w-2xl">
                Upload PDF, DOCX, TXT, or MD files for server-side text extraction, or paste resumes below separated by a line containing only <code className="font-mono-tabular text-xs">---</code>.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-xs font-semibold text-[var(--ink)] hover:border-[var(--acc)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{darkMode ? 'Daylight theme' : 'Dusk theme'}</span>
            </button>
          </div>

          <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sm:p-6 mb-5">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <label htmlFor="canopy-resumes-input" className="text-sm font-semibold text-[var(--ink)]">
                Resumes <span className="font-normal text-[var(--mut)]">· upload or paste</span>
              </label>

              <div className="flex items-center gap-2">
                <label htmlFor="target-role-select" className="text-xs text-[var(--mut)]">
                  Target role:
                </label>
                <select
                  id="target-role-select"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-xs font-medium text-[var(--ink)]"
                >
                  {availableRoleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Drag and Drop Zone */}
            <div
              onDragEnter={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void handleFilesSelected(e.dataTransfer.files);
              }}
              className={`border-2 border-dashed rounded-xl p-6 text-center flex flex-col items-center gap-2 mb-4 transition-colors ${
                dragOver
                  ? 'border-[var(--acc)] bg-[color-mix(in_srgb,var(--acc)_10%,transparent)]'
                  : 'border-[var(--line)]'
              }`}
            >
              <Upload className="w-5 h-5 text-[var(--mut)]" />
              <div className="font-semibold text-sm text-[var(--ink)]">Drop resumes here</div>
              <p className="text-xs text-[var(--mut)]">
                PDF, DOCX, TXT, or MD · up to 20 files · parsed by the Canopy backend
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 rounded-xl bg-[var(--acc)] text-[var(--on)] px-5 py-2 text-xs font-semibold hover:opacity-95 transition-opacity cursor-pointer"
              >
                Choose files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                multiple
                accept=".pdf,.docx,.txt,.md"
                onChange={(e) => {
                  void handleFilesSelected(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            {/* Extracted File Queue */}
            {files.length > 0 && (
              <ul aria-live="polite" className="space-y-2 mb-4">
                {files.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] px-3.5 py-2 text-sm"
                  >
                    <span className="truncate font-medium text-[var(--ink)]" title={entry.fileName}>
                      {entry.fileName}
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`text-xs font-mono-tabular ${
                          entry.error ? 'text-[var(--bad)]' : 'text-[var(--mut)]'
                        }`}
                      >
                        {entry.status}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${entry.fileName}`}
                        onClick={() => setFiles((prev) => prev.filter((f) => f.id !== entry.id))}
                        className="p-1 text-[var(--mut)] hover:text-[var(--ink)] cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <textarea
              id="canopy-resumes-input"
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              spellCheck={false}
              rows={6}
              placeholder="Or paste resume text here (separate multiple resumes with --- on its own line)"
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3.5 text-sm font-mono-tabular text-[var(--ink)] resize-y"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-8">
            <button
              type="button"
              disabled={analyzing}
              onClick={() => void runScreening()}
              className="rounded-xl bg-[var(--acc)] text-[var(--on)] px-6 py-3 text-sm font-semibold hover:opacity-95 disabled:opacity-60 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
            >
              {analyzing ? 'Analyzing…' : 'Analyze resumes'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPastedText(SAMPLE_RESUMES);
                void runScreening(SAMPLE_RESUMES);
              }}
              className="px-3 py-2 text-sm font-medium text-[var(--acc)] underline cursor-pointer"
            >
              Load sample resumes
            </button>
            <button
              type="button"
              onClick={() => {
                setPastedText('');
                setFiles([]);
                setPoolResult(null);
                setSelectedScoreBin(null);
                setScreenError(null);
                setSavedBatchId(null);
                setSaveError(null);
              }}
              className="px-3 py-2 text-sm font-medium text-[var(--mut)] hover:text-[var(--ink)] underline cursor-pointer"
            >
              Clear
            </button>
          </div>

          {screenError && (
            <div
              role="alert"
              className="mb-8 rounded-2xl border border-[var(--bad)] bg-[var(--card)] p-4 text-sm text-[var(--bad)]"
            >
              {screenError}
            </div>
          )}

          {/* Screening Results */}
          {poolResult && (() => {
            const visibleCandidates = selectedScoreBin
              ? poolResult.candidates.filter((c) => {
                  const s = Math.max(0, Math.min(100, Math.round(c.score)));
                  return s >= selectedScoreBin.min && s <= selectedScoreBin.max;
                })
              : poolResult.candidates;

            return (
              <div ref={resultsRef} aria-live="polite" className="mb-12">
                <div className="bg-[var(--h3)] text-[var(--on)] rounded-2xl p-6 mb-5">
                  <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                    <div>
                      <h3 className="text-xl font-semibold">Pool overview</h3>
                      <p className="text-sm opacity-80 font-mono-tabular">
                        {poolResult.candidateCount} resume{poolResult.candidateCount === 1 ? '' : 's'}{' '}
                        analyzed · Average score {poolResult.averageScore}/100 · Target:{' '}
                        {poolResult.targetRole}
                      </p>
                    </div>

                    {/* Save to Firestore bar */}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={batchTitle}
                        maxLength={160}
                        onChange={(e) => setBatchTitle(e.target.value)}
                        aria-label="Screening batch title"
                        placeholder="Batch title"
                        className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-xs text-white placeholder:text-white/60 w-52"
                      />
                      <button
                        type="button"
                        disabled={savingBatch || Boolean(savedBatchId)}
                        onClick={() => void handleSaveBatch()}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--gold)] text-[#1b1405] px-4 py-2 text-xs font-semibold hover:opacity-95 disabled:opacity-70 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <BookmarkCheck className="w-3.5 h-3.5" />
                        <span>
                          {savedBatchId
                            ? 'Saved to workspace'
                            : savingBatch
                              ? 'Saving…'
                              : user
                                ? 'Save to workspace'
                                : 'Sign in to save'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {saveError && (
                    <p role="alert" className="text-xs text-[#ffb8a4] mb-3">
                      {saveError}
                    </p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <div className="opacity-75 mb-1.5">Most common skills</div>
                      <div className="font-medium leading-relaxed">
                        {poolResult.topSkills.length > 0
                          ? poolResult.topSkills.map((s) => `${s.name} (${s.count})`).join(' · ')
                          : 'None detected'}
                      </div>
                    </div>
                    <div>
                      <div className="opacity-75 mb-1.5">Skills most candidates should learn</div>
                      <div className="font-medium leading-relaxed">
                        {poolResult.topGaps.length > 0
                          ? poolResult.topGaps.map((g) => `${g.name} (${g.count})`).join(' · ')
                          : 'None'}
                      </div>
                    </div>
                  </div>

                  <ScoreHistogram
                    candidates={poolResult.candidates}
                    selectedBinId={selectedScoreBin?.id ?? null}
                    onSelectBin={setSelectedScoreBin}
                  />
                </div>

                {selectedScoreBin && (
                  <div className="flex items-center justify-between gap-3 mb-4 text-xs text-[var(--mut)]">
                    <span>
                      Showing <strong className="text-[var(--ink)]">{visibleCandidates.length}</strong>{' '}
                      candidate{visibleCandidates.length === 1 ? '' : 's'} scoring{' '}
                      <span className="font-mono-tabular text-[var(--ink)]">
                        {selectedScoreBin.label}
                      </span>{' '}
                      pts
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedScoreBin(null)}
                      className="text-[var(--acc)] underline font-medium cursor-pointer"
                    >
                      Show all {poolResult.candidates.length} candidates
                    </button>
                  </div>
                )}

                {visibleCandidates.map((cand) => {
                  const overallRank =
                    poolResult.candidates.findIndex((item) => item.id === cand.id) + 1;
                  return (
                    <CandidateCard
                      key={cand.id}
                      candidate={cand}
                      rank={overallRank}
                      totalCount={poolResult.candidates.length}
                    />
                  );
                })}
              </div>
            );
          })()}

          {/* Custom Roles Builder */}
          <CustomRolesPanel customRoles={customRoles} onOpenLogin={() => openAuthModal('signin')} />
        </section>

        {/* Saved Screenings Workspace */}
        <SavedScreeningsPanel
          screenings={savedScreenings}
          loading={loadingScreenings}
          selectedId={selectedScreeningId}
          onSelect={setSelectedScreeningId}
          onOpenLogin={() => openAuthModal('signin')}
        />

        {/* How it works */}
        <section id="how" className="px-4 sm:px-8 lg:px-12 py-16 lg:py-24 max-w-[1200px] mx-auto">
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-tight mb-3 max-w-2xl">
            From a pile of PDFs to a short list
          </h2>
          <p className="text-[var(--mut)] max-w-xl mb-10">
            Four steps, each one a little taller than the last.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                n: 1,
                title: 'Read',
                desc: 'The backend parses PDF, DOCX, and TXT resumes, pulling contact details, sections, years of experience, and metrics.',
              },
              {
                n: 2,
                title: 'Detect',
                desc: 'Skills are matched against a library of ~60 tools and your custom team roles, including aliases like k8s for Kubernetes.',
              },
              {
                n: 3,
                title: 'Rank',
                desc: 'Each resume receives a transparent 100-point score with category breakdowns so the pool ranks cleanly.',
              },
              {
                n: 4,
                title: 'Save & Grow',
                desc: 'Store candidate pools in Firestore, update shortlist statuses and notes, and surface missing skills per role.',
              },
            ].map((step) => (
              <div key={step.title} className="border-t-2 border-[var(--acc)] pt-4">
                <span
                  aria-hidden="true"
                  className="block canopy-step-leaf bg-[var(--acc)] mb-3.5"
                  style={{
                    width: `${14 + step.n * 7}px`,
                    height: `${14 + step.n * 7}px`,
                  }}
                />
                <h3 className="text-xl font-semibold mb-1.5">{step.title}</h3>
                <p className="text-sm text-[var(--mut)]">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="px-4 sm:px-8 lg:px-12 py-16 max-w-[1200px] mx-auto">
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight mb-8">Questions</h2>
          <div className="divide-y divide-[var(--line)] border-t border-b border-[var(--line)]">
            {[
              {
                q: 'How is the score calculated?',
                a: 'Out of 100: skills breadth 30, resume sections 20, experience 15, measurable results 15, action verbs 10, and contact info 10.',
              },
              {
                q: 'How are files parsed?',
                a: 'Uploaded PDF, DOCX, TXT, and MD files are sent to the Canopy Express backend for text extraction and scoring, then returned directly to your workspace.',
              },
              {
                q: 'Where are saved screenings stored?',
                a: 'When you sign in with Google, your saved screening batches, candidate statuses, recruiter notes, and custom role rubrics are persisted privately to Cloud Firestore.',
              },
              {
                q: 'Can it replace a human reviewer?',
                a: 'No. It is a first pass that surfaces structured evidence. Keyword matching can miss skills described differently, so always review the short list yourself.',
              },
              {
                q: 'How are job suggestions made?',
                a: 'Each built-in or custom role defines a core skill set. Canopy compares it with the skills detected on the resume and shows the closest roles alongside missing skills.',
              },
            ].map((item) => (
              <details key={item.q} className="py-4 group">
                <summary className="font-semibold text-base sm:text-lg cursor-pointer text-[var(--ink)]">
                  {item.q}
                </summary>
                <p className="text-sm text-[var(--mut)] mt-2 max-w-2xl">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="bg-[var(--h3)] text-[var(--on)] text-center px-5 py-16">
        <div className="font-serif-editorial text-6xl sm:text-8xl lg:text-[180px] leading-[0.9] tracking-tight opacity-90 mb-4">
          Canopy
        </div>
        <p className="text-sm opacity-70">Screen with evidence. Hire with context.</p>
      </footer>

      <LoginModal open={loginOpen} initialMode={loginMode} onClose={closeAuthModal} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CanopyWorkspace />
    </AuthProvider>
  );
}
