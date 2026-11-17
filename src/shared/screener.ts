export interface SkillCategoryDef {
  category: string;
  skills: Array<{
    name: string;
    aliases: string[];
  }>;
}

export interface RoleDefinition {
  id?: string;
  title: string;
  skills: string[];
  isCustom?: boolean;
}

export interface ResumeInput {
  name: string;
  text: string;
  sourceFileName?: string;
}

export interface ScoreBreakdownItem {
  label: string;
  points: number;
  max: number;
}

export interface CategoryCountItem {
  category: string;
  count: number;
  total: number;
}

export interface MatchedJobItem {
  title: string;
  pct: number;
  matched: string[];
  missing: string[];
}

export interface RecommendedSkillItem {
  skill: string;
  role: string;
}

export interface ScreenedCandidateResult {
  id: string;
  name: string;
  sourceFileName?: string;
  score: number;
  verdict: string;
  yearsExperience: number;
  skillsCount: number;
  measurableResults: number;
  wordCount: number;
  strongestArea: string;
  weakestArea: string;
  prefix: string;
  detectedSkills: string[];
  breakdown: ScoreBreakdownItem[];
  categoryCounts: CategoryCountItem[];
  matchedJobs: MatchedJobItem[];
  recommendedSkills: RecommendedSkillItem[];
  tips: string[];
  rawTextPreview: string;
}

export interface PoolAggregateItem {
  name: string;
  count: number;
}

export interface ScreeningPoolResponse {
  candidateCount: number;
  averageScore: number;
  targetRole: string;
  topSkills: PoolAggregateItem[];
  topGaps: PoolAggregateItem[];
  candidates: ScreenedCandidateResult[];
}

const RAW_CATEGORIES: Record<string, string> = {
  Languages:
    'javascript|js|ecmascript;typescript;python;java;c#|csharp;golang;rust;php;ruby;sql|postgresql|mysql',
  Frontend:
    'react|reactjs|react.js;vue|vue.js;angular;next.js|nextjs;html;css|sass|tailwind;redux',
  Backend:
    'node.js|nodejs|node;express;django;flask;spring boot|spring framework;graphql;rest api|rest apis|restful;microservices',
  'Cloud and DevOps':
    'aws|amazon web services;azure;gcp|google cloud;docker;kubernetes|k8s;terraform;ci/cd|jenkins|github actions;linux',
  'Data and ML':
    'machine learning;tensorflow;pytorch;pandas;data analysis;tableau;power bi;spark;nlp;statistics',
  Practice:
    'git;agile|scrum;jira;leadership|mentoring|team lead;communication;testing|jest|cypress|unit testing;figma;seo;excel;project management',
};

interface InternalSkill {
  name: string;
  category: string;
  aliases: string[];
  patterns: RegExp[];
}

function buildPattern(alias: string): RegExp {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9+#])${escaped}(?![a-z0-9+#])`);
}

const INTERNAL_SKILLS: InternalSkill[] = [];
export const SKILL_CATEGORIES: SkillCategoryDef[] = Object.entries(RAW_CATEGORIES).map(
  ([category, raw]) => {
    const skills = raw.split(';').map((entry) => {
      const aliases = entry.split('|');
      const name = aliases[0];
      INTERNAL_SKILLS.push({
        name,
        category,
        aliases,
        patterns: aliases.map(buildPattern),
      });
      return { name, aliases };
    });
    return { category, skills };
  },
);

export const ALL_SKILLS: string[] = INTERNAL_SKILLS.map((s) => s.name);

const ACTION_VERBS =
  'led,built,designed,developed,launched,managed,improved,reduced,increased,created,delivered,implemented,optimized,migrated,automated,mentored,architected,deployed,analyzed,drove,owned,scaled,shipped,established,collaborated'.split(
    ',',
  );

const SECTIONS: Record<string, RegExp> = {
  Summary: /\b(summary|profile|objective|about me)\b/,
  Experience: /\b(experience|employment|work history)\b/,
  Education: /\b(education|university|college|b\.?tech|bachelor|master)\b/,
  Skills: /\b(skills|technologies|tech stack|tools)\b/,
  Projects: /\b(projects|certifications?|achievements)\b/,
};

