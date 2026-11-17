import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { auth, db } from '../firebase.ts';
import type {
  RoleDefinition,
  ScreenedCandidateResult,
  ScreeningPoolResponse,
} from '../shared/screener.ts';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export type CandidateStatus = 'new' | 'shortlisted' | 'reviewed' | 'archived';

export interface SavedScreeningRecord {
  id: string;
  ownerId: string;
  title: string;
  targetRole: string;
  candidateCount: number;
  averageScore: number;
  topSkills: Array<{ name: string; count: number }>;
  topGaps: Array<{ name: string; count: number }>;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface SavedCandidateRecord extends ScreenedCandidateResult {
  screeningId: string;
  ownerId: string;
  status: CandidateStatus;
  notes: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface SavedCustomRoleRecord extends RoleDefinition {
  id: string;
  ownerId: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export async function syncUserProfile(user: User): Promise<void> {
  const userRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');
  const displayName = (user.displayName || user.email?.split('@')[0] || 'Recruiter').slice(0, 120);
  const photoURL = (user.photoURL || '').slice(0, 500);
  const providerId = (user.providerData?.[0]?.providerId || 'password').slice(0, 40);
  const lastSignInAt = (
    user.metadata?.lastSignInTime
      ? new Date(user.metadata.lastSignInTime).toISOString()
      : new Date().toISOString()
  ).slice(0, 64);

  try {
    const [existingUser, existingPrivate] = await Promise.all([
      getDoc(userRef),
      user.email ? getDoc(privateRef) : Promise.resolve(null),
    ]);

    const batch = writeBatch(db);
    if (!existingUser.exists()) {
      const payload: Record<string, unknown> = {
        uid: user.uid,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (photoURL) payload.photoURL = photoURL;
      batch.set(userRef, payload);
    } else {
      const payload: Record<string, unknown> = {
        displayName,
        updatedAt: serverTimestamp(),
      };
      if (photoURL) payload.photoURL = photoURL;
      batch.update(userRef, payload);
    }

    if (user.email) {
      const privatePayload = {
        uid: user.uid,
        email: user.email.slice(0, 200),
        emailVerified: Boolean(user.emailVerified),
        provider: providerId,
        lastSignInAt,
        updatedAt: serverTimestamp(),
      };
      if (!existingPrivate?.exists()) {
        batch.set(privateRef, privatePayload);
      } else {
        batch.update(privateRef, {
          email: user.email.slice(0, 200),
          emailVerified: Boolean(user.emailVerified),
          provider: providerId,
          lastSignInAt,
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }
}

export async function saveScreeningToFirestore(
  ownerId: string,
  title: string,
  pool: ScreeningPoolResponse,
): Promise<string> {
  const screeningId = makeSafeId('scr');
  const screeningRef = doc(db, 'screenings', screeningId);
  const batch = writeBatch(db);

  const safeTitle = (title.trim() || `Screening · ${new Date().toLocaleDateString()}`).slice(0, 160);
  const safeTargetRole = (pool.targetRole || 'All Roles').slice(0, 80);

  batch.set(screeningRef, {
    id: screeningId,
    ownerId,
    title: safeTitle,
    targetRole: safeTargetRole,
    candidateCount: Math.min(50, Math.max(1, pool.candidates.length)),
    averageScore: Math.min(100, Math.max(0, pool.averageScore)),
    topSkills: pool.topSkills.slice(0, 10).map((s) => ({
      name: String(s.name).slice(0, 60),
      count: Number(s.count) || 0,
    })),
    topGaps: pool.topGaps.slice(0, 10).map((g) => ({
      name: String(g.name).slice(0, 60),
      count: Number(g.count) || 0,
    })),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  pool.candidates.slice(0, 50).forEach((cand, idx) => {
    const candidateId = makeSafeId(`c${idx}`);
    const candRef = doc(db, 'screenings', screeningId, 'candidates', candidateId);
    const payload: Record<string, unknown> = {
      id: candidateId,
      screeningId,
      ownerId,
      name: (cand.name || `Candidate ${idx + 1}`).slice(0, 120),
      score: Math.min(100, Math.max(0, Math.round(cand.score))),
      verdict: (cand.verdict || 'Reviewed').slice(0, 80),
      yearsExperience: Math.min(80, Math.max(0, cand.yearsExperience)),
      skillsCount: Math.min(200, Math.max(0, cand.skillsCount)),
      measurableResults: Math.min(500, Math.max(0, cand.measurableResults)),
      wordCount: Math.min(50000, Math.max(0, cand.wordCount)),
      strongestArea: (cand.strongestArea || 'Skills breadth').slice(0, 60),
      weakestArea: (cand.weakestArea || 'Measurable results').slice(0, 60),
      prefix: (cand.prefix || '').slice(0, 20),
      status: 'new',
      notes: '',
      detectedSkills: cand.detectedSkills.slice(0, 80),
      breakdown: cand.breakdown.slice(0, 10),
      categoryCounts: cand.categoryCounts.slice(0, 10),
      matchedJobs: cand.matchedJobs.slice(0, 5),
      recommendedSkills: cand.recommendedSkills.slice(0, 15),
      tips: cand.tips.slice(0, 10),
      rawTextPreview: (cand.rawTextPreview || '').slice(0, 2500),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (cand.sourceFileName) {
      payload.sourceFileName = cand.sourceFileName.slice(0, 200);
    }
    batch.set(candRef, payload);
  });

  try {
    await batch.commit();
    return screeningId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `screenings/${screeningId}`);
  }
}

export function subscribeUserScreenings(
  ownerId: string,
  onData: (items: SavedScreeningRecord[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const path = 'screenings';
  const q = query(collection(db, path), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snapshot) => {
      const records = snapshot.docs
        .map((d) => d.data() as SavedScreeningRecord)
        .sort((a, b) => {
          const at = a.createdAt?.toMillis?.() ?? 0;
          const bt = b.createdAt?.toMillis?.() ?? 0;
          return bt - at;
        });
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export function subscribeScreeningCandidates(
  screeningId: string,
  ownerId: string,
  onData: (items: SavedCandidateRecord[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const path = `screenings/${screeningId}/candidates`;
  const q = query(
    collection(db, 'screenings', screeningId, 'candidates'),
    where('ownerId', '==', ownerId),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const records = snapshot.docs
        .map((d) => d.data() as SavedCandidateRecord)
        .sort((a, b) => b.score - a.score);
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export async function updateCandidateReview(
  screeningId: string,
  candidateId: string,
  updates: { status?: CandidateStatus; notes?: string },
): Promise<void> {
  const path = `screenings/${screeningId}/candidates/${candidateId}`;
  const candRef = doc(db, 'screenings', screeningId, 'candidates', candidateId);
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (updates.status !== undefined) {
    payload.status = updates.status;
  }
  if (updates.notes !== undefined) {
    payload.notes = updates.notes.slice(0, 2000);
  }
  try {
    await updateDoc(candRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function renameScreening(screeningId: string, title: string): Promise<void> {
  const path = `screenings/${screeningId}`;
  const safeTitle = title.trim().slice(0, 160);
  if (!safeTitle) return;
  try {
    await updateDoc(doc(db, 'screenings', screeningId), {
      title: safeTitle,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteScreening(screeningId: string, ownerId: string): Promise<void> {
  const path = `screenings/${screeningId}`;
  try {
    const candidatesSnap = await getDocs(
      query(
        collection(db, 'screenings', screeningId, 'candidates'),
        where('ownerId', '==', ownerId),
      ),
    );
    const batch = writeBatch(db);
    candidatesSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'screenings', screeningId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeCustomRoles(
  ownerId: string,
  onData: (items: SavedCustomRoleRecord[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const path = 'customRoles';
  const q = query(collection(db, path), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snapshot) => {
      const roles = snapshot.docs
        .map((d) => ({
          ...(d.data() as SavedCustomRoleRecord),
          isCustom: true,
        }))
        .sort((a, b) => {
          const at = a.createdAt?.toMillis?.() ?? 0;
          const bt = b.createdAt?.toMillis?.() ?? 0;
          return bt - at;
        });
      onData(roles);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export async function createCustomRole(
  ownerId: string,
  title: string,
  skills: string[],
): Promise<string> {
  const roleId = makeSafeId('role');
  const path = `customRoles/${roleId}`;
  const cleanTitle = title.trim().slice(0, 80);
  const cleanSkills = skills
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);

  if (!cleanTitle || cleanSkills.length === 0) {
    throw new Error('Role title and at least one required skill are needed.');
  }

  try {
    await setDoc(doc(db, 'customRoles', roleId), {
      id: roleId,
      ownerId,
      title: cleanTitle,
      skills: cleanSkills,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return roleId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteCustomRole(roleId: string): Promise<void> {
  const path = `customRoles/${roleId}`;
  try {
    await deleteDoc(doc(db, 'customRoles', roleId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Admin RBAC & Platform Management ---

export const BOOTSTRAPPED_ADMIN_EMAIL = 'pythonnmasterr@gmail.com';

export interface AdminUserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface AdminUserPrivateInfo {
  uid: string;
  email: string;
  emailVerified?: boolean;
  provider?: string;
  lastSignInAt?: string;
  updatedAt?: Timestamp | null;
}

export function checkUserIsAdmin(user: User | null): boolean {
  return Boolean(
    user &&
      user.emailVerified &&
      user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase(),
  );
}

export async function fetchAllUsersPrivateInfoAdmin(
  uids: string[],
): Promise<Record<string, AdminUserPrivateInfo>> {
  const uniqueUids = Array.from(new Set(uids.filter((id) => /^[a-zA-Z0-9_-]{1,128}$/.test(id))));
  const results = await Promise.all(
    uniqueUids.map(async (uid) => {
      const path = `users/${uid}/private/info`;
      try {
        const snap = await getDoc(doc(db, 'users', uid, 'private', 'info'));
        return snap.exists() ? ([uid, snap.data() as AdminUserPrivateInfo] as const) : null;
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, path);
      }
    }),
  );

  const map: Record<string, AdminUserPrivateInfo> = {};
  results.forEach((entry) => {
    if (entry) {
      map[entry[0]] = entry[1];
    }
  });
  return map;
}

export function subscribeAllScreeningsAdmin(
  onData: (items: SavedScreeningRecord[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const path = 'screenings';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const records = snapshot.docs
        .map((d) => d.data() as SavedScreeningRecord)
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export function subscribeScreeningCandidatesAdmin(
  screeningId: string,
  onData: (items: SavedCandidateRecord[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const path = `screenings/${screeningId}/candidates`;
  return onSnapshot(
    collection(db, 'screenings', screeningId, 'candidates'),
    (snapshot) => {
      const records = snapshot.docs
        .map((d) => d.data() as SavedCandidateRecord)
        .sort((a, b) => b.score - a.score);
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export function subscribeAllUsersAdmin(
  onData: (items: AdminUserProfile[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const path = 'users';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const users = snapshot.docs
        .map((d) => d.data() as AdminUserProfile)
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      onData(users);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export function subscribeAllCustomRolesAdmin(
  onData: (items: SavedCustomRoleRecord[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const path = 'customRoles';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const roles = snapshot.docs
        .map((d) => ({ ...(d.data() as SavedCustomRoleRecord), isCustom: true }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      onData(roles);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}


export async function deleteScreeningAdmin(screeningId: string): Promise<void> {
  const path = `screenings/${screeningId}`;
  try {
    const candidatesSnap = await getDocs(
      collection(db, 'screenings', screeningId, 'candidates'),
    );
    const batch = writeBatch(db);
    candidatesSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'screenings', screeningId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function formatFirestoreError(err: unknown, fallback = 'Operation failed.'): string {
  const raw = err instanceof Error ? err.message : String(err || fallback);
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    return parsed.error || fallback;
  } catch {
    return raw || fallback;
  }
}

// --- Job Application Tracker (/applications) ---

export type ApplicationStatus = 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected';

export interface JobApplicationRecord {
  id: string;
  ownerId: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  atsScore: number;
  jobUrl?: string;
  appliedDate?: string;
  notes: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export function subscribeApplications(
  ownerId: string,
  onData: (items: JobApplicationRecord[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const path = 'applications';
  const q = query(collection(db, path), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snapshot) => {
      const records = snapshot.docs
        .map((d) => d.data() as JobApplicationRecord)
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export async function createApplication(
  ownerId: string,
  input: {
    company: string;
    role: string;
    status: ApplicationStatus;
    atsScore: number;
    jobUrl?: string;
    appliedDate?: string;
    notes?: string;
  },
): Promise<string> {
  const appId = makeSafeId('app');
  const path = `applications/${appId}`;
  const company = input.company.trim().slice(0, 120);
  const role = input.role.trim().slice(0, 120);
  if (!company || !role) {
    throw new Error('Company and role are required.');
  }

  const payload: Record<string, unknown> = {
    id: appId,
    ownerId,
    company,
    role,
    status: input.status,
    atsScore: Math.min(100, Math.max(0, Math.round(Number(input.atsScore) || 0))),
    notes: (input.notes || '').trim().slice(0, 2000),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const cleanUrl = (input.jobUrl || '').trim().slice(0, 500);
  if (cleanUrl) payload.jobUrl = cleanUrl;
  const cleanDate = (input.appliedDate || '').trim().slice(0, 40);
  if (cleanDate) payload.appliedDate = cleanDate;

  try {
    await setDoc(doc(db, 'applications', appId), payload);
    return appId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateApplication(
  applicationId: string,
  updates: {
    company?: string;
    role?: string;
    status?: ApplicationStatus;
    atsScore?: number;
    jobUrl?: string;
    appliedDate?: string;
    notes?: string;
  },
): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(applicationId)) {
    throw new Error('Invalid application ID.');
  }
  const path = `applications/${applicationId}`;
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (updates.company !== undefined) {
    const cleanCompany = updates.company.trim().slice(0, 120);
    if (cleanCompany) payload.company = cleanCompany;
  }
  if (updates.role !== undefined) {
    const cleanRole = updates.role.trim().slice(0, 120);
    if (cleanRole) payload.role = cleanRole;
  }
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.atsScore !== undefined) {
    payload.atsScore = Math.min(100, Math.max(0, Math.round(Number(updates.atsScore) || 0)));
  }
  if (updates.jobUrl !== undefined) payload.jobUrl = updates.jobUrl.trim().slice(0, 500);
  if (updates.appliedDate !== undefined) payload.appliedDate = updates.appliedDate.trim().slice(0, 40);
  if (updates.notes !== undefined) payload.notes = updates.notes.slice(0, 2000);

  try {
    await updateDoc(doc(db, 'applications', applicationId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteApplication(applicationId: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(applicationId)) {
    throw new Error('Invalid application ID.');
  }
  const path = `applications/${applicationId}`;
  try {
    await deleteDoc(doc(db, 'applications', applicationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Resume History (/resumeVersions) ---

export type ResumeVersionSource = 'uploaded' | 'improved' | 'built';

export interface ResumeVersionRecord {
  id: string;
  ownerId: string;
  title: string;
  targetRole: string;
  source: ResumeVersionSource;
  atsScore: number;
  skillsCount: number;
  detectedSkills: string[];
  content: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export function subscribeResumeVersions(
  ownerId: string,
  onData: (items: ResumeVersionRecord[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const path = 'resumeVersions';
  const q = query(collection(db, path), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snapshot) => {
      const records = snapshot.docs
        .map((d) => d.data() as ResumeVersionRecord)
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export async function saveResumeVersion(
  ownerId: string,
  input: {
    title: string;
    targetRole: string;
    source: ResumeVersionSource;
    atsScore: number;
    skillsCount: number;
    detectedSkills: string[];
    content: string;
  },
): Promise<string> {
  const versionId = makeSafeId('resv');
  const path = `resumeVersions/${versionId}`;
  const cleanTitle = (input.title.trim() || 'Untitled Resume').slice(0, 160);
  const cleanContent = input.content.trim().slice(0, 25000);
  if (!cleanContent) {
    throw new Error('Resume content cannot be empty.');
  }

  const cleanSkills = input.detectedSkills
    .map((s) => String(s).trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 80);

  try {
    await setDoc(doc(db, 'resumeVersions', versionId), {
      id: versionId,
      ownerId,
      title: cleanTitle,
      targetRole: (input.targetRole || 'All Roles').slice(0, 80),
      source: input.source,
      atsScore: Math.min(100, Math.max(0, Math.round(Number(input.atsScore) || 0))),
      skillsCount: Math.min(200, Math.max(0, Math.round(Number(input.skillsCount) || cleanSkills.length))),
      detectedSkills: cleanSkills,
      content: cleanContent,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return versionId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteResumeVersion(versionId: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(versionId)) {
    throw new Error('Invalid resume version ID.');
  }
  const path = `resumeVersions/${versionId}`;
  try {
    await deleteDoc(doc(db, 'resumeVersions', versionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}


