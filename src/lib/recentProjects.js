const RECENT_KEY = 'team_tracker_recent_projects'

export function getRecentIds() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  } catch {
    return []
  }
}

export function recordRecentProject(projectId) {
  try {
    const current = getRecentIds().filter((id) => id !== projectId)
    current.unshift(projectId)
    localStorage.setItem(RECENT_KEY, JSON.stringify(current.slice(0, 5)))
  } catch {
    // ignore storage errors (e.g. private browsing)
  }
}
