import { useState } from 'react';
import { Eye, FileDown, History, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  deleteResumeVersion,
  formatFirestoreError,
  type ResumeVersionRecord,
} from '../lib/firestoreService.ts';
import { downloadFormattedResumePdf } from '../lib/pdfExport.ts';

interface ResumeHistoryPanelProps {
  versions: ResumeVersionRecord[];
  loading: boolean;
  onOpenInStudio: (version: ResumeVersionRecord) => void;
  onLoadInScreener: (version: ResumeVersionRecord) => void;
  onOpenLogin: () => void;
}

const SOURCE_LABELS: Record<ResumeVersionRecord['source'], string> = {
  uploaded: 'Uploaded',
  improved: 'AI Improved',
  built: 'AI Built',
};

export function ResumeHistoryPanel({
  versions,
  loading,
  onOpenInStudio,
  onLoadInScreener,
  onOpenLogin,
}: ResumeHistoryPanelProps) {
  const { user } = useAuth();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <section id="history" className="px-4 sm:px-8 lg:px-12 py-14 max-w-[1200px] mx-auto">
        <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2">
              Resume history &amp; versions
            </h2>
            <p className="text-[var(--mut)] text-sm max-w-xl">
              Sign in with Google to save uploaded, AI-improved, and AI-built resume iterations, compare ATS score progress, and download formatted PDFs anytime.
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

  const handleDelete = async (versionId: string) => {
    setError(null);
    try {
      await deleteResumeVersion(versionId);
      if (previewId === versionId) setPreviewId(null);
    } catch (err) {
      setError(formatFirestoreError(err, 'Could not delete resume version.'));
    }
  };

  return (
    <section id="history" className="px-4 sm:px-8 lg:px-12 py-14 max-w-[1200px] mx-auto">
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-6">
        <div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-1">
            Resume history
          </h2>
          <p className="text-sm text-[var(--mut)]">
            {versions.length} saved version{versions.length === 1 ? '' : 's'} · Track ATS score gains across iterations
          </p>
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

      {loading ? (
        <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6 text-sm text-[var(--mut)]">
          Loading resume history…
        </div>
      ) : versions.length === 0 ? (
        <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-8 text-center">
          <History className="w-6 h-6 text-[var(--mut)] mx-auto mb-2 opacity-70" />
          <p className="text-sm font-medium text-[var(--ink)] mb-1">No resume versions saved yet</p>
          <p className="text-xs text-[var(--mut)]">
            Click &ldquo;Save to History&rdquo; on any screened candidate or save an AI-improved or AI-built draft from AI Studio.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {versions.map((ver, index) => {
            const older = versions[index + 1];
            const delta = older ? ver.atsScore - older.atsScore : null;
            const dateLabel = ver.createdAt?.toDate
              ? ver.createdAt.toDate().toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Just now';
            const isPreviewOpen = previewId === ver.id;

            return (
              <div
                key={ver.id}
                className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="font-semibold text-base text-[var(--ink)]">{ver.title}</h3>
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--acc)]">
                        {SOURCE_LABELS[ver.source]}
                      </span>
                    </div>
                    <div className="text-xs font-mono-tabular text-[var(--mut)] mt-1">
                      ATS Score: <strong className="text-[var(--ink)]">{ver.atsScore}/100</strong>
                      {delta !== null && delta !== 0 && (
                        <span
                          className={`ml-1.5 font-semibold ${
                            delta > 0 ? 'text-[var(--acc)]' : 'text-[var(--bad)]'
                          }`}
                        >
                          ({delta > 0 ? `+${delta}` : delta} vs prev)
                        </span>
                      )}{' '}
                      · {ver.skillsCount} skills · Target: {ver.targetRole} · {dateLabel}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewId(isPreviewOpen ? null : ver.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:border-[var(--acc)] cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{isPreviewOpen ? 'Hide' : 'Preview'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadFormattedResumePdf({
                          fullName: ver.title,
                          rawText: ver.content,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:border-[var(--acc)] cursor-pointer"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenInStudio(ver)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:border-[var(--acc)] cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[var(--acc)]" />
                      <span>AI Studio</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onLoadInScreener(ver)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--acc)] text-[var(--on)] px-3 py-1.5 text-xs font-semibold cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Screen</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(ver.id)}
                      aria-label={`Delete ${ver.title}`}
                      className="p-1.5 rounded-lg text-[var(--mut)] hover:text-[var(--bad)] transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isPreviewOpen && (
                  <pre className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-4 text-xs font-mono-tabular text-[var(--ink)] whitespace-pre-wrap overflow-x-auto max-h-80 overflow-y-auto">
                    {ver.content}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
