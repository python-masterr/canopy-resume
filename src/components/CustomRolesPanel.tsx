import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  createCustomRole,
  deleteCustomRole,
  type SavedCustomRoleRecord,
} from '../lib/firestoreService.ts';

interface CustomRolesPanelProps {
  customRoles: SavedCustomRoleRecord[];
  onOpenLogin: () => void;
}

export function CustomRolesPanel({ customRoles, onOpenLogin }: CustomRolesPanelProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [skillsInput, setSkillsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenLogin();
      return;
    }
    if (!user.emailVerified) {
      setError('Verify your email address (see the banner at the top) before saving custom roles.');
      return;
    }
    setError(null);
    const parsedSkills = skillsInput
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (!title.trim() || parsedSkills.length === 0) {
      setError('Enter a role title and at least one comma-separated skill.');
      return;
    }

    setSaving(true);
    try {
      await createCustomRole(user.uid, title, parsedSkills);
      setTitle('');
      setSkillsInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save role.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (roleId: string) => {
    try {
      await deleteCustomRole(roleId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete role.');
    }
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--ink)]">Custom target roles</h3>
          <p className="text-sm text-[var(--mut)]">
            Define your team&apos;s hiring rubrics so Canopy scores skill gaps against your open positions.
          </p>
        </div>
        {!user && (
          <button
            type="button"
            onClick={onOpenLogin}
            className="text-sm font-medium text-[var(--acc)] underline cursor-pointer"
          >
            Sign in to save custom roles
          </button>
        )}
      </div>

      <form onSubmit={(e) => void handleCreate(e)} className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr_auto] gap-3 mb-4">
        <input
          type="text"
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Role title (e.g. Platform Engineer)"
          aria-label="Custom role title"
          className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--ink)]"
        />
        <input
          type="text"
          value={skillsInput}
          onChange={(e) => setSkillsInput(e.target.value)}
          placeholder="Required skills (e.g. typescript, kubernetes, terraform, sql)"
          aria-label="Required skills comma-separated"
          className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--ink)]"
        />
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--acc)] text-[var(--on)] px-5 py-2.5 text-sm font-semibold disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{saving ? 'Saving…' : 'Add role'}</span>
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-[var(--bad)] mb-3">
          {error}
        </p>
      )}

      {customRoles.length > 0 ? (
        <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
          {customRoles.map((role) => (
            <div key={role.id} className="flex items-center justify-between gap-4 py-3 text-sm">
              <div>
                <div className="font-semibold text-[var(--ink)]">{role.title}</div>
                <div className="text-xs text-[var(--mut)]">
                  {role.skills.join(' · ')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleDelete(role.id)}
                aria-label={`Delete ${role.title}`}
                className="p-2 rounded-lg text-[var(--mut)] hover:text-[var(--bad)] transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--mut)]">
          {user
            ? 'No custom roles saved yet. Add one above to include it in every screening.'
            : 'Sign in to save custom role definitions to your workspace.'}
        </p>
      )}
    </div>
  );
}
