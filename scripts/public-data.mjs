// Only explicitly public, editorial data is included in GitHub Pages.
// Never point the build at a database or a leader-only JSON export.
export function publicData(input) {
  const settings = {};
  for (const key of ['name', 'description', 'faction', 'region', 'server', 'ruleset', 'raidStart', 'raidEnd', 'timezone', 'about', 'discordUrl']) {
    if (typeof input.settings?.[key] !== 'string') throw new Error(`Missing public setting: ${key}`);
    settings[key] = input.settings[key];
  }
  if (settings.discordUrl && !/^https:\/\/(discord\.gg\/|discord\.com\/invite\/)[\w-]+$/.test(settings.discordUrl)) {
    throw new Error('discordUrl must be an official Discord invitation or an empty string.');
  }
  if (!Array.isArray(input.settings.raidDays) || input.settings.raidDays.some(day => typeof day !== 'string')) {
    throw new Error('raidDays must be an array of strings.');
  }
  settings.raidDays = input.settings.raidDays;
  settings.recruitmentOpen = false;
  function project(rows, keys, label) {
    if (!Array.isArray(rows)) throw new Error(`${label} must be an array.`);
    return rows.map(row => Object.fromEntries(keys.map(key => {
      if (typeof row[key] !== 'string') throw new Error(`Invalid ${label}.${key}`);
      return [key, row[key]];
    })));
  }
  return {
    settings,
    characters: project(input.characters, ['name', 'class', 'role'], 'characters'),
    raids: project(input.raids, ['id', 'title', 'starts_at', 'source'], 'raids'),
    progress: [],
    authConfigured: false
  };
}
