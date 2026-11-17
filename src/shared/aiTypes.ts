export interface AiSkillGapItem {
  skill: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  howToBridge: string;
}

export interface AiSectionFeedback {
  section: string;
  rating: 'strong' | 'moderate' | 'needs_work';
  feedback: string;
}

export interface AiAnalyzeResult {
  candidateSummary: string;
  executiveVerdict: string;
  atsReadinessScore: number;
  jdAlignmentScore: number | null;
  strengths: string[];
  redFlags: string[];
  skillGaps: AiSkillGapItem[];
  jdKeywordSuggestions: string[];
  sectionFeedback: AiSectionFeedback[];
}

export interface AiBulletRewrite {
  original: string;
  improved: string;
  impactReason: string;
}

export interface AiImproveResult {
  improvedSummary: string;
  bulletRewrites: AiBulletRewrite[];
  atsFixes: string[];
  keywordsAdded: string[];
  improvedResumeText: string;
}

export interface AiBuildResumeInput {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  links: string;
  targetRole: string;
  yearsExperience: string;
  summaryInput: string;
  skillsInput: string;
  experienceInput: string;
  educationInput: string;
  projectsInput: string;
  jobDescription?: string;
}

export interface AiBuiltExperienceSection {
  role: string;
  company: string;
  duration: string;
  bullets: string[];
}

export interface AiBuildResumeResult {
  headline: string;
  professionalSummary: string;
  coreSkills: string[];
  experienceSections: AiBuiltExperienceSection[];
  educationLines: string[];
  projectHighlights: string[];
  formattedResumeText: string;
}

export interface AiTechnicalQuestion {
  question: string;
  whyAsked: string;
  strongAnswerSignals: string[];
  starTip: string;
}

export interface AiBehavioralQuestion {
  question: string;
  competency: string;
  starFrameworkTip: string;
}

export interface AiGapDefenseItem {
  gap: string;
  howToAddress: string;
}

export interface AiInterviewPrepResult {
  roleFocus: string;
  readinessNote: string;
  technicalQuestions: AiTechnicalQuestion[];
  behavioralQuestions: AiBehavioralQuestion[];
  gapDefenseTalkingPoints: AiGapDefenseItem[];
  questionsForInterviewer: string[];
}

export interface AiCareerRecommendation {
  roleTitle: string;
  fitLevel: 'high' | 'stretch' | 'adjacent';
  salaryBandNote: string;
  rationale: string;
  missingSkills: string[];
}

export interface AiRecommendedProject {
  title: string;
  description: string;
  skillsDemonstrated: string[];
}

export interface AiRoadmapWeek {
  weekLabel: string;
  focusSkill: string;
  goal: string;
  resourcesAndPractice: string[];
  milestoneDeliverable: string;
}

export interface AiCareerRoadmapResult {
  careerRecommendations: AiCareerRecommendation[];
  positioningAdvice: string[];
  recommendedProjects: AiRecommendedProject[];
  learningRoadmap: AiRoadmapWeek[];
}
