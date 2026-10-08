import {upcomingSessions, calendarFile} from './schedule.js';

export const schedulePlanner = () => `<section class="raid-planner" aria-label="Planifica tus noches de raid">
  <div class="planner-heading"><div><span class="eyebrow">Haz sitio para Azeroth</span><h3>Tu próxima noche con la hermandad.</h3></div>
    <label class="planner-zone">Mostrar horarios en<select data-schedule-zone aria-label="Zona horaria del calendario"></select></label></div>
  <div class="planner-next"><span class="pill" data-next-status></span><p data-next-session></p><span class="planner-countdown" data-countdown></span></div>
  <ol class="planner-upcoming" data-next-sessions aria-label="Siguientes horarios habituales"></ol>
  <div class="planner-actions"><button type="button" class="secondary" data-download-calendar>Añadir a mi calendario <span aria-hidden="true">↓</span></button>
    <p>Importa las próximas 12 semanas en tu calendario. Las convocatorias y las inscripciones se confirman en Discord.</p></div>
  <p class="planner-footnote">Es una copia del horario actual, no una suscripción. Si cambia el horario de la hermandad, vuelve a descargarla.</p>
  <p class="planner-feedback" data-calendar-feedback role="status"></p>
</section>`;

function countdown(timestamp, now) {
  const minutes = Math.max(1, Math.ceil((timestamp - now) / 60000));
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), rest = minutes % 60;
  return `Empieza en ${[days && `${days} ${days === 1 ? 'día' : 'días'}`, hours && `${hours} h`, !days && rest && `${rest} min`].filter(Boolean).join(' ')}`;
}

export function attachSchedulePlanner(settings) {
  const planners = [...document.querySelectorAll('.raid-planner')];
  if (!planners.length) return;
  const guildZone = settings.timezone || 'Europe/Madrid';
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || guildZone;
  for (const planner of planners) {
    const select = planner.querySelector('[data-schedule-zone]');
    for (const [zone, label] of [[guildZone, `Hermandad · ${guildZone}`], ...(localZone !== guildZone ? [[localZone, `Mi zona · ${localZone}`]] : [])]) {
      select.add(new Option(label, zone));
    }
    const render = () => {
      const now = Date.now(), sessions = upcomingSessions(settings, {now, limit: 4});
      const status = planner.querySelector('[data-next-status]'), next = planner.querySelector('[data-next-session]');
      const counter = planner.querySelector('[data-countdown]'), list = planner.querySelector('[data-next-sessions]');
      const button = planner.querySelector('[data-download-calendar]');
      list.replaceChildren();
      if (!sessions.length) {
        status.textContent = 'Horario pendiente'; next.textContent = 'Las próximas noches aparecerán cuando se confirme el horario.';
        counter.textContent = ''; button.disabled = true; return;
      }
      button.disabled = false;
      const format = new Intl.DateTimeFormat('es-ES', {timeZone: select.value, weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
      const label = session => `${format.format(session.start)} → ${format.format(session.end)}`;
      status.textContent = sessions[0].start <= now ? 'Dentro del horario habitual' : 'Próximo horario habitual';
      next.textContent = label(sessions[0]);
      counter.textContent = sessions[0].start <= now ? 'Consulta en Discord si hay una convocatoria en curso.' : countdown(sessions[0].start, now);
      for (const session of sessions.slice(1)) {
        const item = document.createElement('li'), time = document.createElement('time');
        time.dateTime = new Date(session.start).toISOString(); time.textContent = label(session);
        item.append(time); list.append(item);
      }
    };
    select.addEventListener('change', render);
    planner.querySelector('[data-download-calendar]').addEventListener('click', () => {
      const now = new Date();
      const sessions = upcomingSessions(settings, {now});
      if (!sessions.length) { render(); return; }
      const url = URL.createObjectURL(new Blob([calendarFile(settings, {now})], {type: 'text/calendar;charset=utf-8'}));
      const link = document.createElement('a'); link.href = url; link.download = 'darkness-of-the-fallen-horarios.ics';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      planner.querySelector('[data-calendar-feedback]').textContent = `Calendario preparado con ${sessions.length} horarios habituales. Ábrelo con tu aplicación de calendario para importarlo.`;
    });
    render();
    const timer = setInterval(render, 60000);
    const resume = () => { if (!document.hidden) render(); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pagehide', event => { if (!event.persisted) { clearInterval(timer); document.removeEventListener('visibilitychange', resume); } });
  }
}
