// Public entry address during the Discord callback transition.
// The existing Worker continues to own all sessions and persistent data.
const applicationOrigin = 'https://darknessofthefallen-backend.eltryt-darknessofthefallen.workers.dev';
export default {
  fetch(request) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Use the application form to submit data.', {status:405,headers:{Allow:'GET, HEAD'}});
    const incoming = new URL(request.url);
    const target = new URL(applicationOrigin);
    target.pathname = incoming.pathname;
    target.search = incoming.search;
    return new Response(null, {status:302, headers:{
      Location:target.href,
      'Cache-Control':'no-store',
      'Referrer-Policy':'no-referrer',
      'X-Content-Type-Options':'nosniff'
    }});
  }
};
