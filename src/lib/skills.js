const SERVER = 'http://localhost:3001'

export async function fetchSkillCatalog() {
  try {
    const res = await fetch(`${SERVER}/api/skills`)
    return await res.json()
  } catch {
    return []
  }
}
