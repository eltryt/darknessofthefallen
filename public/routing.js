export function pagePath(path, basePath = '/', isStatic = false) {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  const route = path.slice(1);
  return `${basePath}${route}${isStatic && route && !route.endsWith('/') ? '/' : ''}`;
}

export function currentPage(pathname, basePath = '/') {
  if (pathname === basePath.slice(0, -1)) return '/';
  if (!pathname.startsWith(basePath)) return null;
  const route = pathname.slice(basePath.length).replace(/\/$/, '');
  return route === 'index.html' ? '/' : `/${route}`;
}
