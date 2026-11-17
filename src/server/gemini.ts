import { GoogleGenAI, Type, type Schema } from '@google/genai';
import type {
  AiAnalyzeResult,
  AiBuildResumeInput,
  AiBuildResumeResult,
  AiCareerRoadmapResult,
  AiImproveResult,
  AiInterviewPrepResult,
} from '../shared/aiTypes.ts';

const MODEL_NAME = 'gemini-4-hydrogen';

export class GeminiServiceError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GeminiServiceError';
    this.status = status;
  }
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new GeminiServiceError(
      503,
      'Gemini AI is not configured yet. Set GEMINI_API_KEY in the Settings > Secrets panel and try again.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function mapGeminiError(err: unknown): GeminiServiceError {
  if (err instanceof GeminiServiceError) return err;
  const rawMessage = err instanceof Error ? err.message : String(err);
  const lower = rawMessage.toLowerCase();

  if (
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('permission_denied') ||
    lower.includes('403')
  ) {
    return new GeminiServiceError(
      403,
      'Gemini API key was rejected or lacks permission. Please verify GEMINI_API_KEY in Settings > Secrets.',
    );
  }
  if (lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota')) {
    return new GeminiServiceError(
      429,
      'Gemini API rate limit or quota reached. Please wait a moment and try again, or check billing in Settings > Secrets.',
    );
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return new GeminiServiceError(502, `Gemini model unavailable: ${rawMessage}`);
  }
  return new GeminiServiceError(502, `Gemini AI request failed: ${rawMessage}`);
}

async function generateStructuredJson<T>(
  systemInstruction: string,
  prompt: string,
  responseSchema: Schema,
): Promise<T> {
  const ai = getClient();
  let lastErr: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema,
        },
      });
      const text = (response.text ?? '').trim();
      if (!text) {
        throw new GeminiServiceError(502, 'Gemini returned an empty response.');
      }
      return JSON.parse(text) as T;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      const isTransient = msg.includes('429') || msg.includes('503') || msg.includes('unavailable');
      if (attempt === 0 && isTransient) {
        await new Promise((resolve) => setTimeout(resolve, 650));
        continue;
      }
      break;
    }
  }

  throw mapGeminiError(lastErr);
}

export async function analyzeResumeWithAi(params: {
  resumeText: string;
  targetRole?: string;
  jobDescription?: string;
}): Promise<AiAnalyzeResult> {
  const roleContext = params.targetRole && params.targetRole !== 'All Roles'
    ? params.targetRole
    : 'Best-fit software/technical or professional role';
  const jdBlock = params.jobDescription?.trim()
    ? `\n\nTARGET JOB DESCRIPTION:\n${params.jobDescription.trim().slice(0, 6000)}`
    : '\n\nNo job description was supplied (set jdAlignmentScore to 0 and jdKeywordSuggestions to general high-impact keywords for the target role).';

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      candidateSummary: { type: Type.STRING, description: '2-3 sentence objective executive summary of the candidate.' },
      executiveVerdict: { type: Type.STRING, description: 'Short hiring readiness verdict headline.' },
      atsReadinessScore: { type: Type.INTEGER, description: '0-100 ATS compatibility and clarity score.' },
      jdAlignmentScore: { type: Type.INTEGER, description: '0-100 alignment against the job description (0 if no JD provided).' },
      strengths: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Top 4-5 concrete strengths backed by resume evidence.' },
      redFlags: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Top 2-4 gaps, missing metrics, or ATS issues.' },
      skillGaps: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            skill: { type: Type.STRING },
            priority: { type: Type.STRING, description: 'Must be one of: high, medium, low' },
            reason: { type: Type.STRING },
            howToBridge: { type: Type.STRING },
          },
          required: ['skill', 'priority', 'reason', 'howToBridge'],
        },
      },
      jdKeywordSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
      sectionFeedback: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            section: { type: Type.STRING },
            rating: { type: Type.STRING, description: 'Must be one of: strong, moderate, needs_work' },
            feedback: { type: Type.STRING },
          },
          required: ['section', 'rating', 'feedback'],
        },
      },
    },
    required: [
      'candidateSummary',
      'executiveVerdict',
      'atsReadinessScore',
      'jdAlignmentScore',
      'strengths',
      'redFlags',
      'skillGaps',
      'jdKeywordSuggestions',
      'sectionFeedback',
    ],
  };

  const parsed = await generateStructuredJson<AiAnalyzeResult>(
    'You are a senior technical recruiter and ATS evaluation specialist. Be candid, specific, and evidence-grounded. Never invent credentials or employers not present in the resume. Keep arrays concise (3-6 items).',
    `TARGET ROLE: ${roleContext}\n\nRESUME TEXT:\n${params.resumeText.slice(0, 14000)}${jdBlock}`,
    schema,
  );

  return {
    ...parsed,
    jdAlignmentScore: params.jobDescription?.trim() ? parsed.jdAlignmentScore : null,
  };
}