export const DEFAULT_ROLES: RoleDefinition[] = [
  {
    title: 'Frontend Developer',
    skills: ['javascript', 'typescript', 'react', 'html', 'css', 'git', 'testing', 'redux'],
  },
  {
    title: 'Full Stack Developer',
    skills: ['javascript', 'typescript', 'react', 'node.js', 'sql', 'rest api', 'docker', 'git'],
  },
  {
    title: 'Backend Engineer',
    skills: ['node.js', 'python', 'sql', 'rest api', 'microservices', 'docker', 'git', 'aws'],
  },
  {
    title: 'DevOps Engineer',
    skills: ['linux', 'docker', 'kubernetes', 'terraform', 'ci/cd', 'aws', 'git', 'python'],
  },
  {
    title: 'Cloud Engineer',
    skills: ['aws', 'azure', 'gcp', 'terraform', 'docker', 'kubernetes', 'linux'],
  },
  {
    title: 'Data Analyst',
    skills: ['sql', 'excel', 'tableau', 'power bi', 'python', 'pandas', 'statistics', 'data analysis'],
  },
  {
    title: 'Data Scientist',
    skills: ['python', 'pandas', 'machine learning', 'statistics', 'sql', 'tensorflow', 'pytorch', 'nlp'],
  },
  {
    title: 'Machine Learning Engineer',
    skills: ['python', 'machine learning', 'pytorch', 'tensorflow', 'docker', 'aws', 'git', 'sql'],
  },
  {
    title: 'UI/UX Designer',
    skills: ['figma', 'html', 'css', 'communication', 'agile', 'project management'],
  },
  {
    title: 'Project Manager',
    skills: ['project management', 'agile', 'jira', 'leadership', 'communication', 'excel'],
  },
  {
    title: 'Digital Marketer',
    skills: ['seo', 'excel', 'data analysis', 'communication', 'project management'],
  },
];

export const SAMPLE_RESUMES = `Maya Rao
maya.rao@email.com | +91 98765 43210 | linkedin.com/in/mayarao
Summary
Frontend engineer with 7 years of experience.
Experience
Senior Engineer, Lumen 2019 - Present
- Built React and TypeScript dashboards used by 40k users and cut load time by 38%.
- Led a team of 4, mentored juniors and shipped CI/CD pipelines on AWS with Docker.
Education
B.Tech Computer Science, 2017
Skills
React, TypeScript, Redux, Jest, GraphQL, AWS, Docker, Git, Agile
---
Daniel Kim
3 years as a developer. Vue.js, JavaScript, Node.js, Express, REST. Worked on websites.
---
Priya Nair
priya@email.com
Experience 2018 - 2024
Analyzed sales data with Python, pandas, SQL and Tableau, improving forecast accuracy by 22%. Built machine learning models with PyTorch.
Skills
Statistics, Excel, Python, SQL`;

function extractExplicitYears(text: string): number {
  const matches = [...text.matchAll(/(\d{1,2})\+?\s*(?:years|yrs)/gi)].map((m) => Number(m[1]));
  return matches.length ? Math.max(...matches) : 0;
}

function extractDateSpanYears(text: string): number {
  const starts: number[] = [];
  const ends: number[] = [];
  const currentYear = new Date().getFullYear();
  for (const m of text.matchAll(
    /\b((?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:19|20)\d{2}|present|current|now)\b/gi,
  )) {
    starts.push(Number(m[1]));
    ends.push(/\d/.test(m[2]) ? Number(m[2]) : currentYear);
  }
  return starts.length ? Math.max(0, Math.max(...ends) - Math.min(...starts)) : 0;
}

function findSkills(text: string): InternalSkill[] {
  const lower = text.toLowerCase();
  return INTERNAL_SKILLS.filter((skill) => skill.patterns.some((pattern) => pattern.test(lower)));
}

export function parsePastedResumes(raw: string): ResumeInput[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/^\s*---+\s*$/m)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, idx) => {
      const firstLine = chunk.split('\n')[0].trim();
      const name = firstLine.length > 0 && firstLine.length <= 45 ? firstLine : `Candidate ${idx + 1}`;
      return { name, text: chunk };
    });
}

function makeCandidateId(index: number, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return `cand_${index + 1}_${slug || 'resume'}_${Date.now().toString(36).slice(-4)}`;
}

