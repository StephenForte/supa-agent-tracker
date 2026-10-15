import { prdPresentation, repositoryPresentation } from '../../domain/format';

/** One rendering of repo and PRD links so a missing link is an em dash on every screen. */
export function ProjectResources({ project }: { project: { repositoryName: string | null; repositoryUrl: string | null; prdUrl: string | null } }) {
  const repository = repositoryPresentation(project);
  const prd = prdPresentation(project);
  const item = (resource: { href: string | null; text: string }) => resource.href
    ? <a href={resource.href} target="_blank" rel="noopener noreferrer">{resource.text}</a>
    : <span>{resource.text}</span>;
  return <>{item(repository)}{item(prd)}</>;
}
