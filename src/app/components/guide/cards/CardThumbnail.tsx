interface CardThumbnailProps {
  srcdoc: string | null | undefined
  loading?: boolean
  label: string
}

export function CardThumbnail({ srcdoc, loading, label }: CardThumbnailProps) {
  return (
    <div className="guide-card-thumb">
      {srcdoc ? (
        <iframe
          className="guide-card-thumb-iframe"
          sandbox=""
          tabIndex={-1}
          title={`${label} thumbnail`}
          srcDoc={srcdoc}
        />
      ) : (
        <div className="guide-card-thumb-loading">
          {loading ? '加载中...' : '预览不可用'}
        </div>
      )}
    </div>
  )
}
