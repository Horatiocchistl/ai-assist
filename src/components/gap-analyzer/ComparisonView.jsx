import React, { useState, useMemo, useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useAnnotations } from '../../hooks/useAnnotations.js'
import { getSignedUrl, sortPlanImages } from '../../hooks/usePlannedEngagement.js'
import { getLiveSignedUrl } from '../../hooks/usePlannedEngagement.js'
import { getAsinLiveFiles } from '../../hooks/useGapSessions.js'

/**
 * Parse liveFiles to build section list
 * @param {Array} liveFiles - Array of {filename, path} objects
 * @returns {Array} Section objects [{id, label, liveFile}]
 */
function buildSections(liveFiles) {
  const sections = []
  
  // Page - full page view (always first if files exist)
  if (liveFiles.length > 0) {
    sections.push({ 
      id: 'page', 
      label: 'Page', 
      liveFile: null  // special: will show ALL files
    })
  }
  
  // Hero
  const hero = liveFiles.find(f => f.filename === 'hero_viewport.png')
  if (hero) {
    sections.push({ id: 'hero', label: 'Hero', liveFile: hero })
  }

  // Carousel images
  const carousel = liveFiles
    .filter(f => /^carousel_\d+\.png$/i.test(f.filename))
    .sort((a, b) => a.filename.localeCompare(b.filename))
  
  carousel.forEach((file, idx) => {
    sections.push({
      id: `carousel_${String(idx + 1).padStart(2, '0')}`,
      label: `Carousel ${idx + 1}`,
      liveFile: file,
    })
  })

  // A+ modules
  const aplus = liveFiles
    .filter(f => /^aplus_\d+\.png$/i.test(f.filename))
    .sort((a, b) => a.filename.localeCompare(b.filename))
  
  aplus.forEach((file, idx) => {
    sections.push({
      id: `aplus_${String(idx + 1).padStart(2, '0')}`,
      label: `A+ Module ${idx + 1}`,
      liveFile: file,
    })
  })

  return sections
}

/**
 * Structured page view matching Amazon product page layout
 * @param {Array} imageData - Array of {url, filename} objects
 */