export async function improveResumeWithAi(params: {
  resumeText: string;
  targetRole?: string;
  jobDescription?: string;
}): Promise<AiImproveResult> {
  const roleContext = params.targetRole && params.targetRole !== 'All Roles'
    ? params.targetRole
    : 'target role';
  const jdBlock = params.jobDescription?.trim()
    ? `\n\nJOB DESCRIPTION TO ALIGN WITH:\n${params.jobDescription.trim().slice(0, 5000)}`
    : '';

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      improvedSummary: { type: Type.STRING, description: 'Polished 3-sentence ATS professional summary.' },
      bulletRewrites: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            original: { type: Type.STRING },
            improved: { type: Type.STRING },
            impactReason: { type: Type.STRING },
          },
          required: ['original', 'improved', 'impactReason'],
        },
      },
      atsFixes: { type: Type.ARRAY, items: { type: Type.STRING } },
      keywordsAdded: { type: Type.ARRAY, items: { type: Type.STRING } },
      improvedResumeText: {
        type: Type.STRING,
        description: 'Complete ATS-formatted plain-text resume ready for copying or re-screening with clear section headers (Summary, Experience, Skills, Education, Projects).',
      },
    },
    required: ['improvedSummary', 'bulletRewrites', 'atsFixes', 'keywordsAdded', 'improvedResumeText'],
  };

  return generateStructuredJson<AiImproveResult>(
    'You are an executive ATS resume writer. Rewrite weak bullets into crisp STAR-style quantified bullets using realistic metric placeholders like [X%] only when the source text lacks numbers, without fabricating false employers or degrees. Provide 4-6 high-impact bullet rewrites.',
    `TARGET ROLE: ${roleContext}\n\nORIGINAL RESUME:\n${params.resumeText.slice(0, 14000)}${jdBlock}`,
    schema,
  );
}

export async function buildResumeWithAi(input: AiBuildResumeInput): Promise<AiBuildResumeResult> {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      headline: { type: Type.STRING },
      professionalSummary: { type: Type.STRING },
      coreSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
      experienceSections: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            role: { type: Type.STRING },
            company: { type: Type.STRING },
            duration: { type: Type.STRING },
            bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['role', 'company', 'duration', 'bullets'],
        },
      },
      educationLines: { type: Type.ARRAY, items: { type: Type.STRING } },
      projectHighlights: { type: Type.ARRAY, items: { type: Type.STRING } },
      formattedResumeText: {
        type: Type.STRING,
        description: 'Complete ATS-friendly plain-text resume with contact header, Summary, Experience, Skills, Education, and Projects sections.',
      },
    },
    required: [
      'headline',
      'professionalSummary',
      'coreSkills',
      'experienceSections',
      'educationLines',
      'projectHighlights',
      'formattedResumeText',
    ],
  };

  const jdPart = input.jobDescription?.trim()
    ? `\nTarget Job Description:\n${input.jobDescription.trim().slice(0, 4000)}`
    : '';

  const prompt = `Build an ATS-optimized resume from these candidate inputs:
Full Name: ${input.fullName.slice(0, 120)}
Email: ${input.email.slice(0, 120)}
Phone: ${input.phone.slice(0, 60)}
Location: ${input.location.slice(0, 120)}
Links: ${input.links.slice(0, 300)}
Target Role: ${input.targetRole.slice(0, 120)}
Years of Experience: ${input.yearsExperience.slice(0, 40)}
Summary Notes: ${input.summaryInput.slice(0, 1500)}
Skills List: ${input.skillsInput.slice(0, 1500)}
Experience Details: ${input.experienceInput.slice(0, 6000)}
Education: ${input.educationInput.slice(0, 1500)}
Projects / Certifications: ${input.projectsInput.slice(0, 2500)}${jdPart}`;

  return generateStructuredJson<AiBuildResumeResult>(
    'You are an ATS resume architect. Turn structured career notes into a clean, single-column, action-verb-driven resume tailored to the target role without inventing fake degrees or companies.',
    prompt,
    schema,
  );
}

