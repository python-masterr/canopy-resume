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

dotenv.config();

const workerPath = path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
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
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => {
        if ('str' in item) {
          return item.str + (item.hasEOL ? '\n' : ' ');
        }
        return '';
      })
      .join('');
    pages.push(pageText);
  }
  return pages.join('\n');
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
  const result = screenPool(validResumes, customRoles, targetRole);
  res.json(result);
});

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
