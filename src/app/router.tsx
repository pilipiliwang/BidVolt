import {
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';

export type AppRoute =
  | { name: 'login' }
  | { name: 'projects' }
  | { name: 'project-overview'; projectId: string }
  | { name: 'project-materials'; projectId: string }
  | { name: 'enterprise-assets' }
  | { name: 'review-center'; projectId: string }
  | { name: 'pricing-center'; projectId: string }
  | { name: 'history-prices' }
  | { name: 'not-found' };

const NAVIGATION_EVENT = 'bidvolt:navigation';

function normalisePath(pathname: string) {
  const withoutTrailingSlash = pathname.replace(/\/+$/, '');
  return withoutTrailingSlash || '/';
}

function decodePathPart(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function matchRoute(pathname: string): AppRoute {
  const path = normalisePath(pathname);

  if (path === '/login') {
    return { name: 'login' };
  }

  if (path === '/' || path === '/projects') {
    return { name: 'projects' };
  }

  if (path === '/enterprise-assets') {
    return { name: 'enterprise-assets' };
  }

  if (path === '/history-prices' || path === '/history') {
    return { name: 'history-prices' };
  }

  const projectSectionMatch = path.match(
    /^\/projects\/([^/]+)\/(materials|review|pricing)$/,
  );
  if (projectSectionMatch) {
    const sectionNames = {
      materials: 'project-materials',
      review: 'review-center',
      pricing: 'pricing-center',
    } as const;
    const section = projectSectionMatch[2] as keyof typeof sectionNames;
    return {
      name: sectionNames[section],
      projectId: decodePathPart(projectSectionMatch[1]),
    };
  }

  const overviewMatch = path.match(/^\/projects\/([^/]+)(?:\/overview)?$/);
  if (overviewMatch) {
    return {
      name: 'project-overview',
      projectId: decodePathPart(overviewMatch[1]),
    };
  }

  return { name: 'not-found' };
}

function subscribeToLocation(onStoreChange: () => void) {
  window.addEventListener('popstate', onStoreChange);
  window.addEventListener(NAVIGATION_EVENT, onStoreChange);

  return () => {
    window.removeEventListener('popstate', onStoreChange);
    window.removeEventListener(NAVIGATION_EVENT, onStoreChange);
  };
}

function getLocationSnapshot() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function useUrlRoute() {
  const location = useSyncExternalStore(
    subscribeToLocation,
    getLocationSnapshot,
    () => '/projects',
  );
  return matchRoute(location.split(/[?#]/, 1)[0]);
}

export function navigate(to: string, options?: { replace?: boolean }) {
  if (options?.replace) {
    window.history.replaceState(null, '', to);
  } else {
    window.history.pushState(null, '', to);
  }

  window.dispatchEvent(new Event(NAVIGATION_EVENT));
  window.scrollTo?.({ top: 0, behavior: 'auto' });
}

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  children: ReactNode;
  to: string;
};

function shouldHandleClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function AppLink({ children, onClick, target, to, ...props }: AppLinkProps) {
  return (
    <a
      {...props}
      href={to}
      target={target}
      onClick={(event) => {
        onClick?.(event);
        if (target || !shouldHandleClick(event)) {
          return;
        }

        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
