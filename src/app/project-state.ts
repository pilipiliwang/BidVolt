import type { ProjectSummary } from '../domains/projects/project-view-model';

export function upsertProjectSummary(
  projects: readonly ProjectSummary[],
  project: ProjectSummary,
): ProjectSummary[] {
  return [project, ...projects.filter((item) => item.id !== project.id)];
}

export function mergeProjectPage(
  page: readonly ProjectSummary[],
  current: readonly ProjectSummary[],
  preservedProjectId?: string,
): ProjectSummary[] {
  if (!preservedProjectId || page.some((project) => project.id === preservedProjectId)) {
    return [...page];
  }
  const preservedProject = current.find((project) => project.id === preservedProjectId);
  return preservedProject ? [...page, preservedProject] : [...page];
}
