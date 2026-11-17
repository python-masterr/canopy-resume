import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  ALL_SKILLS,
  DEFAULT_ROLES,
  SKILL_CATEGORIES,
  screenPool,
  type ResumeInput,
  type RoleDefinition,
} from './src/shared/screener.ts';
import type { AiBuildResumeInput } from './src/shared/aiTypes.ts';
import {
  GeminiServiceError,
  analyzeResumeWithAi,
  buildResumeWithAi,
  generateCareerRoadmapWithAi,
  generateInterviewPrepWithAi,
  improveResumeWithAi,
} from './src/server/gemini.ts';

dotenv.config();

const workerPath = path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
const cMapUrl = `${pathToFileURL(path.resolve(process.cwd(), 'node_modules/pdfjs-dist/cmaps')).href}/`;
const standardFontDataUrl = `${pathToFileURL(path.resolve(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts')).href}/`;
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '4mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 20,
    fileSize: 10 * 1024 * 1024,
  },
});

async function extractPdfText(buffer: Buffer): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    cMapUrl,
    cMapPacked: true,
    standardFontDataUrl,
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;
  try {
    const pages: string[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      let lastY: number | null = null;
      const chunks: string[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const currentY = Array.isArray(item.transform) ? Number(item.transform[5]) : null;
        if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 3) {
          chunks.push('\n');
        }
        chunks.push(item.str);
        chunks.push(item.hasEOL ? '\n' : ' ');
        if (currentY !== null) lastY = currentY;
      }
      pages.push(chunks.join('').replace(/[ \t]+\n/g, '\n'));
    }
    return pages.join('\n');
  } finally {
    await loadingTask.destroy();
  }
}

async function extractFileText(file: Express.Multer.File): Promise<string> {
  const ext = (file.originalname.split('.').pop() || '').toLowerCase();
  if (ext === 'txt' || ext === 'md') {
    return file.buffer.toString('utf8');
  }
  if (ext === 'pdf') {
    return extractPdfText(file.buffer);
  }
  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }
  if (ext === 'doc') {
    throw new Error('Legacy .doc files are not supported. Please save as DOCX or PDF.');
  }
  throw new Error('Unsupported file format. Upload PDF, DOCX, TXT, or MD.');
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'canopy-backend', timestamp: new Date().toISOString() });
});

app.get('/api/taxonomy', (_req, res) => {
  res.json({
    categories: SKILL_CATEGORIES,
    skills: ALL_SKILLS,
    roles: DEFAULT_ROLES,
  });
});

app.post('/api/extract-text', upload.array('files', 20), async (req, res) => {
  const uploaded = (req.files as Express.Multer.File[] | undefined) || [];
  if (!uploaded.length) {
    res.status(400).json({ error: 'No files were uploaded.' });
    return;
  }

  const results = await Promise.all(
    uploaded.map(async (file) => {
      const cleanName =
        file.originalname
          .replace(/\.[^.]+$/, '')
          .replace(/[_-]+/g, ' ')
          .trim()
          .slice(0, 60) || 'Resume';
      try {
        const raw = await extractFileText(file);
        const text = raw.replace(/[ \t]+\n/g, '\n').trim();
        if (!text) {
          return {
            name: cleanName,
            fileName: file.originalname,
            text: '',
            wordCount: 0,
            error: 'No readable text found. Scanned PDFs require OCR.',
          };
        }
        return {
          name: cleanName,
          fileName: file.originalname,
          text,
          wordCount: text.split(/\s+/).length,
        };
      } catch (err) {
        return {
          name: cleanName,
          fileName: file.originalname,
          text: '',
          wordCount: 0,
          error: err instanceof Error ? err.message : 'Failed to parse file.',
        };
      }
    }),
  );

  res.json({ files: results });
});

app.post('/api/screen', (req, res) => {
  const body = req.body as {
    resumes?: ResumeInput[];
    customRoles?: RoleDefinition[];
    targetRole?: string;
    jobDescription?: string;
  };

  if (!body || !Array.isArray(body.resumes) || body.resumes.length === 0) {
    res.status(400).json({ error: 'Provide at least one resume to analyze.' });
    return;
  }

  const validResumes = body.resumes
    .filter((r) => r && typeof r.text === 'string' && r.text.trim().length > 0)
    .slice(0, 50)
    .map((r, idx) => ({
      name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : `Candidate ${idx + 1}`,
      text: r.text,
      sourceFileName: typeof r.sourceFileName === 'string' ? r.sourceFileName : undefined,
    }));

  if (!validResumes.length) {
    res.status(400).json({ error: 'No non-empty resume text found.' });
    return;
  }

  const customRoles = Array.isArray(body.customRoles)
    ? body.customRoles.filter(
        (role) => role && typeof role.title === 'string' && Array.isArray(role.skills),
      )
    : [];

  const targetRole = typeof body.targetRole === 'string' ? body.targetRole : 'All Roles';
  const jobDescription = typeof body.jobDescription === 'string' ? body.jobDescription : '';
  const result = screenPool(validResumes, customRoles, targetRole, jobDescription);
  res.json(result);
});

