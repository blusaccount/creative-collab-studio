import type { Project, StudioSettings, Ticket } from '../types';

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'asset';
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

export function buildAssetFilename(
  ticket: Ticket,
  project: Project | null,
  settings: StudioSettings,
): string {
  const template = settings.fileNamingTemplate || '{project}-{title}';
  const base = template
    .replace(/\{project\}/g, slugify(project?.name ?? 'project'))
    .replace(/\{title\}/g, slugify(ticket.title))
    .replace(/\{type\}/g, slugify(ticket.type))
    .replace(/\{date\}/g, formatDate(Date.now()))
    .replace(/\{version\}/g, `v${ticket.version}`);
  const slug = slugify(base);
  const versionPart = settings.useVersionSuffix ? `-v${ticket.version}` : '';
  return `${slug}${versionPart}.png`;
}

export function buildAssetSubfolders(ticket: Ticket, project: Project | null): string[] {
  const date = new Date(ticket.completedAt ?? ticket.updatedAt);
  const year = String(date.getFullYear());
  const month = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return [slugify(project?.assetOutputFolder ?? 'assets'), slugify(ticket.type), month];
}
