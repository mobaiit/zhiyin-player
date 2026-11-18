const EMPTY_LIBRARY = Object.freeze({ playlists: [], history: [], settings: {}, updatedAt: null });

export function parseUserData(value) {
  let parsed;
  try { parsed = JSON.parse(value || '[]'); } catch { parsed = []; }
  if (Array.isArray(parsed)) return { version: 1, favorites: parsed, library: { ...EMPTY_LIBRARY } };
  if (!parsed || typeof parsed !== 'object') return { version: 1, favorites: [], library: { ...EMPTY_LIBRARY } };
  const library = parsed.library && typeof parsed.library === 'object' && !Array.isArray(parsed.library) ? parsed.library : EMPTY_LIBRARY;
  return {
    version: 2,
    favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
    library: {
      playlists: Array.isArray(library.playlists) ? library.playlists : [],
      history: Array.isArray(library.history) ? library.history : [],
      settings: library.settings && typeof library.settings === 'object' && !Array.isArray(library.settings) ? library.settings : {},
      updatedAt: typeof library.updatedAt === 'string' ? library.updatedAt : null,
    },
  };
}

export function serializeUserData(favorites, library) {
  return JSON.stringify({
    version: 2,
    favorites: Array.isArray(favorites) ? favorites : [],
    library: {
      playlists: Array.isArray(library?.playlists) ? library.playlists : [],
      history: Array.isArray(library?.history) ? library.history : [],
      settings: library?.settings && typeof library.settings === 'object' && !Array.isArray(library.settings) ? library.settings : {},
      updatedAt: typeof library?.updatedAt === 'string' ? library.updatedAt : null,
    },
  });
}