function handleAiError(res: express.Response, err: unknown) {
  if (err instanceof GeminiServiceError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Unexpected AI service error.';
  res.status(500).json({ error: message });
}

app.post('/api/ai/analyze', async (req, res) => {
  const body = req.body as { resumeText?: string; targetRole?: string; jobDescription?: string };
  if (!body?.resumeText || typeof body.resumeText !== 'string' || !body.resumeText.trim()) {
    res.status(400).json({ error: 'Provide resume text to run AI analysis.' });
    return;
  }
  try {
    const result = await analyzeResumeWithAi({
      resumeText: body.resumeText,
      targetRole: typeof body.targetRole === 'string' ? body.targetRole : '',
      jobDescription: typeof body.jobDescription === 'string' ? body.jobDescription : '',
    });
    res.json(result);
  } catch (err) {
    handleAiError(res, err);
  }
});

app.post('/api/ai/improve', async (req, res) => {
  const body = req.body as { resumeText?: string; targetRole?: string; jobDescription?: string };
  if (!body?.resumeText || typeof body.resumeText !== 'string' || !body.resumeText.trim()) {
    res.status(400).json({ error: 'Provide resume text to generate AI improvements.' });
    return;
  }
  try {
    const result = await improveResumeWithAi({
      resumeText: body.resumeText,
      targetRole: typeof body.targetRole === 'string' ? body.targetRole : '',
      jobDescription: typeof body.jobDescription === 'string' ? body.jobDescription : '',
    });
    res.json(result);
  } catch (err) {
    handleAiError(res, err);
  }
});

app.post('/api/ai/build-resume', async (req, res) => {
  const body = req.body as Partial<AiBuildResumeInput>;
  if (!body?.fullName?.trim() || !body?.targetRole?.trim()) {
    res.status(400).json({ error: 'Full name and target role are required to build a resume.' });
    return;
  }
  try {
    const result = await buildResumeWithAi({
      fullName: String(body.fullName || ''),
      email: String(body.email || ''),
      phone: String(body.phone || ''),
      location: String(body.location || ''),
      links: String(body.links || ''),
      targetRole: String(body.targetRole || ''),
      yearsExperience: String(body.yearsExperience || ''),
      summaryInput: String(body.summaryInput || ''),
      skillsInput: String(body.skillsInput || ''),
      experienceInput: String(body.experienceInput || ''),
      educationInput: String(body.educationInput || ''),
      projectsInput: String(body.projectsInput || ''),
      jobDescription: typeof body.jobDescription === 'string' ? body.jobDescription : '',
    });
    res.json(result);
  } catch (err) {
    handleAiError(res, err);
  }
});

app.post('/api/ai/interview-prep', async (req, res) => {
  const body = req.body as { resumeText?: string; targetRole?: string; jobDescription?: string };
  if (!body?.resumeText || typeof body.resumeText !== 'string' || !body.resumeText.trim()) {
    res.status(400).json({ error: 'Provide resume text to generate tailored interview questions.' });
    return;
  }
  try {
    const result = await generateInterviewPrepWithAi({
      resumeText: body.resumeText,
      targetRole: typeof body.targetRole === 'string' ? body.targetRole : '',
      jobDescription: typeof body.jobDescription === 'string' ? body.jobDescription : '',
    });
    res.json(result);
  } catch (err) {
    handleAiError(res, err);
  }
});

app.post('/api/ai/career-roadmap', async (req, res) => {
  const body = req.body as {
    resumeText?: string;
    targetRole?: string;
    jobDescription?: string;
    timeframeWeeks?: number;
  };
  if (!body?.resumeText || typeof body.resumeText !== 'string' || !body.resumeText.trim()) {
    res.status(400).json({ error: 'Provide resume text to build a career and learning roadmap.' });
    return;
  }
  try {
    const result = await generateCareerRoadmapWithAi({
      resumeText: body.resumeText,
      targetRole: typeof body.targetRole === 'string' ? body.targetRole : '',
      jobDescription: typeof body.jobDescription === 'string' ? body.jobDescription : '',
      timeframeWeeks: typeof body.timeframeWeeks === 'number' ? body.timeframeWeeks : 6,
    });
    res.json(result);
  } catch (err) {
    handleAiError(res, err);
  }
});

app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (!req.path.startsWith('/api/')) {
      next(err);
      return;
    }
    if (err instanceof multer.MulterError) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'File is too large. Upload files under 10 MB.'
          : err.code === 'LIMIT_FILE_COUNT'
            ? 'Too many files selected. Upload up to 20 files at once.'
            : err.message;
      res.status(400).json({ error: msg });
      return;
    }
    const message = err instanceof Error ? err.message : 'Unexpected server error.';
    res.status(500).json({ error: message });
  },
);

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Canopy server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Canopy server:', err);
  process.exit(1);
});
