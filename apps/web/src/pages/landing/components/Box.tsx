import { copy } from '../copy'
import { useInView } from '../hooks'

// La Oído Box: el aparato que va en cada local (imprime los tickets y le dice a OidoOps cuál es
// la red del restaurante). Sección clara, con la caja recortada flotando sobre un halo de marca.
export function BoxSection() {
  const c = copy.box
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.25 })

  return (
    <section className="section section--paper box-section">
      <div className="container box-grid">
        <div>
          <div className="eyebrow" style={{ marginBottom: 28 }}>{c.eyebrow}</div>
          <h2 className="h-section box-title">
            {c.title}
            <br />
            <span style={{ color: 'var(--teal)', fontStyle: 'italic' }}>{c.titleAccent}</span>
          </h2>
          <p className="body-lg box-sub">{c.sub}</p>
        </div>

        <div ref={ref} className={`box-stage ${inView ? 'in-view' : ''}`}>
          <div className="box-halo" aria-hidden />
          <img className="box-img" src="/oido-box.webp" alt={c.imageAlt} width={760} height={484} loading="lazy" />
          <span className="box-chip box-chip--a"><span className="box-chip-dot" />{c.chips[0]}</span>
          <span className="box-chip box-chip--b">{c.chips[1]}</span>
        </div>
      </div>

      <div className="container">
        <ul className="box-points">
          {c.points.map((p) => (
            <li key={p.num}>
              <div className="box-point-num">{p.num}</div>
              <h4>{p.title}</h4>
              <p>{p.body}</p>
            </li>
          ))}
        </ul>
        <div className="box-foot">
          {c.foot.map((f) => <span key={f}>{f}</span>)}
        </div>
      </div>
    </section>
  )
}
