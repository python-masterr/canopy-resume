import { useEffect, useState } from 'react';
import {
  Compass,
  Copy,
  FileDown,
  FileText,
  History,
  MessageSquare,
  RotateCcw,
  Sparkles,
  Wand2,
} from 'lucide-react';
import {
  computeAtsDiagnostics,
  screenCandidate,
  type ScreenedCandidateResult,
} from '../shared/screener.ts';
import type {
  AiAnalyzeResult,
  AiBuildResumeInput,
  AiBuildResumeResult,
  AiCareerRoadmapResult,
  AiImproveResult,
  AiInterviewPrepResult,
} from '../shared/aiTypes.ts';
import type { ResumeVersionRecord, ResumeVersionSource } from '../lib/firestoreService.ts';
import {
  downloadAiReportPdf,
  downloadCareerRoadmapPdf,
  downloadFormattedResumePdf,
  downloadInterviewPrepPdf,
} from '../lib/pdfExport.ts';

export type AiStudioTab = 'analyze' | 'improve' | 'build' | 'interview' | 'roadmap';

interface AiStudioPanelProps {
  activeResumeText: string;
  activeCandidateName: string;
  activeTargetRole: string;
  activeJobDescription: string;
  roleOptions: string[];
  resumeVersions: ResumeVersionRecord[];
  activeTab: AiStudioTab;
  onChangeTab: (tab: AiStudioTab) => void;
  onChangeResumeContext: (text: string, label?: string) => void;
  onChangeTargetRole: (role: string) => void;
  onChangeJobDescription: (jd: string) => void;
  onSendToScreener: (resumeText: string, name: string) => void;
  onSaveResumeVersion: (params: {
    title: string;
    targetRole: string;
    source: ResumeVersionSource;
    content: string;
  }) => Promise<void>;
}

const STUDIO_TABS: Array<{ id: AiStudioTab; label: string }> = [
  { id: 'analyze', label: 'AI Analyzer & Gaps' },
  { id: 'improve', label: 'Resume Improver' },
  { id: 'build', label: 'Resume Builder' },
  { id: 'interview', label: 'Interview Prep' },
  { id: 'roadmap', label: 'Career & Roadmap' },
];