export function screenCandidate(
  input: ResumeInput,
  index: number,
  customRoles: RoleDefinition[] = [],
  targetRoleTitle = '',
): ScreenedCandidateResult {
  const text = input.text.trim();
  const lower = text.toLowerCase();
  const detected = findSkills(text);
  const words = text ? text.split(/\s+/).length : 0;
  const yearsExp = Math.max(extractExplicitYears(text), extractDateSpanYears(text));
  const foundSections = Object.keys(SECTIONS).filter((key) => SECTIONS[key].test(lower));

  const hasEmail = /[\w.+-]+@[\w-]+\.[\w.]+/.test(text);
  const hasPhone = /\+?\d[\d\s().-]{8,}\d/.test(text);
  const hasLink = /linkedin\.com|github\.com|portfolio/i.test(text);

  const metricsCount = (text.match(/\d+(?:\.\d+)?\s*(?:%|k\b|m\b|x\b)|[$₹€£]\s?\d/gi) || []).length;
  const verbsCount = ACTION_VERBS.filter((verb) => new RegExp(`\\b${verb}\\b`).test(lower)).length;

  const breakdown: ScoreBreakdownItem[] = [
    { label: 'Skills breadth', points: Math.min(30, detected.length * 3), max: 30 },
    { label: 'Experience', points: Math.min(15, Math.round(yearsExp * 3)), max: 15 },
    { label: 'Resume sections', points: foundSections.length * 4, max: 20 },
    {
      label: 'Contact info',
      points: (hasEmail ? 5 : 0) + (hasPhone ? 3 : 0) + (hasLink ? 2 : 0),
      max: 10,
    },
    { label: 'Measurable results', points: Math.min(15, metricsCount * 3), max: 15 },
    { label: 'Action verbs', points: Math.min(10, Math.round(verbsCount * 1.5)), max: 10 },
  ];

  const score = breakdown.reduce((sum, item) => sum + item.points, 0);
  const verdict =
    score >= 75 ? 'Strong resume' : score >= 50 ? 'Good, with room to grow' : 'Needs work';

  const catCountsMap: Record<string, number> = {};
  for (const sk of detected) {
    catCountsMap[sk.category] = (catCountsMap[sk.category] || 0) + 1;
  }

  const categoryCounts: CategoryCountItem[] = SKILL_CATEGORIES.map((c) => ({
    category: c.category,
    count: catCountsMap[c.category] || 0,
    total: c.skills.length,
  }));

  const tips: string[] = [];
  if (detected.length === 0) {
    tips.push('No known skills were detected. List specific tools and technologies.');
  } else if (detected.length < 6) {
    tips.push('List more specific tools and technologies.');
  }
  if (!hasEmail) tips.push('Add an email address so recruiters can reach you.');
  if (!hasPhone) tips.push('Add a phone number.');
  if (!hasLink) tips.push('Link your LinkedIn, GitHub or portfolio.');
  Object.keys(SECTIONS)
    .filter((k) => !foundSections.includes(k))
    .forEach((k) => tips.push(`Add a ${k.toLowerCase()} section.`));
  if (metricsCount < 3) {
    tips.push('Quantify results with numbers, such as "cut load time by 40%".');
  }
  if (verbsCount < 5) {
    tips.push('Start bullets with action verbs like built, led or reduced.');
  }
  if (words < 150) {
    tips.push('The resume is short. Add detail on responsibilities and results.');
  }
  if (words > 1000) {
    tips.push('The resume is long. Aim for one or two pages.');
  }

  const haveSet = new Set(detected.map((s) => s.name));
  const prefix = yearsExp >= 6 ? 'Senior ' : yearsExp >= 3 ? '' : 'Junior ';

  const allRoles = [...customRoles, ...DEFAULT_ROLES];
  const normalizedRoles = allRoles.filter(
    (role, idx, arr) =>
      arr.findIndex((r) => r.title.toLowerCase() === role.title.toLowerCase()) === idx,
  );

  const computedJobs: MatchedJobItem[] = normalizedRoles
    .map((role) => {
      const normalizedSkills = role.skills.map((s) => s.toLowerCase().trim()).filter(Boolean);
      const matched = normalizedSkills.filter((s) => haveSet.has(s) || lower.includes(s));
      const missing = normalizedSkills.filter((s) => !matched.includes(s));
      const pct = normalizedSkills.length ? Math.round((matched.length / normalizedSkills.length) * 100) : 0;
      return {
        title: role.title,
        pct,
        matched,
        missing,
      };
    })
    .sort((a, b) => b.pct - a.pct || a.missing.length - b.missing.length);

  let matchedJobs: MatchedJobItem[];
  if (targetRoleTitle && targetRoleTitle !== 'All Roles') {
    const pinned = computedJobs.find(
      (j) => j.title.toLowerCase() === targetRoleTitle.toLowerCase(),
    );
    const others = computedJobs
      .filter((j) => j.title.toLowerCase() !== targetRoleTitle.toLowerCase() && j.pct >= 25)
      .slice(0, 2);
    matchedJobs = pinned ? [pinned, ...others] : computedJobs.filter((j) => j.pct >= 25).slice(0, 3);
  } else {
    matchedJobs = computedJobs.filter((j) => j.pct >= 25).slice(0, 3);
  }

  const recommendedSkills: RecommendedSkillItem[] = [];
  matchedJobs.forEach((job, jobIndex) => {
    job.missing.slice(0, jobIndex === 0 ? 5 : 2).forEach((skill) => {
      if (!recommendedSkills.some((r) => r.skill === skill)) {
        recommendedSkills.push({ skill, role: job.title });
      }
    });
  });

  const ratios = breakdown
    .map((item) => ({ label: item.label, ratio: item.points / item.max }))
    .sort((a, b) => b.ratio - a.ratio);

  return {
    id: makeCandidateId(index, input.name),
    name: input.name.slice(0, 120),
    sourceFileName: input.sourceFileName ? input.sourceFileName.slice(0, 200) : undefined,
    score,
    verdict,
    yearsExperience: yearsExp,
    skillsCount: detected.length,
    measurableResults: metricsCount,
    wordCount: words,
    strongestArea: ratios[0]?.label || 'Skills breadth',
    weakestArea: ratios[ratios.length - 1]?.label || 'Measurable results',
    prefix,
    detectedSkills: detected.map((s) => s.name).slice(0, 80),
    breakdown,
    categoryCounts,
    matchedJobs: matchedJobs.slice(0, 5),
    recommendedSkills: recommendedSkills.slice(0, 15),
    tips: tips.slice(0, 10),
    rawTextPreview: text.slice(0, 2400),
  };
}

