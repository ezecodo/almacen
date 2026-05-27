import { useInView } from '../hooks'
import { copy } from '../copy'

export function StatementSection() {
  const c = copy.statement

  return (
    <section className="statement-section">
      <div className="container">
        <div className="eyebrow" style={{ marginBottom: 36 }}>
          {c.eyebrow}
        </div>
        <h2 className="h-statement statement">
          {c.lines.map((line, li) => (
            <span key={li} style={{ display: 'block' }}>
              {line.map((w, wi) => (
                <StatementWord key={wi} text={w.text} accent={w.accent} />
              ))}
            </span>
          ))}
        </h2>

        <div
          style={{
            marginTop: 64,
            maxWidth: 780,
            fontSize: 20,
            lineHeight: 1.55,
            color: 'var(--text-2)',
          }}
        >
          {c.paragraphs.map((p, i) => (
            <p key={i} style={{ marginBottom: i < c.paragraphs.length - 1 ? 18 : 0 }}>
              {p}
            </p>
          ))}
        </div>
      </div>
    </section>
  )
}

function StatementWord({ text, accent }: { text: string; accent: boolean }) {
  const [ref, inView] = useInView<HTMLSpanElement>({ threshold: 0.55 })
  return (
    <span
      ref={ref}
      className={`statement-word ${accent ? 'statement-word--accent' : ''} ${
        inView ? 'in-view' : ''
      }`}
    >
      {text}
    </span>
  )
}
