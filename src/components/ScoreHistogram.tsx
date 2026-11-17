import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ScreenedCandidateResult } from '../shared/screener.ts';

export interface ScoreBin {
  id: string;
  label: string;
  min: number;
  max: number;
  count: number;
  tier: 'top' | 'mid' | 'low';
  candidates: Array<{ name: string; score: number }>;
}

interface ScoreHistogramProps {
  candidates: ScreenedCandidateResult[];
  selectedBinId?: string | null;
  onSelectBin?: (bin: ScoreBin | null) => void;
}

const BIN_DEFINITIONS: Array<{ id: string; label: string; min: number; max: number }> = [
  { id: '0-9', label: '0–9', min: 0, max: 9 },
  { id: '10-19', label: '10–19', min: 10, max: 19 },
  { id: '20-29', label: '20–29', min: 20, max: 29 },
  { id: '30-39', label: '30–39', min: 30, max: 39 },
  { id: '40-49', label: '40–49', min: 40, max: 49 },
  { id: '50-59', label: '50–59', min: 50, max: 59 },
  { id: '60-69', label: '60–69', min: 60, max: 69 },
  { id: '70-79', label: '70–79', min: 70, max: 79 },
  { id: '80-89', label: '80–89', min: 80, max: 89 },
  { id: '90-100', label: '90–100', min: 90, max: 100 },
];

function getBinColor(tier: ScoreBin['tier'], isSelected: boolean, hasSelection: boolean): string {
  const dimmed = hasSelection && !isSelected;
  if (tier === 'top') return dimmed ? 'rgba(110, 222, 152, 0.35)' : '#6ede98';
  if (tier === 'mid') return dimmed ? 'rgba(230, 180, 72, 0.35)' : '#e6b448';
  return dimmed ? 'rgba(232, 134, 102, 0.35)' : '#e88666';
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ScoreBin }>;
}

function HistogramTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const bin = payload[0].payload;
  const tierLabel =
    bin.tier === 'top' ? 'Top tier' : bin.tier === 'mid' ? 'Mid tier' : 'Developing';

  return (
    <div className="rounded-xl border border-white/20 bg-[#0e1e15] px-3.5 py-2.5 text-xs text-white shadow-xl max-w-[240px]">
      <div className="flex items-center justify-between gap-4 font-semibold mb-1">
        <span className="font-mono-tabular">{bin.label} pts</span>
        <span className="text-[#e6b448]">{tierLabel}</span>
      </div>
      <div className="text-white/80 font-mono-tabular mb-1.5">
        {bin.count} candidate{bin.count === 1 ? '' : 's'}
      </div>
      {bin.candidates.length > 0 && (
        <ul className="space-y-0.5 border-t border-white/15 pt-1.5 text-[11px] text-white/90">
          {bin.candidates.slice(0, 5).map((c, idx) => (
            <li key={`${c.name}-${idx}`} className="flex items-center justify-between gap-2">
              <span className="truncate">{c.name}</span>
              <span className="font-mono-tabular text-[#6ede98] shrink-0">{c.score}</span>
            </li>
          ))}
          {bin.candidates.length > 5 && (
            <li className="text-white/60">+{bin.candidates.length - 5} more</li>
          )}
        </ul>
      )}
    </div>
  );
}

export function ScoreHistogram({
  candidates,
  selectedBinId = null,
  onSelectBin,
}: ScoreHistogramProps) {
  const { bins, topTierCount, midTierCount, lowTierCount, topScore } = useMemo(() => {
    const built: ScoreBin[] = BIN_DEFINITIONS.map((def) => ({
      ...def,
      count: 0,
      tier: def.min >= 70 ? 'top' : def.min >= 50 ? 'mid' : 'low',
      candidates: [],
    }));

    let top = 0;
    let mid = 0;
    let low = 0;
    let maxScore = 0;

    candidates.forEach((cand) => {
      const s = Math.max(0, Math.min(100, Math.round(cand.score)));
      if (s > maxScore) maxScore = s;
      if (s >= 75) top += 1;
      else if (s >= 50) mid += 1;
      else low += 1;

      const idx = s >= 90 ? 9 : Math.floor(s / 10);
      built[idx].count += 1;
      built[idx].candidates.push({ name: cand.name, score: s });
    });

    built.forEach((b) => {
      b.candidates.sort((a, b2) => b2.score - a.score);
    });

    return {
      bins: built,
      topTierCount: top,
      midTierCount: mid,
      lowTierCount: low,
      topScore: maxScore,
    };
  }, [candidates]);

  const topShare =
    candidates.length > 0 ? Math.round((topTierCount / candidates.length) * 100) : 0;

  return (
    <div className="mt-5 pt-5 border-t border-white/15">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-xs font-semibold text-white">Score distribution</div>
          <div className="text-xs text-white/75 font-mono-tabular mt-0.5">
            Top tier (75+): {topTierCount} ({topShare}%) · Mid tier (50–74): {midTierCount} · Below 50:{' '}
            {lowTierCount} · Peak score: {topScore}/100
          </div>
        </div>

        <div className="flex items-center gap-4 text-[11px] text-white/80">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#6ede98]" aria-hidden="true" />
            <span>Top tier (70–100)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#e6b448]" aria-hidden="true" />
            <span>Mid (50–69)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#e88666]" aria-hidden="true" />
            <span>Developing (&lt;50)</span>
          </span>
          {selectedBinId && onSelectBin && (
            <button
              type="button"
              onClick={() => onSelectBin(null)}
              className="underline text-[#e6b448] hover:text-white cursor-pointer"
            >
              Reset filter
            </button>
          )}
        </div>
      </div>

      <div className="h-44 w-full min-w-0">
        <ResponsiveContainer width="100%" height={176} minWidth={0}>
          <BarChart
            data={bins}
            margin={{ top: 8, right: 6, left: -22, bottom: 0 }}
            barCategoryGap="16%"
          >
            <CartesianGrid stroke="rgba(255,255,255,0.1)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'rgba(255,255,255,0.78)', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: 'rgba(255,255,255,0.72)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.06)' }}
              content={<HistogramTooltip />}
            />
            <Bar
              dataKey="count"
              radius={[6, 6, 0, 0]}
              onClick={(data) => {
                if (!onSelectBin) return;
                const maybeWrapped = data as { payload?: ScoreBin } | ScoreBin;
                const bin =
                  'payload' in maybeWrapped && maybeWrapped.payload
                    ? maybeWrapped.payload
                    : (maybeWrapped as ScoreBin);
                if (!bin || bin.count === 0) return;
                onSelectBin(selectedBinId === bin.id ? null : bin);
              }}
              style={{ cursor: onSelectBin ? 'pointer' : 'default' }}
            >
              {bins.map((bin) => (
                <Cell
                  key={bin.id}
                  fill={getBinColor(bin.tier, selectedBinId === bin.id, Boolean(selectedBinId))}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
