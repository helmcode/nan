import { useState } from 'preact/hooks';

export interface Project {
  id: number;
  handle: string;
  name: string;
  description: string;
  imageUrl?: string;
  appUrl?: string;
  repoUrl?: string;
  tags: string[];
  stars: number;
}

const ALL_TAGS = ['agents', 'websites', 'ai', 'api', 'tools', 'automation', 'data', 'mcp', 'voice', 'vision'];

const TAG_COLORS: Record<string, string> = {
  agents:     'bg-violet-500/15 text-violet-300 border-violet-800/60',
  websites:   'bg-sky-500/15 text-sky-300 border-sky-800/60',
  ai:         'bg-emerald-500/15 text-emerald-300 border-emerald-800/60',
  api:        'bg-amber-500/15 text-amber-300 border-amber-800/60',
  tools:      'bg-rose-500/15 text-rose-300 border-rose-800/60',
  automation: 'bg-indigo-500/15 text-indigo-300 border-indigo-800/60',
  data:       'bg-cyan-500/15 text-cyan-300 border-cyan-800/60',
  mcp:        'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-800/60',
  voice:      'bg-orange-500/15 text-orange-300 border-orange-800/60',
  vision:     'bg-teal-500/15 text-teal-300 border-teal-800/60',
};

const medalStyle: Record<number, { border: string; glow: string; badge: string; label: string }> = {
  0: { border: 'border-yellow-500/50', glow: 'shadow-[0_0_24px_rgba(234,179,8,0.12)]', badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40', label: '★ #1' },
  1: { border: 'border-slate-400/40', glow: 'shadow-[0_0_16px_rgba(148,163,184,0.08)]', badge: 'bg-slate-500/20 text-slate-300 border-slate-500/40', label: '★ #2' },
  2: { border: 'border-amber-700/50', glow: 'shadow-[0_0_16px_rgba(180,83,9,0.10)]', badge: 'bg-amber-700/20 text-amber-400 border-amber-700/40', label: '★ #3' },
  3: { border: 'border-violet-500/30', glow: '', badge: 'bg-violet-500/10 text-violet-400 border-violet-500/30', label: '★ #4' },
  4: { border: 'border-violet-500/20', glow: '', badge: 'bg-violet-500/10 text-violet-400 border-violet-500/20', label: '★ #5' },
};

const safeUrl = (u?: string): string | null => (u && /^https?:\/\//i.test(u) ? u : null);

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} class="rounded-sm bg-amber-400/25 px-0.5 text-amber-200 not-italic">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function ProjectCard({
  project,
  searchQuery,
  rank,
}: {
  project: Project;
  searchQuery: string;
  rank?: number;
}) {
  const app = safeUrl(project.appUrl);
  const repo = safeUrl(project.repoUrl);
  const medal = rank !== undefined ? (medalStyle[rank] ?? medalStyle[4]) : null;

  return (
    <article
      class={`flex flex-col overflow-hidden rounded-xl border bg-neutral-900/40 transition-all ${
        medal
          ? `${medal.border} ${medal.glow}`
          : 'border-neutral-800/60 hover:border-neutral-700/60'
      }`}
    >
      {/* Image */}
      <div class="relative aspect-video w-full overflow-hidden bg-neutral-900">
        {safeUrl(project.imageUrl) ? (
          <img
            src={safeUrl(project.imageUrl)!}
            alt={project.name}
            loading="lazy"
            decoding="async"
            class="h-full w-full object-cover"
          />
        ) : (
          <div class="flex h-full w-full items-center justify-center text-neutral-700">
            <svg width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 7a2 2 0 012-2h3l2 2h9a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
          </div>
        )}
        {medal && (
          <span class={`absolute top-2 left-2 rounded border px-2 py-0.5 font-mono text-[10px] backdrop-blur-sm ${medal.badge}`}>
            {medal.label}
          </span>
        )}
        <span class="absolute top-2 right-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-amber-300 backdrop-blur-sm">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          {project.stars}
        </span>
      </div>

      {/* Body */}
      <div class="flex flex-1 flex-col gap-2 p-4">
        <h3 class="font-mono text-sm font-semibold text-white leading-snug">
          <Highlight text={project.name} query={searchQuery} />
        </h3>
        <p class="font-mono text-[10px] text-neutral-500">by {project.handle}</p>
        <p class="font-mono text-xs leading-relaxed text-neutral-400 line-clamp-3">
          <Highlight text={project.description} query={searchQuery} />
        </p>

        {project.tags.length > 0 && (
          <div class="mt-1 flex flex-wrap gap-1">
            {project.tags.map((tag) => (
              <span
                key={tag}
                class={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${
                  TAG_COLORS[tag] ?? 'bg-neutral-800/50 text-neutral-400 border-neutral-700'
                }`}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div class="mt-auto flex items-center gap-4 pt-3">
          {app && (
            <a href={app} target="_blank" rel="noopener noreferrer" class="font-mono text-xs text-violet-400 transition-colors hover:text-violet-300">
              ↗ App
            </a>
          )}
          {repo && (
            <a href={repo} target="_blank" rel="noopener noreferrer" class="font-mono text-xs text-neutral-500 transition-colors hover:text-white">
              ↗ Repo
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

interface Props {
  projects: Project[];
}

export function ProjectsGallery({ projects }: Props) {
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const isFiltering = search.trim() !== '' || activeTag !== null;

  const filtered = isFiltering
    ? projects.filter((p) => {
        const q = search.trim().toLowerCase();
        const matchesSearch =
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q);
        const matchesTag = !activeTag || p.tags.includes(activeTag);
        return matchesSearch && matchesTag;
      })
    : projects;

  const featured = isFiltering ? [] : filtered.slice(0, 5);
  const rest = isFiltering ? filtered : filtered.slice(5);

  return (
    <div>
      {/* Search + Tag filter */}
      <div class="mb-10 space-y-4">
        <input
          type="text"
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
          placeholder="Search by name or description…"
          class="w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-2.5 font-mono text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-violet-500/50 sm:max-w-sm"
        />

        <div class="flex flex-wrap items-center gap-1.5">
          <span class="font-mono text-[10px] uppercase tracking-wider text-neutral-600">tags:</span>
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            class={`rounded border px-2 py-0.5 font-mono text-[10px] transition-colors ${
              activeTag === null
                ? 'border-violet-500/40 text-violet-300'
                : 'border-neutral-800 text-neutral-500 hover:text-white'
            }`}
          >
            all
          </button>
          {ALL_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              class={`rounded border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                activeTag === tag
                  ? 'border-violet-500/40 text-violet-300'
                  : 'border-neutral-800 text-neutral-500 hover:text-white'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Filtering: flat grid */}
      {isFiltering && (
        <>
          {filtered.length === 0 ? (
            <div class="rounded-xl border border-neutral-800/60 bg-neutral-900/20 p-16 text-center">
              <p class="font-mono text-sm text-neutral-500">No projects match the current filter.</p>
            </div>
          ) : (
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => (
                <ProjectCard key={p.id} project={p} searchQuery={search.trim()} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Default: top 5 + rest */}
      {!isFiltering && (
        <>
          {featured.length > 0 && (
            <section class="mb-16">
              <h2 class="mb-6 font-mono text-xs uppercase tracking-widest text-neutral-500">★ Top Projects</h2>
              <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((p, i) => (
                  <ProjectCard key={p.id} project={p} searchQuery="" rank={i} />
                ))}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section>
              <h2 class="mb-6 font-mono text-xs uppercase tracking-widest text-neutral-500">All Projects</h2>
              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((p) => (
                  <ProjectCard key={p.id} project={p} searchQuery="" />
                ))}
              </div>
            </section>
          )}

          {projects.length === 0 && (
            <div class="rounded-xl border border-neutral-800/60 bg-neutral-900/20 p-16 text-center">
              <p class="font-mono text-sm text-neutral-500">No projects yet.</p>
              <p class="mt-2 font-mono text-xs text-neutral-600">
                Be the first to submit one on{' '}
                <a href="https://cloud.nan.builders/projects" class="text-violet-400 hover:text-violet-300 transition-colors">
                  cloud.nan.builders
                </a>.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
