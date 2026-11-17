import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Briefcase,
  FolderKanban,
  Mail,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  deleteCustomRole,
  deleteScreeningAdmin,
  fetchAllUsersPrivateInfoAdmin,
  subscribeAllCustomRolesAdmin,
  subscribeAllScreeningsAdmin,
  subscribeAllUsersAdmin,
  subscribeScreeningCandidatesAdmin,
  updateCandidateReview,
  type AdminUserPrivateInfo,
  type AdminUserProfile,
  type CandidateStatus,
  type SavedCandidateRecord,
  type SavedCustomRoleRecord,
  type SavedScreeningRecord,
} from '../lib/firestoreService.ts';

interface AdminPageProps {
  onBackToWorkspace: () => void;
  onOpenSignIn: () => void;
}

type AdminTab = 'screenings' | 'users' | 'roles';

function formatTimestamp(ts?: { toDate?: () => Date } | null): string {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatIsoDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatProvider(provider?: string): string {
  if (!provider) return 'Email / Password';
  if (provider.includes('google')) return 'Google';
  if (provider === 'password') return 'Email & Password';
  return provider;
}

export function AdminPage({ onBackToWorkspace, onOpenSignIn }: AdminPageProps) {
  const { user, isAdmin, logout } = useAuth();
  const [tab, setTab] = useState<AdminTab>('users');
  const [searchQuery, setSearchQuery] = useState('');

  const [screenings, setScreenings] = useState<SavedScreeningRecord[]>([]);
  const [users, setUsers] = useState<AdminUserProfile[]>([]);
  const [userPrivateMap, setUserPrivateMap] = useState<Record<string, AdminUserPrivateInfo>>({});
  const [selectedUserUid, setSelectedUserUid] = useState<string | null>(null);
  const [customRoles, setCustomRoles] = useState<SavedCustomRoleRecord[]>([]);

  const [selectedScreeningId, setSelectedScreeningId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<SavedCandidateRecord[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const [backendStatus, setBackendStatus] = useState<{
    ok: boolean;
    skillsCount: number;
    rolesCount: number;
  } | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isAdmin) return;
    setAdminError(null);

    const unsubScreenings = subscribeAllScreeningsAdmin(
      (rows) => {
        setScreenings(rows);
        setSelectedScreeningId((prev) =>
          prev && rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? null,
        );
      },
      (err) => setAdminError(err.message),
    );

    const unsubUsers = subscribeAllUsersAdmin(
      (rows) => {
        setUsers(rows);
        setSelectedUserUid((prev) =>
          prev && rows.some((u) => u.uid === prev) ? prev : rows[0]?.uid ?? null,
        );
        if (rows.length > 0) {
          void fetchAllUsersPrivateInfoAdmin(rows.map((u) => u.uid))
            .then((infoMap) => setUserPrivateMap(infoMap))
            .catch((err) => {
              setAdminError(err instanceof Error ? err.message : 'Failed to load user details.');
            });
        } else {
          setUserPrivateMap({});
        }
      },
      (err) => setAdminError(err.message),
    );

    const unsubRoles = subscribeAllCustomRolesAdmin(
      (rows) => setCustomRoles(rows),
      (err) => setAdminError(err.message),
    );

    void Promise.all([
      fetch('/api/health').then((r) => r.json() as Promise<{ ok?: boolean }>),
      fetch('/api/taxonomy').then(
        (r) => r.json() as Promise<{ skills?: unknown[]; roles?: unknown[] }>,
      ),
    ])
      .then(([health, tax]) => {
        setBackendStatus({
          ok: Boolean(health.ok),
          skillsCount: Array.isArray(tax.skills) ? tax.skills.length : 0,
          rolesCount: Array.isArray(tax.roles) ? tax.roles.length : 0,
        });
      })
      .catch(() => setBackendStatus(null));

    return () => {
      unsubScreenings();
      unsubUsers();
      unsubRoles();
    };
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user || !isAdmin || !selectedScreeningId) {
      setCandidates([]);
      return;
    }
    setLoadingCandidates(true);
    const unsub = subscribeScreeningCandidatesAdmin(
      selectedScreeningId,
      (rows) => {
        setCandidates(rows);
        setLoadingCandidates(false);
      },
      (err) => {
        setAdminError(err.message);
        setLoadingCandidates(false);
      },
    );
    return () => unsub();
  }, [user, isAdmin, selectedScreeningId]);

  const totalCandidatesCount = useMemo(
    () => screenings.reduce((sum, s) => sum + (s.candidateCount || 0), 0),
    [screenings],
  );

  const userActivityMap = useMemo(() => {
    const map: Record<
      string,
      { batches: SavedScreeningRecord[]; candidatesCount: number; rolesCount: number; avgScore: number }
    > = {};

    screenings.forEach((s) => {
      if (!map[s.ownerId]) {
        map[s.ownerId] = { batches: [], candidatesCount: 0, rolesCount: 0, avgScore: 0 };
      }
      map[s.ownerId].batches.push(s);
      map[s.ownerId].candidatesCount += s.candidateCount || 0;
    });

    customRoles.forEach((r) => {
      if (!map[r.ownerId]) {
        map[r.ownerId] = { batches: [], candidatesCount: 0, rolesCount: 0, avgScore: 0 };
      }
      map[r.ownerId].rolesCount += 1;
    });

    Object.values(map).forEach((entry) => {
      if (entry.batches.length > 0) {
        const sum = entry.batches.reduce((acc, b) => acc + (b.averageScore || 0), 0);
        entry.avgScore = Math.round(sum / entry.batches.length);
      }
    });

    return map;
  }, [screenings, customRoles]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const priv = userPrivateMap[u.uid];
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q) ||
        (priv?.email || '').toLowerCase().includes(q)
      );
    });
  }, [users, userPrivateMap, searchQuery]);

  const filteredScreenings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return screenings;
    return screenings.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.targetRole.toLowerCase().includes(q) ||
        s.ownerId.toLowerCase().includes(q),
    );
  }, [screenings, searchQuery]);

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[var(--card)] border border-[var(--line)] rounded-2xl p-8 text-center">
          <ShieldCheck className="w-8 h-8 text-[var(--acc)] mx-auto mb-3" />
          <h1 className="text-xl font-semibold mb-2">Admin sign-in required</h1>
          <p className="text-sm text-[var(--mut)] mb-6">
            Access to the Canopy Admin console is restricted strictly to{' '}
            <span className="font-mono-tabular text-[var(--ink)]">{BOOTSTRAPPED_ADMIN_EMAIL}</span>.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={onOpenSignIn}
              className="rounded-xl bg-[var(--acc)] text-[var(--on)] px-5 py-2.5 text-sm font-semibold cursor-pointer"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={onBackToWorkspace}
              className="rounded-xl border border-[var(--line)] px-5 py-2.5 text-sm font-semibold cursor-pointer"
            >
              Back to screener
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[var(--card)] border border-[var(--line)] rounded-2xl p-8 text-center">
          <ShieldCheck className="w-8 h-8 text-[var(--bad)] mx-auto mb-3" />
          <h1 className="text-xl font-semibold mb-2">Access restricted</h1>
          <p className="text-sm text-[var(--mut)] mb-6">
            Only <span className="font-mono-tabular text-[var(--ink)]">{BOOTSTRAPPED_ADMIN_EMAIL}</span>{' '}
            with a verified email can access the Canopy Admin page. Current account:{' '}
            <span className="font-mono-tabular text-[var(--ink)]">{user.email || user.uid}</span>
            {!user.emailVerified ? ' (email unverified)' : ''}.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={onBackToWorkspace}
              className="rounded-xl bg-[var(--acc)] text-[var(--on)] px-5 py-2.5 text-sm font-semibold cursor-pointer"
            >
              Return to Canopy
            </button>
            <button
              type="button"
              onClick={() => {
                void logout().then(() => onOpenSignIn());
              }}
              className="rounded-xl border border-[var(--line)] px-5 py-2.5 text-sm font-semibold cursor-pointer"
            >
              Switch account
            </button>
          </div>
        </div>
      </div>
    );
  }

  const selectedScreening = screenings.find((s) => s.id === selectedScreeningId) || null;
  const selectedUser = users.find((u) => u.uid === selectedUserUid) || null;
  const selectedUserPrivate = selectedUser ? userPrivateMap[selectedUser.uid] : undefined;
  const selectedUserActivity = selectedUser
    ? userActivityMap[selectedUser.uid] || {
        batches: [],
        candidatesCount: 0,
        rolesCount: 0,
        avgScore: 0,
      }
    : null;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      {/* Top Bar */}
      <header className="border-b border-[var(--line)] bg-[var(--card)]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-4 flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onBackToWorkspace}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--mut)] hover:text-[var(--ink)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Workspace</span>
            </button>
            <span aria-hidden="true" className="text-[var(--line)]">
              /
            </span>
            <h1 className="text-lg font-bold tracking-tight whitespace-nowrap">Canopy Admin</h1>
          </div>

          <div className="flex items-center gap-3 text-xs text-[var(--mut)] font-mono-tabular">
            <span className="hidden sm:inline truncate max-w-[260px]">{user.email}</span>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-8 space-y-6">
        {adminError && (
          <div
            role="alert"
            className="rounded-xl border border-[var(--bad)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--bad)]"
          >
            {adminError}
          </div>
        )}

        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
            <div className="flex items-center justify-between text-xs text-[var(--mut)] mb-2">
              <span>Registered users</span>
              <Users className="w-4 h-4" />
            </div>
            <div className="text-3xl font-bold font-mono-tabular">{users.length}</div>
          </div>

          <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
            <div className="flex items-center justify-between text-xs text-[var(--mut)] mb-2">
              <span>Screening batches</span>
              <FolderKanban className="w-4 h-4" />
            </div>
            <div className="text-3xl font-bold font-mono-tabular">{screenings.length}</div>
          </div>

          <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
            <div className="flex items-center justify-between text-xs text-[var(--mut)] mb-2">
              <span>Screened resumes</span>
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="text-3xl font-bold font-mono-tabular">{totalCandidatesCount}</div>
          </div>

          <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
            <div className="flex items-center justify-between text-xs text-[var(--mut)] mb-2">
              <span>Custom role rubrics</span>
              <Briefcase className="w-4 h-4" />
            </div>
            <div className="text-3xl font-bold font-mono-tabular">{customRoles.length}</div>
          </div>
        </div>

        {/* Navigation Tabs + Search */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--card)] border border-[var(--line)]">
            {(
              [
                { id: 'users', label: 'Users & Details' },
                { id: 'screenings', label: 'Screenings' },
                { id: 'roles', label: 'Custom Roles' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setSearchQuery('');
                }}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tab === item.id
                    ? 'bg-[var(--acc)] text-[var(--on)]'
                    : 'text-[var(--mut)] hover:text-[var(--ink)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {(tab === 'users' || tab === 'screenings') && (
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                tab === 'users'
                  ? 'Filter users by name, email, or UID…'
                  : 'Filter screenings by title, role, or owner UID…'
              }
              aria-label={tab === 'users' ? 'Filter users' : 'Filter screenings'}
              className="w-full sm:w-80 rounded-xl border border-[var(--line)] bg-[var(--card)] px-3.5 py-2 text-sm text-[var(--ink)]"
            />
          )}
        </div>

        {/* Tab 1: Users & Full Details */}
        {tab === 'users' && (
          <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-6 items-start">
            <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[var(--line)] text-xs text-[var(--mut)]">
                    <tr>
                      <th className="py-3 px-4 font-semibold">User</th>
                      <th className="py-3 px-4 font-semibold">Email & Provider</th>
                      <th className="py-3 px-4 font-semibold text-right">Batches</th>
                      <th className="py-3 px-4 font-semibold text-right">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 px-4 text-center text-[var(--mut)]">
                          No registered users match your filter.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const priv = userPrivateMap[u.uid];
                        const activity = userActivityMap[u.uid];
                        const active = u.uid === selectedUserUid;
                        return (
                          <tr
                            key={u.uid}
                            onClick={() => setSelectedUserUid(u.uid)}
                            className={`transition-colors cursor-pointer ${
                              active
                                ? 'bg-[color-mix(in_srgb,var(--acc)_10%,transparent)]'
                                : 'hover:bg-[color-mix(in_srgb,var(--ink)_3%,transparent)]'
                            }`}
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                {u.photoURL ? (
                                  <img
                                    src={u.photoURL}
                                    alt={u.displayName}
                                    referrerPolicy="no-referrer"
                                    className="w-8 h-8 rounded-full object-cover shrink-0 border border-[var(--line)]"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-[var(--acc)] text-[var(--on)] flex items-center justify-center text-xs font-bold shrink-0">
                                    {u.displayName.slice(0, 1).toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="font-semibold text-[var(--ink)] truncate">
                                    {u.displayName}
                                  </div>
                                  <div className="text-[11px] text-[var(--mut)] font-mono-tabular truncate max-w-[170px]">
                                    {u.uid}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="text-xs text-[var(--ink)] truncate max-w-[220px]">
                                {priv?.email || 'Email hidden / pending'}
                              </div>
                              <div className="text-[11px] text-[var(--mut)] mt-0.5">
                                {formatProvider(priv?.provider)} ·{' '}
                                {priv?.emailVerified ? 'Verified' : 'Unverified'}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-mono-tabular">
                              {activity?.batches.length ?? 0}
                            </td>
                            <td className="py-3 px-4 text-right text-xs text-[var(--mut)] font-mono-tabular whitespace-nowrap">
                              {u.createdAt?.toDate
                                ? u.createdAt.toDate().toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                  })
                                : '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Selected User Details Panel */}
            <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6">
              {selectedUser && selectedUserActivity ? (
                <div className="space-y-5">
                  <div className="flex items-start gap-4 pb-4 border-b border-[var(--line)]">
                    {selectedUser.photoURL ? (
                      <img
                        src={selectedUser.photoURL}
                        alt={selectedUser.displayName}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-full object-cover border border-[var(--line)] shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[var(--acc)] text-[var(--on)] flex items-center justify-center text-lg font-bold shrink-0">
                        {selectedUser.displayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold truncate">{selectedUser.displayName}</h2>
                      <div className="flex items-center gap-1.5 text-xs text-[var(--mut)] mt-0.5 truncate">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {selectedUserPrivate?.email || 'No email synced'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-[var(--acc)] mt-1 font-medium">
                        <UserCheck className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {selectedUserPrivate?.email?.toLowerCase() ===
                          BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
                            ? 'Sole Administrator'
                            : 'Workspace Member'}{' '}
                          · {selectedUserPrivate?.emailVerified ? 'Email verified' : 'Pending verification'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl bg-[var(--bg)] p-3">
                      <dt className="text-[var(--mut)] mb-0.5">Auth provider</dt>
                      <dd className="font-semibold text-[var(--ink)]">
                        {formatProvider(selectedUserPrivate?.provider)}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-[var(--bg)] p-3">
                      <dt className="text-[var(--mut)] mb-0.5">Last active</dt>
                      <dd className="font-semibold font-mono-tabular text-[var(--ink)]">
                        {selectedUserPrivate?.lastSignInAt
                          ? formatIsoDate(selectedUserPrivate.lastSignInAt)
                          : formatTimestamp(selectedUser.updatedAt)}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-[var(--bg)] p-3">
                      <dt className="text-[var(--mut)] mb-0.5">Account created</dt>
                      <dd className="font-semibold font-mono-tabular text-[var(--ink)]">
                        {formatTimestamp(selectedUser.createdAt)}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-[var(--bg)] p-3">
                      <dt className="text-[var(--mut)] mb-0.5">User UID</dt>
                      <dd className="font-mono-tabular text-[var(--ink)] break-all">
                        {selectedUser.uid}
                      </dd>
                    </div>
                  </dl>

                  <div className="grid grid-cols-3 gap-3 pt-1">
                    <div className="border border-[var(--line)] rounded-xl p-3 text-center">
                      <div className="text-xl font-bold font-mono-tabular">
                        {selectedUserActivity.batches.length}
                      </div>
                      <div className="text-[11px] text-[var(--mut)]">Batches</div>
                    </div>
                    <div className="border border-[var(--line)] rounded-xl p-3 text-center">
                      <div className="text-xl font-bold font-mono-tabular">
                        {selectedUserActivity.candidatesCount}
                      </div>
                      <div className="text-[11px] text-[var(--mut)]">Resumes</div>
                    </div>
                    <div className="border border-[var(--line)] rounded-xl p-3 text-center">
                      <div className="text-xl font-bold font-mono-tabular">
                        {selectedUserActivity.rolesCount}
                      </div>
                      <div className="text-[11px] text-[var(--mut)]">Custom roles</div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-[var(--mut)] mb-2">
                      Recent screening batches by this user
                    </h3>
                    {selectedUserActivity.batches.length === 0 ? (
                      <p className="text-xs text-[var(--mut)]">No saved batches yet.</p>
                    ) : (
                      <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
                        {selectedUserActivity.batches.slice(0, 5).map((batch) => (
                          <li key={batch.id} className="py-2 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedScreeningId(batch.id);
                                setTab('screenings');
                              }}
                              className="text-left text-xs font-medium text-[var(--ink)] hover:underline truncate cursor-pointer"
                            >
                              {batch.title}
                            </button>
                            <span className="text-[11px] font-mono-tabular text-[var(--mut)] shrink-0">
                              {batch.candidateCount} res · Avg {batch.averageScore}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[var(--mut)]">
                  Select a user from the table to inspect full profile details and screening activity.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Platform Screenings */}
        {tab === 'screenings' && (
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6 items-start">
            <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[var(--line)] text-xs text-[var(--mut)]">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Batch Title</th>
                      <th className="py-3 px-4 font-semibold">Target Role</th>
                      <th className="py-3 px-4 font-semibold text-right">Resumes</th>
                      <th className="py-3 px-4 font-semibold text-right">Avg</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {filteredScreenings.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 px-4 text-center text-[var(--mut)]">
                          No screening batches found.
                        </td>
                      </tr>
                    ) : (
                      filteredScreenings.map((s) => {
                        const active = s.id === selectedScreeningId;
                        const ownerEmail = userPrivateMap[s.ownerId]?.email;
                        return (
                          <tr
                            key={s.id}
                            className={`transition-colors ${
                              active
                                ? 'bg-[color-mix(in_srgb,var(--acc)_10%,transparent)]'
                                : 'hover:bg-[color-mix(in_srgb,var(--ink)_3%,transparent)]'
                            }`}
                          >
                            <td className="py-3 px-4">
                              <button
                                type="button"
                                onClick={() => setSelectedScreeningId(s.id)}
                                className="text-left font-medium text-[var(--ink)] hover:underline cursor-pointer"
                              >
                                {s.title}
                              </button>
                              <div className="text-xs text-[var(--mut)] font-mono-tabular truncate max-w-[240px]">
                                Owner: {ownerEmail || s.ownerId}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-xs text-[var(--mut)]">{s.targetRole}</td>
                            <td className="py-3 px-4 text-right font-mono-tabular">
                              {s.candidateCount}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-tabular font-semibold">
                              {s.averageScore}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => void deleteScreeningAdmin(s.id)}
                                aria-label={`Delete ${s.title}`}
                                className="p-1.5 rounded-lg text-[var(--mut)] hover:text-[var(--bad)] cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Candidate Inspector */}
            <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
              {selectedScreening ? (
                <div>
                  <h2 className="text-base font-semibold mb-1">{selectedScreening.title}</h2>
                  <p className="text-xs text-[var(--mut)] font-mono-tabular mb-4">
                    Screening ID: {selectedScreening.id} · Owner:{' '}
                    {userPrivateMap[selectedScreening.ownerId]?.email || selectedScreening.ownerId}
                  </p>

                  {loadingCandidates ? (
                    <p className="text-sm text-[var(--mut)]">Loading candidates…</p>
                  ) : candidates.length === 0 ? (
                    <p className="text-sm text-[var(--mut)]">No candidate records found.</p>
                  ) : (
                    <div className="space-y-3">
                      {candidates.map((cand) => (
                        <div
                          key={cand.id}
                          className="border border-[var(--line)] rounded-xl p-4 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="font-semibold text-sm">{cand.name}</div>
                              <div className="text-xs text-[var(--mut)] font-mono-tabular">
                                Score: {cand.score}/100 · {cand.skillsCount} skills ·{' '}
                                {cand.yearsExperience} yrs
                              </div>
                            </div>
                            <select
                              aria-label={`Status for ${cand.name}`}
                              value={cand.status}
                              onChange={(e) =>
                                void updateCandidateReview(selectedScreening.id, cand.id, {
                                  status: e.target.value as CandidateStatus,
                                })
                              }
                              className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1 text-xs font-medium"
                            >
                              <option value="new">New</option>
                              <option value="shortlisted">Shortlisted</option>
                              <option value="reviewed">Reviewed</option>
                              <option value="archived">Archived</option>
                            </select>
                          </div>
                          {cand.notes && (
                            <p className="text-xs text-[var(--mut)] bg-[var(--bg)] rounded-lg px-3 py-2">
                              Note: {cand.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-[var(--mut)]">
                  Select a screening batch to inspect candidate scores and statuses.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Custom Roles & Backend Taxonomy */}
        {tab === 'roles' && (
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6 items-start">
            <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6">
              <h2 className="text-base font-semibold mb-1">All custom role rubrics</h2>
              <p className="text-xs text-[var(--mut)] mb-4">
                Review and moderate custom job role definitions created across the workspace.
              </p>

              <div className="divide-y divide-[var(--line)]">
                {customRoles.length === 0 ? (
                  <p className="text-sm text-[var(--mut)] py-4">No custom roles created yet.</p>
                ) : (
                  customRoles.map((role) => (
                    <div key={role.id} className="py-3 flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold text-sm">{role.title}</div>
                        <div className="text-xs text-[var(--mut)] mt-0.5">
                          {role.skills.join(' · ')}
                        </div>
                        <div className="text-xs text-[var(--mut)] font-mono-tabular mt-0.5">
                          Owner: {userPrivateMap[role.ownerId]?.email || role.ownerId}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void deleteCustomRole(role.id)}
                        aria-label={`Delete ${role.title}`}
                        className="p-1.5 rounded-lg text-[var(--mut)] hover:text-[var(--bad)] cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6">
              <h2 className="text-base font-semibold mb-1">Backend screening engine</h2>
              <p className="text-xs text-[var(--mut)] mb-4">
                Live status from <code className="font-mono-tabular">/api/health</code> and{' '}
                <code className="font-mono-tabular">/api/taxonomy</code>.
              </p>
              {backendStatus ? (
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-[var(--line)]">
                    <dt className="text-[var(--mut)]">Express API</dt>
                    <dd className="font-mono-tabular font-semibold text-[var(--acc)]">
                      {backendStatus.ok ? 'Healthy' : 'Unavailable'}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-[var(--line)]">
                    <dt className="text-[var(--mut)]">Indexed skills</dt>
                    <dd className="font-mono-tabular font-semibold">{backendStatus.skillsCount}</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-[var(--mut)]">Built-in role archetypes</dt>
                    <dd className="font-mono-tabular font-semibold">{backendStatus.rolesCount}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-[var(--mut)]">Checking backend API…</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
