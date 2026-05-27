import { Fragment } from 'react'
import { copy } from '../copy'

export function MarqueeSection() {
  return (
    <section style={{ background: '#0A1228', color: 'white', padding: '36px 0', overflow: 'hidden' }}>
      <div className="marquee">
        <MarqueeTrack items={copy.marquee.top} variant="solid" />
        <MarqueeTrack items={copy.marquee.top} variant="solid" aria-hidden />
      </div>
      <div className="marquee marquee--reverse" style={{ marginTop: 18 }}>
        <MarqueeTrack items={copy.marquee.bottom} variant="outline" />
        <MarqueeTrack items={copy.marquee.bottom} variant="outline" aria-hidden />
      </div>
    </section>
  )
}

function MarqueeTrack({
  items,
  variant,
  ...rest
}: {
  items: string[]
  variant: 'solid' | 'outline'
  'aria-hidden'?: boolean
}) {
  return (
    <div className="marquee-track" {...rest}>
      {items.map((item, i) => (
        <Fragment key={i}>
          <span className={`marquee-item ${variant === 'outline' ? 'marquee-outline' : ''}`}>
            {item}
          </span>
          <span className="marquee-dot" />
        </Fragment>
      ))}
    </div>
  )
}