export async function generateInterviewPrepWithAi(params: {
  resumeText: string;
  targetRole?: string;
  jobDescription?: string;
}): Promise<AiInterviewPrepResult> {
  const roleContext = params.targetRole && params.targetRole !== 'All Roles'
    ? params.targetRole
    : 'target role';
  const jdBlock = params.jobDescription?.trim()
    ? `\n\nJOB DESCRIPTION:\n${params.jobDescription.trim().slice(0, 5000)}`
    : '';

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      roleFocus: { type: Type.STRING },
      readinessNote: { type: Type.STRING },
      technicalQuestions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            whyAsked: { type: Type.STRING },
            strongAnswerSignals: { type: Type.ARRAY, items: { type: Type.STRING } },
            starTip: { type: Type.STRING },
          },
          required: ['question', 'whyAsked', 'strongAnswerSignals', 'starTip'],
        },
      },
      behavioralQuestions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            competency: { type: Type.STRING },
            starFrameworkTip: { type: Type.STRING },
          },
          required: ['question', 'competency', 'starFrameworkTip'],
        },
      },
      gapDefenseTalkingPoints: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            gap: { type: Type.STRING },
            howToAddress: { type: Type.STRING },
          },
          required: ['gap', 'howToAddress'],
        },
      },
      questionsForInterviewer: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: [
      'roleFocus',
      'readinessNote',
      'technicalQuestions',
      'behavioralQuestions',
      'gapDefenseTalkingPoints',
      'questionsForInterviewer',
    ],
  };

  return generateStructuredJson<AiInterviewPrepResult>(
    'You are a principal hiring manager designing a tailored interview prep guide. Base questions on the candidate actual experience and likely skill gaps (4 technical questions, 3 behavioral questions, 3 gap defenses, 4 smart questions to ask).',
    `TARGET ROLE: ${roleContext}\n\nCANDIDATE RESUME:\n${params.resumeText.slice(0, 12000)}${jdBlock}`,
    schema,
  );
}

export async function generateCareerRoadmapWithAi(params: {
  resumeText: string;
  targetRole?: string;
  jobDescription?: string;
  timeframeWeeks?: number;
}): Promise<AiCareerRoadmapResult> {
  const weeks = Math.min(12, Math.max(4, params.timeframeWeeks || 6));
  const roleContext = params.targetRole && params.targetRole !== 'All Roles'
    ? params.targetRole
    : 'high-growth roles matching background';
  const jdBlock = params.jobDescription?.trim()
    ? `\n\nJOB DESCRIPTION:\n${params.jobDescription.trim().slice(0, 5000)}`
    : '';

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      careerRecommendations: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            roleTitle: { type: Type.STRING },
            fitLevel: { type: Type.STRING, description: 'Must be one of: high, stretch, adjacent' },
            salaryBandNote: { type: Type.STRING },
            rationale: { type: Type.STRING },
            missingSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['roleTitle', 'fitLevel', 'salaryBandNote', 'rationale', 'missingSkills'],
        },
      },
      positioningAdvice: { type: Type.ARRAY, items: { type: Type.STRING } },
      recommendedProjects: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            skillsDemonstrated: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['title', 'description', 'skillsDemonstrated'],
        },
      },
      learningRoadmap: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            weekLabel: { type: Type.STRING },
            focusSkill: { type: Type.STRING },
            goal: { type: Type.STRING },
            resourcesAndPractice: { type: Type.ARRAY, items: { type: Type.STRING } },
            milestoneDeliverable: { type: Type.STRING },
          },
          required: ['weekLabel', 'focusSkill', 'goal', 'resourcesAndPractice', 'milestoneDeliverable'],
        },
      },
    },
    required: ['careerRecommendations', 'positioningAdvice', 'recommendedProjects', 'learningRoadmap'],
  };

  return generateStructuredJson<AiCareerRoadmapResult>(
    `You are a career coach and technical mentor. Recommend 3 realistic next career tracks (high-fit, adjacent, stretch), 2-3 high-signal portfolio projects, and a structured ${weeks}-week personalized learning roadmap closing exact resume/JD skill gaps.`,
    `TARGET ROLE: ${roleContext}\nROADMAP DURATION: ${weeks} weeks\n\nCANDIDATE RESUME:\n${params.resumeText.slice(0, 12000)}${jdBlock}`,
    schema,
  );
}