export function screenPool(
  inputs: ResumeInput[],
  customRoles: RoleDefinition[] = [],
  targetRoleTitle = 'All Roles',
): ScreeningPoolResponse {
  const candidates = inputs
    .filter((i) => i.text && i.text.trim().length > 0)
    .slice(0, 50)
    .map((input, idx) => screenCandidate(input, idx, customRoles, targetRoleTitle))
    .sort((a, b) => {
      if (targetRoleTitle && targetRoleTitle !== 'All Roles') {
        const aTarget = a.matchedJobs.find(
          (j) => j.title.toLowerCase() === targetRoleTitle.toLowerCase(),
        )?.pct ?? 0;
        const bTarget = b.matchedJobs.find(
          (j) => j.title.toLowerCase() === targetRoleTitle.toLowerCase(),
        )?.pct ?? 0;
        if (bTarget !== aTarget) return bTarget - aTarget;
      }
      return b.score - a.score;
    });

  const averageScore = candidates.length
    ? Math.round(candidates.reduce((acc, c) => acc + c.score, 0) / candidates.length)
    : 0;

  const skillTotals: Record<string, number> = {};
  const gapTotals: Record<string, number> = {};

  for (const cand of candidates) {
    for (const sk of cand.detectedSkills) {
      skillTotals[sk] = (skillTotals[sk] || 0) + 1;
    }
    for (const rec of cand.recommendedSkills) {
      gapTotals[rec.skill] = (gapTotals[rec.skill] || 0) + 1;
    }
  }

  const topSkills = Object.entries(skillTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  const topGaps = Object.entries(gapTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  return {
    candidateCount: candidates.length,
    averageScore,
    targetRole: targetRoleTitle || 'All Roles',
    topSkills,
    topGaps,
    candidates,
  };
}