export function AiStudioPanel({
  activeResumeText,
  activeCandidateName,
  activeTargetRole,
  activeJobDescription,
  roleOptions,
  resumeVersions,
  activeTab,
  onChangeTab,
  onChangeResumeContext,
  onChangeTargetRole,
  onChangeJobDescription,
  onSendToScreener,
  onSaveResumeVersion,
}: AiStudioPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<AiAnalyzeResult | null>(null);
  const [improvement, setImprovement] = useState<AiImproveResult | null>(null);
  const [builtResume, setBuiltResume] = useState<AiBuildResumeResult | null>(null);
  const [interviewPrep, setInterviewPrep] = useState<AiInterviewPrepResult | null>(null);
  const [careerRoadmap, setCareerRoadmap] = useState<AiCareerRoadmapResult | null>(null);
  const [timeframeWeeks, setTimeframeWeeks] = useState(6);

  const [builderForm, setBuilderForm] = useState<AiBuildResumeInput>({
    fullName: activeCandidateName && activeCandidateName !== 'Candidate 1' ? activeCandidateName : '',
    email: '',
    phone: '',
    location: '',
    links: '',
    targetRole: activeTargetRole !== 'All Roles' ? activeTargetRole : 'Full Stack Developer',
    yearsExperience: '3 years',
    summaryInput: '',
    skillsInput: '',
    experienceInput: '',
    educationInput: '',
    projectsInput: '',
  });

  useEffect(() => {
    if (activeTargetRole && activeTargetRole !== 'All Roles') {
      setBuilderForm((prev) => ({ ...prev, targetRole: activeTargetRole }));
    }
  }, [activeTargetRole]);

  const showTempNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2600);
  };

  const postAi = async <T,>(endpoint: string, body: unknown): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as T & { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || 'Gemini AI request failed.');
      }
      return payload;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach AI service.';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleRunAnalyze = async () => {
    if (!activeResumeText.trim()) {
      setError('Paste or load a resume above before running AI analysis.');
      return;
    }
    const res = await postAi<AiAnalyzeResult>('/api/ai/analyze', {
      resumeText: activeResumeText,
      targetRole: activeTargetRole,
      jobDescription: activeJobDescription,
    });
    setAnalysis(res);
  };

  const handleRunImprove = async () => {
    if (!activeResumeText.trim()) {
      setError('Paste or load a resume above before generating improvements.');
      return;
    }
    const res = await postAi<AiImproveResult>('/api/ai/improve', {
      resumeText: activeResumeText,
      targetRole: activeTargetRole,
      jobDescription: activeJobDescription,
    });
    setImprovement(res);
  };

  const handleRunBuilder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!builderForm.fullName.trim() || !builderForm.targetRole.trim()) {
      setError('Enter your full name and target role to build an ATS resume.');
      return;
    }
    const res = await postAi<AiBuildResumeResult>('/api/ai/build-resume', {
      ...builderForm,
      jobDescription: activeJobDescription,
    });
    setBuiltResume(res);
  };

  const handleRunInterviewPrep = async () => {
    if (!activeResumeText.trim()) {
      setError('Paste or load a resume above to tailor interview questions.');
      return;
    }
    const res = await postAi<AiInterviewPrepResult>('/api/ai/interview-prep', {
      resumeText: activeResumeText,
      targetRole: activeTargetRole,
      jobDescription: activeJobDescription,
    });
    setInterviewPrep(res);
  };

  const handleRunRoadmap = async () => {
    if (!activeResumeText.trim()) {
      setError('Paste or load a resume above to generate a career & learning roadmap.');
      return;
    }
    const res = await postAi<AiCareerRoadmapResult>('/api/ai/career-roadmap', {
      resumeText: activeResumeText,
      targetRole: activeTargetRole,
      jobDescription: activeJobDescription,
      timeframeWeeks,
    });
    setCareerRoadmap(res);
  };

  const saveVersionFromText = async (title: string, source: ResumeVersionSource, content: string) => {
    setError(null);
    try {
      await onSaveResumeVersion({
        title,
        targetRole: activeTargetRole,
        source,
        content,
      });
      showTempNotice('Saved to Resume History.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save resume version.');
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showTempNotice('Copied to clipboard.');
    } catch {
      setError('Clipboard copy was blocked by the browser.');
    }
  };

  const builtPreviewCandidate: ScreenedCandidateResult | null = builtResume
    ? screenCandidate(
        { name: builderForm.fullName || 'Resume Draft', text: builtResume.formattedResumeText },
        0,
        [],
        builderForm.targetRole,
        activeJobDescription,
      )
    : null;

  const improvedAts = improvement
    ? computeAtsDiagnostics(improvement.improvedResumeText)
    : null;

  return (
    <section id="studio" className="px-4 sm:px-8 lg:px-12 py-14 max-w-[1200px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-1">
            AI Career Studio
          </h2>
          <p className="text-sm text-[var(--mut)] max-w-2xl">
            Deep resume audit, quantified rewrites, ATS resume builder, tailored interview prep, and multi-week skill roadmaps powered by Gemini.
          </p>
        </div>

        {notice && (
          <span className="text-xs font-semibold text-[var(--acc)] bg-[color-mix(in_srgb,var(--acc)_12%,transparent)] px-3 py-1.5 rounded-lg">
            {notice}
          </span>
        )}
      </div>

      {/* Studio Mode Tabs */}
      <div
        role="tablist"
        aria-label="AI Studio tools"
        className="flex flex-wrap gap-2 mb-5 border-b border-[var(--line)] pb-3"
      >
        {STUDIO_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setError(null);
                onChangeTab(tab.id);
              }}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-[var(--acc)] text-[var(--on)]'
                  : 'bg-[var(--card)] border border-[var(--line)] text-[var(--ink)] hover:border-[var(--acc)]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Shared Context Bar (hidden on Resume Builder since builder has structured fields) */}
      {activeTab !== 'build' && (
        <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 mb-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label htmlFor="studio-role" className="block text-xs font-medium text-[var(--mut)] mb-1">
                Target role
              </label>
              <select
                id="studio-role"
                value={activeTargetRole}
                onChange={(e) => onChangeTargetRole(e.target.value)}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs font-medium text-[var(--ink)]"
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="studio-history-load" className="block text-xs font-medium text-[var(--mut)] mb-1">
                Load from Resume History
              </label>
              <select
                id="studio-history-load"
                value=""
                onChange={(e) => {
                  const found = resumeVersions.find((v) => v.id === e.target.value);
                  if (found) {
                    onChangeResumeContext(found.content, found.title);
                    if (found.targetRole) onChangeTargetRole(found.targetRole);
                  }
                }}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs font-medium text-[var(--ink)]"
              >
                <option value="">
                  {resumeVersions.length > 0
                    ? `Select saved version (${resumeVersions.length})…`
                    : 'No saved resume versions yet'}
                </option>
                {resumeVersions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title} · ATS {v.atsScore}/100 ({v.source})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <div className="text-xs text-[var(--mut)]">
                Active resume:{' '}
                <strong className="text-[var(--ink)]">
                  {activeCandidateName || 'Custom resume text'}
                </strong>{' '}
                (
                <span className="font-mono-tabular">
                  {activeResumeText.trim() ? activeResumeText.trim().split(/\s+/).length : 0} words
                </span>
                )
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label htmlFor="studio-resume-text" className="block text-xs font-medium text-[var(--mut)] mb-1">
                Resume text for AI
              </label>
              <textarea
                id="studio-resume-text"
                rows={5}
                value={activeResumeText}
                onChange={(e) => onChangeResumeContext(e.target.value)}
                placeholder="Click 'AI Studio' on any screened candidate above, load from Resume History, or paste resume text here…"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-xs font-mono-tabular text-[var(--ink)] resize-y"
              />
            </div>

            <div>
              <label htmlFor="studio-jd-text" className="block text-xs font-medium text-[var(--mut)] mb-1">
                Target job description (optional)
              </label>
              <textarea
                id="studio-jd-text"
                rows={5}
                value={activeJobDescription}
                onChange={(e) => onChangeJobDescription(e.target.value)}
                placeholder="Paste job requirements here to align skill gaps, bullet rewrites, interview prep, and roadmap…"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-xs text-[var(--ink)] resize-y"
              />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-5 rounded-2xl border border-[var(--bad)] bg-[var(--card)] p-4 text-sm text-[var(--bad)]"
        >
          {error}
        </div>
      )}

      {/* TAB 1: AI ANALYZER & SKILL GAPS */}
      {activeTab === 'analyze' && (
        <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="text-lg font-semibold text-[var(--ink)]">
                AI Resume Analyzer &amp; Skill Gap Diagnosis
              </h3>
              <p className="text-xs text-[var(--mut)]">
                Deep section-by-section critique, prioritized skill gaps, and job description alignment.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {analysis && (
                <button
                  type="button"
                  onClick={() =>
                    downloadAiReportPdf(
                      `AI Resume Analysis: ${activeCandidateName || 'Candidate'}`,
                      `${analysis.executiveVerdict} · ATS ${analysis.atsReadinessScore}/100`,
                      [
                        { heading: 'Executive Summary', paragraphs: [analysis.candidateSummary] },
                        { heading: 'Strengths', bullets: analysis.strengths },
                        { heading: 'Red Flags & Fixes', bullets: analysis.redFlags },
                        {
                          heading: 'Prioritized Skill Gaps',
                          bullets: analysis.skillGaps.map(
                            (g) => `[${g.priority.toUpperCase()}] ${g.skill}: ${g.reason} Bridge: ${g.howToBridge}`,
                          ),
                        },
                        {
                          heading: 'Section Feedback',
                          bullets: analysis.sectionFeedback.map(
                            (s) => `${s.section} (${s.rating}): ${s.feedback}`,
                          ),
                        },
                      ],
                      `ai-analysis-${activeCandidateName || 'resume'}`,
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-2 text-xs font-semibold text-[var(--ink)] hover:border-[var(--acc)] cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
              )}
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleRunAnalyze()}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--acc)] text-[var(--on)] px-5 py-2.5 text-xs font-semibold hover:opacity-95 disabled:opacity-60 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{loading ? 'Analyzing with Gemini…' : 'Run AI Analysis'}</span>
              </button>
            </div>
          </div>

          {analysis && (
            <div className="space-y-6 pt-4 border-t border-[var(--line)]">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl bg-[var(--bg)] border border-[var(--line)] p-4">
                <div className="sm:col-span-2">
                  <div className="text-xs font-semibold text-[var(--acc)] mb-1">
                    {analysis.executiveVerdict}
                  </div>
                  <p className="text-sm text-[var(--ink)]">{analysis.candidateSummary}</p>
                </div>
                <div className="flex sm:flex-col justify-between sm:justify-center gap-2 border-t sm:border-t-0 sm:border-l border-[var(--line)] pt-3 sm:pt-0 sm:pl-4">
                  <div>
                    <div className="text-2xl font-bold font-mono-tabular text-[var(--ink)]">
                      {analysis.atsReadinessScore}/100
                    </div>
                    <div className="text-xs text-[var(--mut)]">AI ATS Readiness</div>
                  </div>
                  {analysis.jdAlignmentScore !== null && (
                    <div>
                      <div className="text-xl font-bold font-mono-tabular text-[var(--acc)]">
                        {analysis.jdAlignmentScore}%
                      </div>
                      <div className="text-xs text-[var(--mut)]">JD Alignment</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="rounded-xl border border-[var(--line)] p-4">
                  <h4 className="text-xs font-semibold text-[var(--acc)] mb-2">Key Strengths</h4>
                  <ul className="list-disc pl-5 space-y-1.5 text-sm text-[var(--ink)]">
                    {analysis.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-[var(--line)] p-4">
                  <h4 className="text-xs font-semibold text-[var(--bad)] mb-2">Attention Areas</h4>
                  <ul className="list-disc pl-5 space-y-1.5 text-sm text-[var(--ink)]">
                    {analysis.redFlags.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-[var(--mut)] mb-3">
                  Detailed Skill Gap Analysis
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {analysis.skillGaps.map((gap, i) => (
                    <div
                      key={`${gap.skill}-${i}`}
                      className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-4"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-semibold text-sm text-[var(--ink)]">{gap.skill}</span>
                        <span
                          className={`text-[11px] font-semibold uppercase ${
                            gap.priority === 'high'
                              ? 'text-[var(--bad)]'
                              : gap.priority === 'medium'
                                ? 'text-[var(--gold)]'
                                : 'text-[var(--mut)]'
                          }`}
                        >
                          {gap.priority} priority
                        </span>
                      </div>
                      <p className="text-xs text-[var(--mut)] mb-1.5">{gap.reason}</p>
                      <p className="text-xs text-[var(--ink)]">
                        <strong>How to bridge:</strong> {gap.howToBridge}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {analysis.jdKeywordSuggestions.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-[var(--mut)] mb-2">
                    Recommended Keywords to Include
                  </h4>
                  <p className="text-sm text-[var(--ink)] font-mono-tabular">
                    {analysis.jdKeywordSuggestions.join(' · ')}
                  </p>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold text-[var(--mut)] mb-3">Section-by-Section Review</h4>
                <div className="space-y-2.5">
                  {analysis.sectionFeedback.map((sec, i) => (
                    <div
                      key={`${sec.section}-${i}`}
                      className="rounded-xl border border-[var(--line)] p-3.5 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2"
                    >
                      <div>
                        <span className="text-sm font-semibold text-[var(--ink)]">{sec.section}</span>
                        <p className="text-xs text-[var(--mut)] mt-0.5">{sec.feedback}</p>
                      </div>
                      <span className="text-xs font-mono-tabular font-semibold uppercase text-[var(--acc)] shrink-0">
                        {sec.rating.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: AI RESUME IMPROVEMENT */}
      {activeTab === 'improve' && (
        <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="text-lg font-semibold text-[var(--ink)]">AI Resume Improvement</h3>
              <p className="text-xs text-[var(--mut)]">
                Rewrites weak bullets with STAR framing, fixes ATS issues, and creates a polished version you can save or re-screen.
              </p>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleRunImprove()}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--acc)] text-[var(--on)] px-5 py-2.5 text-xs font-semibold hover:opacity-95 disabled:opacity-60 cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>{loading ? 'Rewriting with Gemini…' : 'Improve Resume'}</span>
            </button>
          </div>

          {improvement && (
            <div className="space-y-6 pt-4 border-t border-[var(--line)]">
              <div className="rounded-xl bg-[var(--bg)] border border-[var(--line)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <h4 className="text-xs font-semibold text-[var(--acc)]">Upgraded Professional Summary</h4>
                  {improvedAts && (
                    <span className="text-xs font-mono-tabular font-semibold text-[var(--ink)]">
                      Improved ATS Score: {improvedAts.atsScore}/100 (Grade {improvedAts.grade})
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--ink)]">{improvement.improvedSummary}</p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-[var(--mut)] mb-3">Before vs. After Bullet Upgrades</h4>
                <div className="space-y-3">
                  {improvement.bulletRewrites.map((rw, idx) => (
                    <div key={idx} className="rounded-xl border border-[var(--line)] p-4 space-y-2">
                      <div className="text-xs text-[var(--mut)]">
                        <strong className="text-[var(--bad)]">Before:</strong> {rw.original}
                      </div>
                      <div className="text-sm text-[var(--ink)]">
                        <strong className="text-[var(--acc)]">After:</strong> {rw.improved}
                      </div>
                      <div className="text-xs text-[var(--mut)]">Why it works: {rw.impactReason}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[var(--line)] p-4">
                  <h4 className="text-xs font-semibold text-[var(--mut)] mb-2">ATS Fixes Applied</h4>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-[var(--ink)]">
                    {improvement.atsFixes.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-[var(--line)] p-4">
                  <h4 className="text-xs font-semibold text-[var(--mut)] mb-2">Keywords Integrated</h4>
                  <p className="text-xs font-mono-tabular text-[var(--ink)]">
                    {improvement.keywordsAdded.join(' · ') || 'Role-aligned keywords integrated'}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                  <h4 className="text-xs font-semibold text-[var(--mut)]">Complete Improved Resume</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void copyText(improvement.improvedResumeText)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:border-[var(--acc)] cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadFormattedResumePdf({
                          fullName: activeCandidateName || 'Improved Resume',
                          rawText: improvement.improvedResumeText,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:border-[var(--acc)] cursor-pointer"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void saveVersionFromText(
                          `${activeCandidateName || 'Resume'} (AI Improved)`,
                          'improved',
                          improvement.improvedResumeText,
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:border-[var(--acc)] cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5 text-[var(--acc)]" />
                      <span>Save to History</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSendToScreener(
                          improvement.improvedResumeText,
                          activeCandidateName || 'Improved Resume',
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--acc)] text-[var(--on)] px-3 py-1.5 text-xs font-semibold cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Re-screen Draft</span>
                    </button>
                  </div>
                </div>
                <pre className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-4 text-xs font-mono-tabular text-[var(--ink)] whitespace-pre-wrap overflow-x-auto">
                  {improvement.improvedResumeText}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AI RESUME BUILDER */}
      {activeTab === 'build' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <form
            onSubmit={(e) => void handleRunBuilder(e)}
            className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6 space-y-4"
          >
            <div>
              <h3 className="text-lg font-semibold text-[var(--ink)]">AI Resume Builder</h3>
              <p className="text-xs text-[var(--mut)]">
                Enter your background in plain notes. Gemini structures a single-column, ATS-ready resume tailored to your target role.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--mut)] mb-1">Full name *</label>
                <input
                  type="text"
                  required
                  value={builderForm.fullName}
                  onChange={(e) => setBuilderForm({ ...builderForm, fullName: e.target.value })}
                  placeholder="Maya Rao"
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--ink)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--mut)] mb-1">Target role *</label>
                <input
                  type="text"
                  required
                  value={builderForm.targetRole}
                  onChange={(e) => setBuilderForm({ ...builderForm, targetRole: e.target.value })}
                  placeholder="Senior Frontend Engineer"
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--ink)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--mut)] mb-1">Email</label>
                <input
                  type="email"
                  value={builderForm.email}
                  onChange={(e) => setBuilderForm({ ...builderForm, email: e.target.value })}
                  placeholder="maya@email.com"
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--ink)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--mut)] mb-1">Phone</label>
                <input
                  type="text"
                  value={builderForm.phone}
                  onChange={(e) => setBuilderForm({ ...builderForm, phone: e.target.value })}
                  placeholder="+1 (555) 234-5678"
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--ink)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--mut)] mb-1">Location</label>
                <input
                  type="text"
                  value={builderForm.location}
                  onChange={(e) => setBuilderForm({ ...builderForm, location: e.target.value })}
                  placeholder="Austin, TX · Remote"
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--ink)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--mut)] mb-1">LinkedIn / GitHub</label>
                <input
                  type="text"
                  value={builderForm.links}
                  onChange={(e) => setBuilderForm({ ...builderForm, links: e.target.value })}
                  placeholder="linkedin.com/in/mayarao | github.com/mayarao"
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--ink)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--mut)] mb-1">
                Core skills &amp; tools
              </label>
              <input
                type="text"
                value={builderForm.skillsInput}
                onChange={(e) => setBuilderForm({ ...builderForm, skillsInput: e.target.value })}
                placeholder="React, TypeScript, Node.js, PostgreSQL, Docker, AWS, Jest"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--ink)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--mut)] mb-1">
                Experience notes (roles, companies, dates, achievements)
              </label>
              <textarea
                rows={4}
                value={builderForm.experienceInput}
                onChange={(e) => setBuilderForm({ ...builderForm, experienceInput: e.target.value })}
                placeholder="Frontend Engineer at Lumen (2021-Present): Built analytics dashboard in React & TS for 40k users, cut load time 38%, mentored 3 juniors..."
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-xs text-[var(--ink)] resize-y"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--mut)] mb-1">Education</label>
                <textarea
                  rows={2}
                  value={builderForm.educationInput}
                  onChange={(e) => setBuilderForm({ ...builderForm, educationInput: e.target.value })}
                  placeholder="B.S. Computer Science, 2020"
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-2.5 text-xs text-[var(--ink)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--mut)] mb-1">
                  Projects &amp; certifications
                </label>
                <textarea
                  rows={2}
                  value={builderForm.projectsInput}
                  onChange={(e) => setBuilderForm({ ...builderForm, projectsInput: e.target.value })}
                  placeholder="AWS Solutions Architect · Open-source UI kit"
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-2.5 text-xs text-[var(--ink)]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--acc)] text-[var(--on)] px-5 py-3 text-xs font-semibold hover:opacity-95 disabled:opacity-60 cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>{loading ? 'Generating ATS Resume…' : 'Generate ATS Resume'}</span>
            </button>
          </form>

          {/* Builder Preview */}
          <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6">
            {builtResume ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--line)]">
                  <div>
                    <h4 className="font-semibold text-base text-[var(--ink)]">
                      {builderForm.fullName}
                    </h4>
                    <p className="text-xs text-[var(--acc)] font-medium">{builtResume.headline}</p>
                    {builtPreviewCandidate && (
                      <p className="text-xs font-mono-tabular text-[var(--mut)] mt-0.5">
                        Live Score: {builtPreviewCandidate.score}/100 · ATS{' '}
                        {builtPreviewCandidate.atsChecks?.atsScore}/100 (Grade{' '}
                        {builtPreviewCandidate.atsChecks?.grade})
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        downloadFormattedResumePdf({
                          fullName: builderForm.fullName,
                          contactLine: [
                            builderForm.email,
                            builderForm.phone,
                            builderForm.location,
                            builderForm.links,
                          ]
                            .filter(Boolean)
                            .join(' | '),
                          structured: builtResume,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--acc)] text-[var(--on)] px-3 py-1.5 text-xs font-semibold cursor-pointer"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void saveVersionFromText(
                          `${builderForm.fullName} · ${builderForm.targetRole}`,
                          'built',
                          builtResume.formattedResumeText,
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:border-[var(--acc)] cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5 text-[var(--acc)]" />
                      <span>Save Version</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSendToScreener(builtResume.formattedResumeText, builderForm.fullName)
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:border-[var(--acc)] cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Screen</span>
                    </button>
                  </div>
                </div>

                <div className="rounded-xl bg-[var(--bg)] border border-[var(--line)] p-5 space-y-4 text-xs text-[var(--ink)]">
                  <div>
                    <div className="font-semibold text-[var(--mut)] uppercase mb-1">Summary</div>
                    <p className="leading-relaxed">{builtResume.professionalSummary}</p>
                  </div>
                  <div>
                    <div className="font-semibold text-[var(--mut)] uppercase mb-1">Skills</div>
                    <p className="font-mono-tabular">{builtResume.coreSkills.join(' · ')}</p>
                  </div>
                  <div>
                    <div className="font-semibold text-[var(--mut)] uppercase mb-2">Experience</div>
                    <div className="space-y-3">
                      {builtResume.experienceSections.map((exp, idx) => (
                        <div key={idx}>
                          <div className="flex justify-between font-semibold">
                            <span>
                              {exp.role} · {exp.company}
                            </span>
                            <span className="text-[var(--mut)] font-mono-tabular">{exp.duration}</span>
                          </div>
                          <ul className="list-disc pl-5 mt-1 space-y-1 text-[var(--mut)]">
                            {exp.bullets.map((b, bi) => (
                              <li key={bi}>{b}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                  {builtResume.projectHighlights.length > 0 && (
                    <div>
                      <div className="font-semibold text-[var(--mut)] uppercase mb-1">Projects</div>
                      <ul className="list-disc pl-5 space-y-1 text-[var(--mut)]">
                        {builtResume.projectHighlights.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {builtResume.educationLines.length > 0 && (
                    <div>
                      <div className="font-semibold text-[var(--mut)] uppercase mb-1">Education</div>
                      {builtResume.educationLines.map((e, i) => (
                        <div key={i}>{e}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-sm text-[var(--mut)]">
                Fill in your details on the left and click <strong>Generate ATS Resume</strong> to preview a clean single-column resume and export it as a formatted PDF.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: AI INTERVIEW PREPARATION */}
      {activeTab === 'interview' && (
        <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="text-lg font-semibold text-[var(--ink)]">AI Interview Preparation</h3>
              <p className="text-xs text-[var(--mut)]">
                Questions tailored directly to the candidate&apos;s resume projects, target role, and detected skill gaps.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {interviewPrep && (
                <button
                  type="button"
                  onClick={() => downloadInterviewPrepPdf(interviewPrep, activeTargetRole)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-2 text-xs font-semibold text-[var(--ink)] hover:border-[var(--acc)] cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
              )}
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleRunInterviewPrep()}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--acc)] text-[var(--on)] px-5 py-2.5 text-xs font-semibold hover:opacity-95 disabled:opacity-60 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{loading ? 'Preparing Questions…' : 'Generate Interview Guide'}</span>
              </button>
            </div>
          </div>

          {interviewPrep && (
            <div className="space-y-6 pt-4 border-t border-[var(--line)]">
              <div className="rounded-xl bg-[var(--bg)] border border-[var(--line)] p-4">
                <div className="text-xs font-semibold text-[var(--acc)] mb-1">
                  Focus: {interviewPrep.roleFocus}
                </div>
                <p className="text-sm text-[var(--ink)]">{interviewPrep.readinessNote}</p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-[var(--mut)] mb-3">
                  Technical &amp; Role-Specific Questions
                </h4>
                <div className="space-y-3">
                  {interviewPrep.technicalQuestions.map((q, idx) => (
                    <div key={idx} className="rounded-xl border border-[var(--line)] p-4 space-y-2">
                      <div className="font-semibold text-sm text-[var(--ink)]">
                        {idx + 1}. {q.question}
                      </div>
                      <p className="text-xs text-[var(--mut)]">
                        <strong>Why interviewers ask this:</strong> {q.whyAsked}
                      </p>
                      <div className="text-xs text-[var(--ink)]">
                        <strong>Strong answer signals:</strong> {q.strongAnswerSignals.join(' · ')}
                      </div>
                      <div className="text-xs text-[var(--acc)]">
                        <strong>STAR coaching tip:</strong> {q.starTip}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[var(--line)] p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-[var(--mut)]">Behavioral Prompts</h4>
                  {interviewPrep.behavioralQuestions.map((b, idx) => (
                    <div key={idx} className="border-t border-[var(--line)] first:border-t-0 pt-2.5 first:pt-0">
                      <div className="text-[11px] font-semibold uppercase text-[var(--acc)]">
                        {b.competency}
                      </div>
                      <div className="text-xs font-semibold text-[var(--ink)] mt-0.5">{b.question}</div>
                      <p className="text-xs text-[var(--mut)] mt-1">{b.starFrameworkTip}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-[var(--line)] p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-[var(--mut)]">Defending Skill Gaps</h4>
                  {interviewPrep.gapDefenseTalkingPoints.map((g, idx) => (
                    <div key={idx} className="border-t border-[var(--line)] first:border-t-0 pt-2.5 first:pt-0">
                      <div className="text-xs font-semibold text-[var(--bad)]">Gap: {g.gap}</div>
                      <p className="text-xs text-[var(--ink)] mt-0.5">{g.howToAddress}</p>
                    </div>
                  ))}

                  <div className="pt-3 border-t border-[var(--line)]">
                    <h4 className="text-xs font-semibold text-[var(--mut)] mb-1.5">
                      Questions to Ask the Interviewer
                    </h4>
                    <ul className="list-disc pl-5 space-y-1 text-xs text-[var(--ink)]">
                      {interviewPrep.questionsForInterviewer.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: CAREER RECOMMENDATIONS & PERSONALIZED LEARNING ROADMAP */}
      {activeTab === 'roadmap' && (
        <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="text-lg font-semibold text-[var(--ink)]">
                AI Career Recommendations &amp; Learning Roadmap
              </h3>
              <p className="text-xs text-[var(--mut)]">
                Next-step role matches, high-signal portfolio projects, and a structured study schedule closing skill gaps.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Roadmap duration"
                value={timeframeWeeks}
                onChange={(e) => setTimeframeWeeks(Number(e.target.value))}
                className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs font-medium text-[var(--ink)]"
              >
                <option value={4}>4-week sprint</option>
                <option value={6}>6-week plan</option>
                <option value={8}>8-week plan</option>
                <option value={12}>12-week mastery</option>
              </select>
              {careerRoadmap && (
                <button
                  type="button"
                  onClick={() => downloadCareerRoadmapPdf(careerRoadmap, activeTargetRole)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-2 text-xs font-semibold text-[var(--ink)] hover:border-[var(--acc)] cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
              )}
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleRunRoadmap()}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--acc)] text-[var(--on)] px-5 py-2.5 text-xs font-semibold hover:opacity-95 disabled:opacity-60 cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>{loading ? 'Building Roadmap…' : 'Generate Career Plan'}</span>
              </button>
            </div>
          </div>

          {careerRoadmap && (
            <div className="space-y-6 pt-4 border-t border-[var(--line)]">
              <div>
                <h4 className="text-xs font-semibold text-[var(--mut)] mb-3">
                  Recommended Career Paths
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {careerRoadmap.careerRecommendations.map((rec, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-4 flex flex-col justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-semibold text-[var(--ink)]">
                            {rec.roleTitle}
                          </span>
                          <span className="text-[11px] font-mono-tabular uppercase font-semibold text-[var(--acc)]">
                            {rec.fitLevel}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--mut)] mb-2">{rec.salaryBandNote}</div>
                        <p className="text-xs text-[var(--ink)]">{rec.rationale}</p>
                      </div>
                      {rec.missingSkills.length > 0 && (
                        <div className="pt-2 border-t border-[var(--line)] text-xs text-[var(--bad)]">
                          Gaps: {rec.missingSkills.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[var(--line)] p-4">
                  <h4 className="text-xs font-semibold text-[var(--mut)] mb-2">
                    Positioning &amp; Strategy
                  </h4>
                  <ul className="list-disc pl-5 space-y-1.5 text-xs text-[var(--ink)]">
                    {careerRoadmap.positioningAdvice.map((tip, i) => (
                      <li key={i}>{tip}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-[var(--line)] p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-[var(--mut)]">
                    High-Signal Portfolio Projects
                  </h4>
                  {careerRoadmap.recommendedProjects.map((proj, i) => (
                    <div key={i} className="border-t border-[var(--line)] first:border-t-0 pt-2 first:pt-0">
                      <div className="text-xs font-semibold text-[var(--ink)]">{proj.title}</div>
                      <p className="text-xs text-[var(--mut)] mt-0.5">{proj.description}</p>
                      <div className="text-[11px] font-mono-tabular text-[var(--acc)] mt-1">
                        {proj.skillsDemonstrated.join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-[var(--mut)] mb-3">
                  Personalized Learning Roadmap
                </h4>
                <div className="space-y-3">
                  {careerRoadmap.learningRoadmap.map((step, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-4"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                        <span className="text-sm font-semibold text-[var(--ink)]">
                          {step.weekLabel}: {step.focusSkill}
                        </span>
                        <span className="text-xs font-medium text-[var(--acc)]">
                          Milestone: {step.milestoneDeliverable}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--mut)] mb-2">{step.goal}</p>
                      <ul className="list-disc pl-5 space-y-0.5 text-xs text-[var(--ink)]">
                        {step.resourcesAndPractice.map((res, ri) => (
                          <li key={ri}>{res}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
