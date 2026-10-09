// Public gateway. The original Worker owns all secrets, sessions and SQLite.
const legacyOrigin = 'https://darknessofthefallen-backend.eltryt-darknessofthefallen.workers.dev';
export default {
  async fetch(request, env) {
    const response = await env.BACKEND.fetch(request);
    // During rollout the old backend may still be cached. Keep login usable
    // until its canonical origin configuration has propagated.
    if (response.status === 400 && ['GET','HEAD'].includes(request.method)) {
      const message = await response.clone().text();
      if (['Application origin mismatch.','Use the configured application origin.'].includes(message)) {
        const original = new URL(request.url), target = new URL(legacyOrigin);
        target.pathname = original.pathname; target.search = original.search;
        return new Response(null,{status:302,headers:{Location:target.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
      }
    }
    return response;
  }
};
