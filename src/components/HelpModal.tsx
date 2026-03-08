import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import helpContent from '../../HELP.md?raw'

interface HelpModalProps {
  accentColor: string
  onClose: () => void
}

export function HelpModal({ accentColor, onClose }: HelpModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="help-markdown" style={{ '--accent': accentColor } as React.CSSProperties}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              img: ({ src, alt }) => (
                <div className="help-feature-screenshot">
                  <img
                    src={src?.startsWith('screenshots/') ? `/${src}` : src}
                    alt={alt || ''}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                </div>
              ),
            }}
          >
            {helpContent}
          </ReactMarkdown>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn-create"
            style={{ backgroundColor: accentColor }}
            onClick={onClose}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
