import { useEffect, useState } from 'react';
import { Trash2, FolderOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  deleteScreening,
  subscribeScreeningCandidates,
  updateCandidateReview,
  type CandidateStatus,
  type SavedCandidateRecord,
  type SavedScreeningRecord,
} from '../lib/firestoreService.ts';
import type { ScreenedCandidateResult } from '../shared/screener.ts';
import { CandidateCard } from './CandidateCard.tsx';
import { ScoreHistogram, type ScoreBin } from './ScoreHistogram.tsx';

interface SavedScreeningsPanelProps {
  screenings: SavedScreeningRecord[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenLogin: () => void;
  onOpenInAiStudio?: (candidate: ScreenedCandidateResult, targetRole?: string) => void;
  onSaveVersion?: (candidate: ScreenedCandidateResult, targetRole?: string) => Promise<void>;
  onTrackJob?: (candidate: ScreenedCandidateResult, targetRole?: string) => void;
}

export function SavedScreeningsPanel({
  screenings,
  loading,
  selectedId,
  onSelect,
  onOpenLogin,
  onOpenInAiStudio,
  onSaveVersion,
  onTrackJob,
}: SavedScreeningsPanelProps) {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<SavedCandidateRecord[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | CandidateStatus>('all');
  const [selectedScoreBin, setSelectedScoreBin] = useState<ScoreBin | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedScreening = screenings.find((s) => s.id === selectedId) || null;

  useEffect(() => {
    if (!user || !selectedId) {
      setCandidates([]);
      setSelectedScoreBin(null);
      return;
    }
    setSelectedScoreBin(null);
    setLoadingCandidates(true);
    setError(null);
    const unsub = subscribeScreeningCandidates(
      selectedId,
      user.uid,
      (rows) => {
        setCandidates(rows);
        setLoadingCandidates(false);
      },
      (err) => {
        setError(err.message);
        setLoadingCandidates(false);
      },
    );
    return () => unsub();
  }, [user, selectedId]);

  if (!user) {
    return (
      <section id="saved" className="px-4 sm:px-8 lg:px-12 py-14 max-w-[1200px] mx-auto">
        <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2">
              Saved screening history
            </h2>
            <p className="text-[var(--mut)] text-sm max-w-xl">
              Sign in to save screening batches to Firestore, shortlist candidates, and keep recruiter notes across sessions.
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

  const filteredCandidates = candidates.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (selectedScoreBin) {
      const s = Math.max(0, Math.min(100, Math.round(c.score)));
      return s >= selectedScoreBin.min && s <= selectedScoreBin.max;
    }
    return true;
  });

  const handleDelete = async (screeningId: string) => {
    try {
      await deleteScreening(screeningId, user.uid);
      if (selectedId === screeningId) {
        onSelect(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete screening.');
    }
  };

  return (
    <section id="saved" className="px-4 sm:px-8 lg:px-12 py-14 max-w-[1200px] mx-auto">
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-6">
        <div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-1">
            Saved screenings
          </h2>
          <p className="text-sm text-[var(--mut)]">
            Synced with Cloud Firestore · {screenings.length} batch{screenings.length === 1 ? '' : 'es'} saved
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-[var(--bad)] p-4 text-sm text-[var(--bad)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6 text-sm text-[var(--mut)]">
          Loading saved screenings…
        </div>
      ) : screenings.length === 0 ? (
        <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-8 text-center">
          <p className="text-base font-medium text-[var(--ink)] mb-1">No saved screenings yet</p>
          <p className="text-sm text-[var(--mut)]">
            Analyze resumes above and select &ldquo;Save to workspace&rdquo; to store candidate rankings here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
          {/* Batch list */}
          <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl divide-y divide-[var(--line)] overflow-hidden">
            {screenings.map((item) => {
              const active = item.id === selectedId;
              const dateLabel = item.createdAt?.toDate
                ? item.createdAt.toDate().toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })
                : 'Just now';
              return (
                <div
                  key={item.id}
                  className={`p-4 flex items-start justify-between gap-3 transition-colors ${
                    active ? 'bg-[color-mix(in_srgb,var(--acc)_10%,transparent)]' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className="text-left flex-1 min-w-0 cursor-pointer"
                  >
                    <div className="font-semibold text-sm text-[var(--ink)] truncate">
                      {item.title}
                    </div>
                    <div className="text-xs text-[var(--mut)] font-mono-tabular mt-1">
                      {item.candidateCount} resume{item.candidateCount === 1 ? '' : 's'} · Avg{' '}
                      {item.averageScore}/100 · {dateLabel}
                    </div>
                    <div className="text-xs text-[var(--mut)] mt-0.5 truncate">
                      Target: {item.targetRole}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(item.id)}
                    aria-label={`Delete ${item.title}`}
                    className="p-1.5 rounded-lg text-[var(--mut)] hover:text-[var(--bad)] transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Selected batch detail */}
          <div>
            {selectedScreening ? (
              <div>
                <div className="bg-[var(--h3)] text-[var(--on)] rounded-2xl p-6 mb-4">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
                    <div>
                      <h3 className="text-xl font-semibold">{selectedScreening.title}</h3>
                      <div className="text-xs opacity-75 font-mono-tabular mt-0.5">
                        {selectedScreening.candidateCount} candidate
                        {selectedScreening.candidateCount === 1 ? '' : 's'} · Average{' '}
                        {selectedScreening.averageScore}/100 · Role: {selectedScreening.targetRole}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 p-1 rounded-lg bg-white/10">
                      {(['all', 'new', 'shortlisted', 'reviewed', 'archived'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setStatusFilter(st)}
                          className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
                            statusFilter === st
                              ? 'bg-white text-[#12261b]'
                              : 'text-white/80 hover:text-white'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {candidates.length > 0 && (
                    <ScoreHistogram
                      candidates={candidates}
                      selectedBinId={selectedScoreBin?.id ?? null}
                      onSelectBin={setSelectedScoreBin}
                    />
                  )}
                </div>

                {loadingCandidates ? (
                  <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6 text-sm text-[var(--mut)]">
                    Loading candidates…
                  </div>
                ) : filteredCandidates.length === 0 ? (
                  <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6 text-sm text-[var(--mut)]">
                    No candidates match the &ldquo;{statusFilter}&rdquo; filter.
                  </div>
                ) : (
                  filteredCandidates.map((cand, idx) => (
                    <CandidateCard
                      key={cand.id}
                      candidate={cand}
                      rank={idx + 1}
                      totalCount={filteredCandidates.length}
                      targetRole={selectedScreening.targetRole}
                      isPersisted
                      status={cand.status}
                      notes={cand.notes}
                      onUpdateReview={(updates) =>
                        updateCandidateReview(selectedScreening.id, cand.id, updates)
                      }
                      onOpenInAiStudio={
                        onOpenInAiStudio
                          ? (c) => onOpenInAiStudio(c, selectedScreening.targetRole)
                          : undefined
                      }
                      onSaveVersion={
                        onSaveVersion
                          ? (c) => onSaveVersion(c, selectedScreening.targetRole)
                          : undefined
                      }
                      onTrackJob={
                        onTrackJob
                          ? (c) => onTrackJob(c, selectedScreening.targetRole)
                          : undefined
                      }
                    />
                  ))
                )}
              </div>
            ) : (
              <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-10 text-center text-[var(--mut)] flex flex-col items-center gap-2">
                <FolderOpen className="w-6 h-6 opacity-60" />
                <p className="text-sm">Select a saved screening batch from the left to review candidates.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
