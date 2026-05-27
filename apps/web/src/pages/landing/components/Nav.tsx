import { Link } from 'react-router-dom'
import { useNavScrollState } from '../hooks'
import { OidoLogoFull } from './Device'
import { copy } from '../copy'

export function Nav() {
  const { hidden, scrolled } = useNavScrollState()
  return (
    <nav className={`nav ${hidden ? 'is-hidden' : ''} ${scrolled ? 'is-scrolled' : ''}`}>
      <OidoLogoFull size={26} />
      <div className="nav-links">
        {copy.nav.links.map((link, i) => (
          <a
            key={link.href}
            className={`nav-link ${i === 0 ? 'is-active' : ''}`}
            href={link.href}
          >
            {link.label}
          </a>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Link className="nav-link" to={copy.nav.accessHref} style={{ color: 'var(--text)' }}>
          {copy.nav.access}
        </Link>
        <button
          className="btn btn--primary"
          style={{ height: 40, padding: '0 18px', fontSize: 14 }}
        >
          {copy.nav.cta}
        </button>
      </div>
    </nav>
  )
}
