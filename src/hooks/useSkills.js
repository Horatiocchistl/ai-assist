import { useState, useEffect } from 'react'
import { fetchSkillCatalog } from '../lib/skills.js'

export function useSkills() {
  const [catalog, setCatalog] = useState([])

  useEffect(() => {
    fetchSkillCatalog().then(setCatalog)
  }, [])

  return {
    catalog,
    refreshCatalog: () => fetchSkillCatalog().then(setCatalog),
  }
}
