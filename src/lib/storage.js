export const PROJECTS_KEY = 'computerui_projects'
const ACTIVE_PROJECT_KEY = 'computerui_active_project_id'

export function loadProjects() {
  try {
    return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveProjects(projects) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
}

export function loadActiveProjectId() {
  return localStorage.getItem(ACTIVE_PROJECT_KEY) || null
}

export function saveActiveProjectId(id) {
  if (id) localStorage.setItem(ACTIVE_PROJECT_KEY, id)
  else localStorage.removeItem(ACTIVE_PROJECT_KEY)
}

export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
