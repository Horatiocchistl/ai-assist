import { useState, useEffect, useCallback } from 'react'
import supabase from '../lib/supabase.js'

/**
 * Hook for managing image tags in comparison view
 * @param {string} runId - The run ID
 * @param {string} asin - The ASIN
 * @param {string} section - The section (page, hero, carousel_01, etc.)
 * @returns {{tags: Array, loading: boolean, addTag: Function, removeTag: Function, getImageTags: Function, isLinkedTag: Function}}
 */
export function useImageTags(runId, asin, section) {
  const [tags, setTags] = useState([]) // all tags for this section
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!runId || !asin || !section) {
        setLoading(false)
        return
      }
      
      const { data, error } = await supabase
        .from('image_tags')
        .select('*')
        .eq('run_id', runId)
        .eq('asin', asin)
        .eq('section', section)
      
      if (error) {
        console.error('[useImageTags] load error:', error.message)
      }
      
      setTags(data || [])
      setLoading(false)
    }
    load()
  }, [runId, asin, section])

  const addTag = useCallback(async (imageType, imageIndex, tag) => {
    const tagValue = tag.trim()
    if (!tagValue) return { ok: false, error: 'Tag cannot be empty' }

    const { data, error } = await supabase
      .from('image_tags')
      .upsert({
        run_id: runId,
        asin,
        section,
        image_type: imageType,
        image_index: imageIndex,
        tag: tagValue
      }, { onConflict: 'run_id,asin,section,image_type,image_index,tag' })
      .select()
    
    if (!error && data && data[0]) {
      setTags(prev => {
        // Check if already exists
        const exists = prev.some(t => t.id === data[0].id)
        return exists ? prev : [...prev, data[0]]
      })
    }
    
    return { ok: !error, error: error?.message }
  }, [runId, asin, section])

  const removeTag = useCallback(async (tagId) => {
    const { error } = await supabase
      .from('image_tags')
      .delete()
      .eq('id', tagId)
    
    if (!error) {
      setTags(prev => prev.filter(t => t.id !== tagId))
    }
    
    return { ok: !error, error: error?.message }
  }, [])

  // Get tags for specific image
  const getImageTags = useCallback((imageType, imageIndex) => {
    return tags.filter(t => 
      t.image_type === imageType && 
      (imageIndex === null ? t.image_index === null : t.image_index === imageIndex)
    )
  }, [tags])

  // Check if tag is linked (exists on both live and planned)
  const isLinkedTag = useCallback((tagName) => {
    const liveHasTag = tags.some(t => t.image_type === 'live' && t.tag === tagName)
    const plannedHasTag = tags.some(t => t.image_type === 'planned' && t.tag === tagName)
    return liveHasTag && plannedHasTag
  }, [tags])

  // Get all unique tags in section
  const allUniqueTags = useCallback(() => {
    const uniqueTags = new Set()
    tags.forEach(t => uniqueTags.add(t.tag))
    return Array.from(uniqueTags).sort()
  }, [tags])

  return { tags, loading, addTag, removeTag, getImageTags, isLinkedTag, allUniqueTags }
}