function PageViewImages({ imageData }) {
  // Categorize images by type
  const hero = imageData.find(img => img.filename === 'hero_viewport.png')
  
  const carousel = imageData
    .filter(img => /^carousel_\d+\.png$/i.test(img.filename))
    .sort((a, b) => a.filename.localeCompare(b.filename))
  
  const scrolls = imageData
    .filter(img => /^scroll_/.test(img.filename))
    .sort((a, b) => a.filename.localeCompare(b.filename))
  
  const aplus = imageData
    .filter(img => /^aplus_\d+\.png$/i.test(img.filename))
    .sort((a, b) => a.filename.localeCompare(b.filename))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* Hero - large, full-width */}
      {hero && (
        <div>
          <div style={{ fontSize: '0.7em', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
            Hero
          </div>
          <img
            src={hero.url}
            alt="Hero"
            style={{ width: '100%', objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 6 }}
          />
        </div>
      )}

      {/* Carousel - 4-column grid of thumbnails */}
      {carousel.length > 0 && (
        <div>
          <div style={{ fontSize: '0.7em', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
            Carousel ({carousel.length})
          </div>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(4, 1fr)', 
            gap: '0.5rem' 
          }}>
            {carousel.map((img, idx) => (
              <div key={idx} style={{ aspectRatio: '1', overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 4 }}>
                <img
                  src={img.url}
                  alt={`Carousel ${idx + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scroll captures - full-width */}
      {scrolls.length > 0 && (
        <div>
          <div style={{ fontSize: '0.7em', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
            Page Scroll ({scrolls.length})
          </div>
          {scrolls.map((img, idx) => (
            <img
              key={idx}
              src={img.url}
              alt={`Scroll ${idx + 1}`}
              style={{ width: '100%', objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 4, marginBottom: '0.5rem' }}
            />
          ))}
        </div>
      )}

      {/* A+ Modules - full-width, stacked */}
      {aplus.length > 0 && (
        <div>
          <div style={{ fontSize: '0.7em', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
            A+ Content ({aplus.length})
          </div>
          {aplus.map((img, idx) => (
            <div key={idx} style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.65em', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                Module {idx + 1}
              </div>
              <img
                src={img.url}
                alt={`A+ Module ${idx + 1}`}
                style={{ width: '100%', objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 4 }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ComparisonView({ runId, asin, liveFiles, plan, onBack }) {
  const { annotations, saveAnnotation } = useAnnotations(runId, asin)
  const [activeSection, setActiveSection] = useState(null)
  const [liveImageUrl, setLiveImageUrl] = useState(null)
  const [plannedImageUrls, setPlannedImageUrls] = useState([])
  
  const sections = useMemo(() => {
    const asinFiles = getAsinLiveFiles(liveFiles, asin)
    return buildSections(asinFiles)
  }, [liveFiles, asin])

  // Set initial active section
  useEffect(() => {
    if (sections.length > 0 && !activeSection) {
      setActiveSection(sections[0].id)
    }
  }, [sections, activeSection])

  // Load images for active section
  useEffect(() => {
    async function loadImages() {
      if (!activeSection || !sections.length) return

      const section = sections.find(s => s.id === activeSection)
      if (!section) return

      // Special handling for "Page" section - load ALL live captures
      if (activeSection === 'page') {
        const asinFiles = getAsinLiveFiles(liveFiles, asin)
        const imageFiles = asinFiles
          .filter(f => /\.(png|jpe?g|webp)$/i.test(f.filename))
          .sort((a, b) => a.filename.localeCompare(b.filename))
        
        const imageData = await Promise.all(
          imageFiles.map(async (f) => {
            if (!f.path) return null
            const url = await getLiveSignedUrl(f.path)
            return url ? { url, filename: f.filename } : null
          })
        )
        
        // Store as object with imageData array
        setLiveImageUrl({ imageData: imageData.filter(Boolean) })
      } else {
        // Individual section - load single live image
        if (section.liveFile?.path) {
          const liveUrl = await getLiveSignedUrl(section.liveFile.path)
          setLiveImageUrl(liveUrl)  // Single URL string
        } else {
          setLiveImageUrl(null)
        }
      }

      // Load planned images (shows all planned images)
      if (plan?.images) {
        const sorted = sortPlanImages(plan.images)
        const urls = await Promise.all(
          sorted.map(async (img) => {
            if (img.path) {
              return await getSignedUrl(img.path)
            }
            return null
          })
        )
        setPlannedImageUrls(urls.filter(Boolean))
      } else {
        setPlannedImageUrls([])
      }
    }

    loadImages()
  }, [activeSection, sections, plan, liveFiles, asin])

  const currentAnnotation = annotations[activeSection] || { note: '', severity: null }

  const handleNoteChange = (note) => {
    saveAnnotation(activeSection, note, currentAnnotation.severity)
  }

  const handleSeverityChange = (severity) => {
    saveAnnotation(activeSection, currentAnnotation.note, severity)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{
        flexShrink: 0,
        height: 44,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0 1.25rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
      }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '0.8em',
            padding: '0.2rem 0.4rem',
            borderRadius: 4,
          }}
        >
          <ArrowLeft size={14} />
          Results
        </button>
        <span style={{ color: 'var(--border)' }}>/</span>
        <span style={{ fontFamily: 'monospace', fontSize: '0.85em', fontWeight: 600, color: 'var(--text-primary)' }}>
          {asin}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75em', marginLeft: 'auto' }}>
          Comparison View
        </span>
      </div>

      {/* Section navigation tabs */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        gap: '0.5rem',
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        overflowX: 'auto',
      }}>
        {sections.map((section) => {
          const active = activeSection === section.id
          return (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              style={{
                padding: '0.4rem 0.75rem',
                border: 'none',
                borderRadius: 6,
                background: active ? 'var(--accent)' : 'var(--bg-panel)',
                color: active ? '#fff' : 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '0.75em',
                fontWeight: active ? 600 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              {section.label}
            </button>
          )
        })}
      </div>

      {/* Two-column layout: Live | Planned */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Live column */}
        <div style={{ flex: '0 0 50%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
          <div style={{
            padding: '0.75rem 1rem',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            fontSize: '0.75em',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
          }}>
            Live (scraped)
          </div>
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1rem',
            display: 'flex',
            alignItems: liveImageUrl?.imageData ? 'flex-start' : 'center',
            justifyContent: 'center',
            background: '#f5f5f5',
          }}>
            {liveImageUrl?.imageData ? (
              // Page view - structured layout matching Amazon
              <PageViewImages imageData={liveImageUrl.imageData} />
            ) : liveImageUrl && typeof liveImageUrl === 'string' ? (
              // Individual section - single image
              <img
                src={liveImageUrl}
                alt="Live capture"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8em' }}>No live capture</span>
            )}
          </div>
        </div>

        {/* Planned column */}
        <div style={{ flex: '0 0 50%', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            padding: '0.75rem 1rem',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            fontSize: '0.75em',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
          }}>
            Planned (uploaded)
          </div>
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            background: '#f5f5f5',
          }}>
            {plannedImageUrls.length > 0 ? (
              plannedImageUrls.map((url, idx) => (
                <img
                  key={idx}
                  src={url}
                  alt={`Planned ${idx + 1}`}
                  style={{ maxWidth: '100%', objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 4 }}
                />
              ))
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8em', textAlign: 'center' }}>No planned images</span>
            )}
          </div>
        </div>
      </div>

      {/* Annotation panel */}
      <div style={{
        flexShrink: 0,
        padding: '1rem',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}>
        <textarea
          value={currentAnnotation.note || ''}
          onChange={(e) => handleNoteChange(e.target.value)}
          onBlur={(e) => handleNoteChange(e.target.value)}
          placeholder="Add notes about this section..."
          style={{
            width: '100%',
            minHeight: 60,
            padding: '0.5rem',
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--bg-panel)',
            color: 'var(--text-primary)',
            fontSize: '0.8em',
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75em', color: 'var(--text-muted)', fontWeight: 600 }}>Severity:</span>
          {['critical', 'warning', 'ok'].map((sev) => {
            const active = currentAnnotation.severity === sev
            const colors = {
              critical: { bg: '#c05820', text: '#fff' },
              warning: { bg: '#e0a040', text: '#fff' },
              ok: { bg: 'var(--accent)', text: '#fff' },
            }
            return (
              <button
                key={sev}
                onClick={() => handleSeverityChange(sev)}
                style={{
                  padding: '0.35rem 0.75rem',
                  border: active ? 'none' : '1px solid var(--border)',
                  borderRadius: 6,
                  background: active ? colors[sev].bg : 'var(--bg-panel)',
                  color: active ? colors[sev].text : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.75em',
                  fontWeight: active ? 600 : 400,
                  textTransform: 'capitalize',
                }}
              >
                {sev}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
