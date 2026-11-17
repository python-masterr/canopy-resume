import { useEffect, useMemo, useState } from 'react';
import { Briefcase, ExternalLink, Plus, Save, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  createApplication,
  deleteApplication,
  formatFirestoreError,
  updateApplication,
  type ApplicationStatus,
  type JobApplicationRecord,
} from '../lib/firestoreService.ts';

export interface TrackerPrefillDraft {
  role: string;
  atsScore: number;
  notes?: string;
  key: number;
}

interface ApplicationTrackerPanelProps {
  applications: JobApplicationRecord[];
  loading: boolean;
  prefillDraft?: TrackerPrefillDraft | null;
  onOpenLogin: () => void;
}

const STATUS_TABS: Array<{ value: 'all' | ApplicationStatus; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'saved', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_SELECT_OPTIONS: Array<{ value: ApplicationStatus; label: string }> = [
  { value: 'saved', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
];

export function ApplicationTrackerPanel({
  applications,
  loading,
  prefillDraft,
  onOpenLogin,
}: ApplicationTrackerPanelProps) {
  const { user } = useAuth();
  const [filter, setFilter] = useState<'all' | ApplicationStatus>('all');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState<ApplicationStatus>('applied');
  const [atsScore, setAtsScore] = useState('75');
  const [jobUrl, setJobUrl] = useState('');
  const [appliedDate, setAppliedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!prefillDraft) return;
    setRole(prefillDraft.role.slice(0, 120));
    setAtsScore(String(Math.min(100, Math.max(0, Math.round(prefillDraft.atsScore)))));
    if (prefillDraft.notes) setNotes(prefillDraft.notes.slice(0, 2000));
  }, [prefillDraft]);

  const counts = useMemo(() => {
    const map: Record<ApplicationStatus, number> = {
      saved: 0,
      applied: 0,
      interviewing: 0,
      offer: 0,
      rejected: 0,
    };
    applications.forEach((a) => {
      if (a.status in map) map[a.status] += 1;
    });
    return map;
  }, [applications]);

  const visibleApps = useMemo(
    () => (filter === 'all' ? applications : applications.filter((a) => a.status === filter)),
    [applications, filter],
  );

  if (!user) {
    return (
      <section id="tracker" className="px-4 sm:px-8 lg:px-12 py-14 max-w-[1200px] mx-auto">
        <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2">
              Job application tracker
            </h2>
            <p className="text-[var(--mut)] text-sm max-w-xl">
              Sign in with Google to track job applications, monitor ATS scores per application, and update interview stages in Cloud Firestore.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenLogin}
            className="rounded-xl bg-[var(--acc)] text-[var(--on)] px-6 py-3 text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            Sign in
          </button>
        </div>
      </section>
    );
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.emailVerified) {
      setError('A verified Google session is required to save job applications.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createApplication(user.uid, {
        company,
        role,
        status,
        atsScore: Number(atsScore) || 0,
        jobUrl,
        appliedDate,
        notes,
      });
      setCompany('');
      setRole('');
      setJobUrl('');
      setNotes('');
    } catch (err) {
      setError(formatFirestoreError(err, 'Could not add application.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (appId: string, nextStatus: ApplicationStatus) => {
    setSavingId(appId);
    setError(null);
    try {
      await updateApplication(appId, { status: nextStatus });
    } catch (err) {
      setError(formatFirestoreError(err, 'Could not update status.'));
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveNotes = async (app: JobApplicationRecord) => {
    const nextNotes = editingNotes[app.id] ?? app.notes;
    setSavingId(app.id);
    setError(null);
    try {
      await updateApplication(app.id, { notes: nextNotes });
    } catch (err) {
      setError(formatFirestoreError(err, 'Could not save notes.'));
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (appId: string) => {
    setError(null);
    try {
      await deleteApplication(appId);
    } catch (err) {
      setError(formatFirestoreError(err, 'Could not remove application.'));
    }
  };

  return (
    <section id="tracker" className="px-4 sm:px-8 lg:px-12 py-14 max-w-[1200px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-1">
            Job application tracker
          </h2>
          <p className="text-sm text-[var(--mut)]">
            Track roles you&apos;ve applied to alongside ATS scores and interview notes.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-4 bg-[var(--card)] border border-[var(--line)] rounded-xl px-4 py-2.5 text-center">
          <div>
            <div className="text-base font-bold font-mono-tabular text-[var(--ink)]">
              {applications.length}
            </div>
            <div className="text-[11px] text-[var(--mut)]">Total</div>
          </div>
          <div>
            <div className="text-base font-bold font-mono-tabular text-[var(--ink)]">
              {counts.applied}
            </div>
            <div className="text-[11px] text-[var(--mut)]">Applied</div>
          </div>
          <div>
            <div className="text-base font-bold font-mono-tabular text-[var(--gold)]">
              {counts.interviewing}
            </div>
            <div className="text-[11px] text-[var(--mut)]">Interviews</div>
          </div>
          <div>
            <div className="text-base font-bold font-mono-tabular text-[var(--acc)]">
              {counts.offer}
            </div>
            <div className="text-[11px] text-[var(--mut)]">Offers</div>
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-[var(--bad)] bg-[var(--card)] p-4 text-sm text-[var(--bad)]"
        >
          {error}
        </div>
      )}

      {/* Add Application Form */}
      <form
        onSubmit={(e) => void handleAdd(e)}
        className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 mb-6"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)] mb-4">
          <Briefcase className="w-4 h-4 text-[var(--acc)]" />
          <span>Add job application</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 mb-3">
          <input
            type="text"
            required
            maxLength={120}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Company *"
            aria-label="Company name"
            className="lg:col-span-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--ink)]"
          />
          <input
            type="text"
            required
            maxLength={120}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role title *"
            aria-label="Role title"
            className="lg:col-span-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--ink)]"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
            aria-label="Application status"
            className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--ink)]"
          >
            {STATUS_SELECT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            max={100}
            value={atsScore}
            onChange={(e) => setAtsScore(e.target.value)}
            placeholder="ATS 0-100"
            aria-label="ATS score"
            className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs font-mono-tabular text-[var(--ink)]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <input
            type="url"
            maxLength={500}
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
            placeholder="Job posting URL (optional)"
            aria-label="Job URL"
            className="lg:col-span-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--ink)]"
          />
          <input
            type="date"
            value={appliedDate}
            onChange={(e) => setAppliedDate(e.target.value)}
            aria-label="Applied date"
            className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs font-mono-tabular text-[var(--ink)]"
          />
          <input
            type="text"
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (recruiter contact, salary band, interview stage…)"
            aria-label="Application notes"
            className="lg:col-span-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--ink)]"
          />
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--acc)] text-[var(--on)] px-4 py-2 text-xs font-semibold hover:opacity-95 disabled:opacity-60 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{submitting ? 'Adding…' : 'Track role'}</span>
          </button>
        </div>
      </form>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setFilter(t.value)}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
              filter === t.value
                ? 'bg-[var(--acc)] text-[var(--on)]'
                : 'bg-[var(--card)] border border-[var(--line)] text-[var(--ink)] hover:border-[var(--acc)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Applications List */}
      {loading ? (
        <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6 text-sm text-[var(--mut)]">
          Loading tracked applications…
        </div>
      ) : visibleApps.length === 0 ? (
        <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-8 text-center">
          <p className="text-sm font-medium text-[var(--ink)] mb-1">
            {applications.length === 0
              ? 'No job applications tracked yet'
              : `No applications in "${filter}"`}
          </p>
          <p className="text-xs text-[var(--mut)]">
            Add roles above or select &ldquo;Track Application&rdquo; from any candidate analysis card.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleApps.map((app) => {
            const noteValue = editingNotes[app.id] ?? app.notes;
            const noteDirty = noteValue !== app.notes;
            const isSafeUrl = app.jobUrl && /^https?:\/\//i.test(app.jobUrl);

            return (
              <div
                key={app.id}
                className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-base text-[var(--ink)]">{app.role}</h3>
                      <span className="text-xs text-[var(--mut)]">at {app.company}</span>
                      {isSafeUrl && (
                        <a
                          href={app.jobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open job posting for ${app.role}`}
                          className="inline-flex items-center gap-1 text-xs text-[var(--acc)] hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Posting</span>
                        </a>
                      )}
                    </div>
                    <div className="text-xs font-mono-tabular text-[var(--mut)] mt-1">
                      ATS Score: <strong className="text-[var(--ink)]">{app.atsScore}/100</strong>
                      {app.appliedDate ? ` · Date: ${app.appliedDate}` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`Status for ${app.company} ${app.role}`}
                      value={app.status}
                      disabled={savingId === app.id}
                      onChange={(e) =>
                        void handleStatusChange(app.id, e.target.value as ApplicationStatus)
                      }
                      className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] cursor-pointer"
                    >
                      {STATUS_SELECT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleDelete(app.id)}
                      aria-label={`Delete ${app.company} ${app.role}`}
                      className="p-2 rounded-lg text-[var(--mut)] hover:text-[var(--bad)] transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    maxLength={2000}
                    value={noteValue}
                    onChange={(e) =>
                      setEditingNotes((prev) => ({ ...prev, [app.id]: e.target.value }))
                    }
                    placeholder="Add interview dates, contact details, or follow-up reminders…"
                    className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-xs text-[var(--ink)]"
                  />
                  {noteDirty && (
                    <button
                      type="button"
                      disabled={savingId === app.id}
                      onClick={() => void handleSaveNotes(app)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--acc)] text-[var(--on)] px-3.5 py-1.5 text-xs font-semibold cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
