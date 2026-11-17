import { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Check,
  ChevronDown,
  ChevronUp,
  FileDown,
  History,
  Plus,
  Save,
  Sparkles,
  X,
} from 'lucide-react';
import {
  computeAtsDiagnostics,
  type ScreenedCandidateResult,
} from '../shared/screener.ts';
import type { CandidateStatus } from '../lib/firestoreService.ts';
import { downloadCandidateReportPdf } from '../lib/pdfExport.ts';

interface CandidateCardProps {
  candidate: ScreenedCandidateResult;
  rank?: number;
  totalCount?: number;
  targetRole?: string;
  isPersisted?: boolean;
  status?: CandidateStatus;
  notes?: string;
  onUpdateReview?: (updates: { status?: CandidateStatus; notes?: string }) => Promise<void>;
  onOpenInAiStudio?: (candidate: ScreenedCandidateResult) => void;
  onSaveVersion?: (candidate: ScreenedCandidateResult) => Promise<void>;
  onTrackJob?: (candidate: ScreenedCandidateResult) => void;
}

const STATUS_OPTIONS: Array<{ value: CandidateStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'archived', label: 'Archived' },
];

export function CandidateCard({
  candidate,
  rank,
  totalCount = 1,
  targetRole,
  isPersisted = false,
  status = 'new',
  notes = '',
  onUpdateReview,
  onOpenInAiStudio,
  onSaveVersion,
  onTrackJob,
}: CandidateCardProps) {
  const [draftNotes, setDraftNotes] = useState(notes);
  const [savingReview, setSavingReview] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [showAtsDetails, setShowAtsDetails] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [versionSaved, setVersionSaved] = useState(false);

  useEffect(() => {
    setDraftNotes(notes);
    setVersionSaved(false);
  }, [notes, candidate.id]);

  const atsReport = useMemo(
    () =>
      candidate.atsChecks ??
      computeAtsDiagnostics(
        candidate.fullText || candidate.rawTextPreview || '',
        candidate.detectedSkills,
      ),
    [candidate],
  );

  const isArchived = status === 'archived';
  const bannerBg =
    candidate.score >= 75 ? '#2c7a4b' : candidate.score >= 50 ? '#d9a02c' : '#b9482a';
  const bannerInk = candidate.score >= 50 && candidate.score < 75 ? '#1b1405' : '#ffffff';

  const handleStatusChange = async (nextStatus: CandidateStatus) => {
    if (!onUpdateReview || isArchived) return;
    setSavingReview(true);
    try {
      await onUpdateReview({ status: nextStatus });
    } finally {
      setSavingReview(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!onUpdateReview || isArchived) return;
    setSavingReview(true);
    setSavedNotice(false);
    try {
      await onUpdateReview({ notes: draftNotes });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2200);
    } finally {
      setSavingReview(false);
    }
  };

  const handleSaveHistory = async () => {
    if (!onSaveVersion) return;
    setSavingVersion(true);
    try {
      await onSaveVersion(candidate);
      setVersionSaved(true);
      setTimeout(() => setVersionSaved(false), 2500);
    } finally {
      setSavingVersion(false);
    }
  };

  return (
    <article className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6 mb-4">
      <div
        className="flex flex-wrap items-center justify-between gap-5 rounded-xl px-6 py-4 mb-5"
        style={{ backgroundColor: bannerBg, color: bannerInk }}
      >
        <div className="flex items-center gap-5 flex-wrap">
          <div className="text-5xl sm:text-6xl font-bold tracking-tight leading-none font-mono-tabular">
            {candidate.score}
            <span className="text-lg font-medium opacity-80 tracking-normal">/100</span>
          </div>
          <div>
            <div className="text-lg font-semibold leading-snug">
              {candidate.verdict}
              {totalCount > 1 && rank !== undefined ? ` · Rank ${rank}` : ''}
            </div>
            <div className="text-sm opacity-90">
              {candidate.name}
              {candidate.sourceFileName ? ` (${candidate.sourceFileName})` : ''} · ATS Grade{' '}
              <span className="font-mono-tabular font-semibold">{atsReport.grade}</span> (
              <span className="font-mono-tabular">{atsReport.atsScore}%</span>)
              {candidate.jdMatch ? (
                <>
                  {' '}
                  · JD Fit <span className="font-mono-tabular font-semibold">{candidate.jdMatch.pct}%</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => downloadCandidateReportPdf(candidate, { targetRole })}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold bg-black/20 text-current border border-white/25 hover:bg-black/30 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>PDF Report</span>
          </button>

          {onOpenInAiStudio && (
            <button
              type="button"
              onClick={() => onOpenInAiStudio(candidate)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold bg-white text-[#12261b] hover:opacity-95 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#2c7a4b]" />
              <span>AI Studio</span>
            </button>
          )}

          {isPersisted && onUpdateReview && (
            <>
              <label htmlFor={`status-${candidate.id}`} className="sr-only">
                Review status
              </label>
              <select
                id={`status-${candidate.id}`}
                value={status}
                disabled={savingReview || isArchived}
                onChange={(e) => void handleStatusChange(e.target.value as CandidateStatus)}
                className="rounded-lg px-3 py-2 text-xs font-semibold bg-black/20 text-current border border-white/25 cursor-pointer disabled:opacity-60"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="text-[#12261b] bg-white">
                    {opt.label}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {/* Key metrics row with tabular numerals */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pb-5 mb-5 border-b border-[var(--line)]">
        <div>
          <div className="text-2xl font-bold font-mono-tabular text-[var(--ink)]">
            {atsReport.atsScore}
            <span className="text-xs font-normal text-[var(--mut)]">/100</span>
          </div>
          <div className="text-xs text-[var(--mut)]">Advanced ATS ({atsReport.grade})</div>
        </div>
        <div>
          <div className="text-2xl font-bold font-mono-tabular text-[var(--ink)]">
            {candidate.yearsExperience || '–'}
          </div>
          <div className="text-xs text-[var(--mut)]">Years found</div>
        </div>
        <div>
          <div className="text-2xl font-bold font-mono-tabular text-[var(--ink)]">
            {candidate.skillsCount}
          </div>
          <div className="text-xs text-[var(--mut)]">Detected skills</div>
        </div>
        <div>
          <div className="text-2xl font-bold font-mono-tabular text-[var(--ink)]">
            {candidate.measurableResults}
          </div>
          <div className="text-xs text-[var(--mut)]">Measurable results</div>
        </div>
        <div>
          <div className="text-2xl font-bold font-mono-tabular text-[var(--ink)]">
            {candidate.wordCount}
          </div>
          <div className="text-xs text-[var(--mut)]">Words</div>
        </div>
      </div>

      {/* Quick workspace actions */}
      {(onSaveVersion || onTrackJob) && (
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-[var(--line)]">
          <span className="text-xs text-[var(--mut)]">
            Strongest: <strong className="text-[var(--ink)]">{candidate.strongestArea}</strong> ·
            Biggest gain: <strong className="text-[var(--ink)]">{candidate.weakestArea}</strong>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {onSaveVersion && (
              <button
                type="button"
                disabled={savingVersion || versionSaved}
                onClick={() => void handleSaveHistory()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:border-[var(--acc)] disabled:opacity-60 cursor-pointer"
              >
                <History className="w-3.5 h-3.5 text-[var(--acc)]" />
                <span>{versionSaved ? 'Saved to History' : savingVersion ? 'Saving…' : 'Save to History'}</span>
              </button>
            )}
            {onTrackJob && (
              <button
                type="button"
                onClick={() => onTrackJob(candidate)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:border-[var(--acc)] cursor-pointer"
              >
                <Briefcase className="w-3.5 h-3.5 text-[var(--acc)]" />
                <span>Track Application</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Advanced ATS Compatibility Checks */}
      <div className="mb-6 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-4">
        <button
          type="button"
          onClick={() => setShowAtsDetails((s) => !s)}
          className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
        >
          <div>
            <div className="text-xs font-semibold text-[var(--ink)]">
              Advanced ATS Compatibility · {atsReport.atsScore}/100 (Grade {atsReport.grade})
            </div>
            <div className="text-xs text-[var(--mut)] mt-0.5">
              {atsReport.checks.filter((c) => c.passed).length}/{atsReport.checks.length} structural &amp;
              readability checks passed
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--acc)] shrink-0">
            <span>{showAtsDetails ? 'Hide details' : 'Inspect checks'}</span>
            {showAtsDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>

        {showAtsDetails && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4 pt-3 border-t border-[var(--line)]">
            {atsReport.checks.map((chk) => (
              <div
                key={chk.label}
                className="flex items-start gap-2.5 rounded-lg bg-[var(--card)] border border-[var(--line)] p-3"
              >
                {chk.passed ? (
                  <Check className="w-4 h-4 text-[var(--acc)] shrink-0 mt-0.5" />
                ) : (
                  <X className="w-4 h-4 text-[var(--bad)] shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--ink)]">{chk.label}</span>
                    <span className="text-xs font-mono-tabular text-[var(--mut)]">
                      {chk.score}/{chk.max}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--mut)] mt-0.5">{chk.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Job Description Match */}
      {candidate.jdMatch && (
        <div className="mb-6 rounded-xl border border-[var(--acc)] bg-[color-mix(in_srgb,var(--acc)_6%,transparent)] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <div>
              <h3 className="text-xs font-semibold text-[var(--ink)]">Job description match</h3>
              <p className="text-xs text-[var(--mut)]">{candidate.jdMatch.summary}</p>
            </div>
            <div className="text-lg font-bold font-mono-tabular text-[var(--acc)]">
              {candidate.jdMatch.pct}% fit
            </div>
          </div>
          <div className="h-1.5 rounded bg-[var(--line)] overflow-hidden mb-3">
            <div
              className="h-full bg-[var(--acc)] transition-all duration-300"
              style={{ width: `${candidate.jdMatch.pct}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {candidate.jdMatch.matchedSkills.map((sk) => (
              <span
                key={`jd-ok-${sk}`}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium bg-[color-mix(in_srgb,var(--acc)_16%,transparent)] text-[var(--ink)]"
              >
                <Check className="w-3 h-3 text-[var(--acc)]" />
                <span>{sk}</span>
              </span>
            ))}
            {candidate.jdMatch.matchedKeywords.map((kw) => (
              <span
                key={`jd-kw-${kw}`}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium bg-[var(--card)] border border-[var(--line)] text-[var(--ink)]"
              >
                <Check className="w-3 h-3 text-[var(--acc)]" />
                <span>{kw}</span>
              </span>
            ))}
            {candidate.jdMatch.missingSkills.map((sk) => (
              <span
                key={`jd-miss-${sk}`}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border border-[var(--bad)] text-[var(--bad)]"
              >
                <Plus className="w-3 h-3" />
                <span>JD Gap: {sk}</span>
              </span>
            ))}
            {candidate.jdMatch.missingKeywords.slice(0, 6).map((kw) => (
              <span
                key={`jd-misskw-${kw}`}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border border-[var(--line)] text-[var(--mut)]"
              >
                <span>Missing keyword: {kw}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Matched roles & skill gaps */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-[var(--mut)] mb-3">Jobs you can aim for</h3>
        {candidate.matchedJobs.length > 0 ? (
          <div className="space-y-3">
            {candidate.matchedJobs.map((job, idx) => (
              <div
                key={job.title}
                className={`rounded-xl p-4 border ${
                  idx === 0
                    ? 'border-[var(--acc)] bg-[color-mix(in_srgb,var(--acc)_8%,transparent)]'
                    : 'border-[var(--line)]'
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <div className="font-semibold text-base text-[var(--ink)]">
                    {candidate.prefix}
                    {job.title}
                  </div>
                  <div className="text-xs font-mono-tabular text-[var(--mut)]">
                    {idx === 0 ? 'Best match · ' : ''}
                    {job.pct}% match
                  </div>
                </div>
                <div className="h-1.5 rounded bg-[var(--line)] overflow-hidden mb-3">
                  <div
                    className="h-full bg-[var(--acc)] transition-all duration-300"
                    style={{ width: `${job.pct}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {job.matched.map((sk) => (
                    <span
                      key={`ok-${sk}`}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium bg-[color-mix(in_srgb,var(--acc)_14%,transparent)] text-[var(--ink)]"
                    >
                      <Check className="w-3 h-3 text-[var(--acc)]" />
                      <span>{sk}</span>
                    </span>
                  ))}
                  {job.missing.map((sk) => (
                    <span
                      key={`gap-${sk}`}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border border-[var(--bad)] text-[var(--bad)]"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Gap: {sk}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--mut)]">
            Not enough skills were detected to suggest a role. List specific tools and analyze again.
          </p>
        )}
      </div>

      {/* Skills to learn next */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-[var(--mut)] mb-2">Skills to learn next</h3>
        {candidate.recommendedSkills.length > 0 ? (
          <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--mut)]">
            {candidate.recommendedSkills.map((rec) => (
              <li key={`${rec.skill}-${rec.role}`}>
                <strong className="text-[var(--ink)] font-semibold">{rec.skill}</strong> for{' '}
                {rec.role}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--mut)]">Nothing missing for the closest roles.</p>
        )}
      </div>

      {/* Score breakdown & skills by area */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-5">
        <div>
          <h3 className="text-xs font-semibold text-[var(--mut)] mb-3">Score breakdown</h3>
          <div className="space-y-2">
            {candidate.breakdown.map((item) => (
              <div
                key={item.label}
                className="grid grid-cols-[128px_1fr_52px] items-center gap-3 text-xs"
              >
                <span className="text-[var(--ink)] truncate">{item.label}</span>
                <div className="h-2 rounded bg-[var(--line)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--acc)]"
                    style={{ width: `${Math.round((item.points / item.max) * 100)}%` }}
                  />
                </div>
                <span className="text-right font-mono-tabular text-[var(--mut)]">
                  {item.points}/{item.max}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-[var(--mut)] mb-3">Skills by area</h3>
          <div className="space-y-2">
            {candidate.categoryCounts.map((cat) => (
              <div
                key={cat.category}
                className="grid grid-cols-[128px_1fr_52px] items-center gap-3 text-xs"
              >
                <span className="text-[var(--ink)] truncate">{cat.category}</span>
                <div className="h-2 rounded bg-[var(--line)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--gold)]"
                    style={{ width: `${Math.round((cat.count / cat.total) * 100)}%` }}
                  />
                </div>
                <span className="text-right font-mono-tabular text-[var(--mut)]">
                  {cat.count}/{cat.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Improvement tips */}
      {candidate.tips.length > 0 && (
        <div className="pt-4 border-t border-[var(--line)]">
          <h3 className="text-xs font-semibold text-[var(--mut)] mb-2">How to improve this resume</h3>
          <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--mut)]">
            {candidate.tips.slice(0, 6).map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Persistent Recruiter Notes (for saved screenings) */}
      {isPersisted && onUpdateReview && (
        <div className="pt-4 mt-5 border-t border-[var(--line)]">
          <div className="flex items-center justify-between gap-2 mb-2">
            <label htmlFor={`notes-${candidate.id}`} className="text-xs font-semibold text-[var(--mut)]">
              Recruiter notes {isArchived ? '(locked because candidate is archived)' : ''}
            </label>
            {savedNotice && <span className="text-xs text-[var(--acc)] font-medium">Saved</span>}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id={`notes-${candidate.id}`}
              type="text"
              value={draftNotes}
              disabled={isArchived}
              maxLength={2000}
              onChange={(e) => setDraftNotes(e.target.value)}
              placeholder="Add interview observations, compensation band, or follow-up questions..."
              className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2 text-sm text-[var(--ink)] disabled:opacity-60"
            />
            <button
              type="button"
              disabled={savingReview || isArchived}
              onClick={() => void handleSaveNotes()}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--acc)] text-[var(--on)] px-4 py-2 text-xs font-semibold disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingReview ? 'Saving…' : 'Save note'}</span>
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
