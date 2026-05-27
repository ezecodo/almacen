import { useEffect, useMemo, useState } from 'react'

export function RevealText({
  text,
  delay = 0,
  perChar = 35,
  className = '',
}: {
  text: string
  delay?: number
  perChar?: number
  className?: string
}) {
  const chars = useMemo(() => text.split(''), [text])
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const r1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => setRevealed(true))
    })
    return () => cancelAnimationFrame(r1)
  }, [])
  return (
    <span className={`reveal-letter-wrap ${className}`}>
      {chars.map((c, i) => (
        <span
          key={i}
          className={`reveal-letter ${revealed ? 'is-revealed' : ''}`}
          style={{
            animationDelay: `${delay + i * perChar}ms`,
            whiteSpace: c === ' ' ? 'pre' : 'normal',
          }}
        >
          {c}
        </span>
      ))}
    </span>
  )
}

export function PairRotor({
  pairs,
  intervalMs = 2600,
  startDelay = 0,
}: {
  pairs: Array<[string, string]>
  intervalMs?: number
  startDelay?: number
}) {
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'entering' | 'leaving'>('idle')

  useEffect(() => {
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    const schedule = (fn: () => void, ms: number) => {
      timers.push(
        setTimeout(() => {
          if (!cancelled) fn()
        }, ms),
      )
    }
    const cycle = () => {
      schedule(() => setPhase('leaving'), intervalMs - 600)
      schedule(() => {
        setIdx((prev) => (prev + 1) % pairs.length)
        setPhase('entering')
        cycle()
      }, intervalMs)
    }
    schedule(() => {
      setPhase('entering')
      cycle()
    }, startDelay)
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [intervalMs, startDelay, pairs.length])

  const maxSubject = Math.max(...pairs.map(([s]) => s.length))
  const maxAdj = Math.max(...pairs.map(([, a]) => a.length))
  const [subject, adj] = pairs[idx]
  const phaseClass =
    phase === 'entering' ? 'is-entering' : phase === 'leaving' ? 'is-leaving' : ''

  const hidden = phase === 'idle'

  return (
    <>
      <span style={{ display: 'block', opacity: hidden ? 0 : 1 }}>
        <span className="hero-rotor" style={{ minWidth: `${maxSubject * 0.5}em` }}>
          <span
            key={idx + '-sub-' + phase}
            className={`hero-rotor-word hero-rotor-word--subject ${phaseClass}`}
          >
            {subject}
          </span>
        </span>
      </span>
      <span style={{ display: 'block', marginTop: '0.06em', opacity: hidden ? 0 : 1 }}>
        <span className="hero-rotor" style={{ minWidth: `${maxAdj * 0.55}em` }}>
          <span
            key={idx + '-adj-' + phase}
            className={`hero-rotor-word ${phaseClass}`}
            style={{ animationDelay: phase === 'entering' ? '0.08s' : '0s' }}
          >
            {adj}
          </span>
        </span>
      </span>
    </>
  )
}

export function WordRotor({
  words,
  intervalMs = 2400,
  startDelay = 0,
}: {
  words: string[]
  intervalMs?: number
  startDelay?: number
}) {
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'entering' | 'leaving'>('idle')

  useEffect(() => {
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    const schedule = (fn: () => void, ms: number) => {
      timers.push(
        setTimeout(() => {
          if (!cancelled) fn()
        }, ms),
      )
    }
    const cycle = () => {
      schedule(() => setPhase('leaving'), intervalMs - 600)
      schedule(() => {
        setIdx((prev) => (prev + 1) % words.length)
        setPhase('entering')
        cycle()
      }, intervalMs)
    }
    schedule(() => {
      setPhase('entering')
      cycle()
    }, startDelay)
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [intervalMs, startDelay, words.length])

  const maxLen = Math.max(...words.map((w) => w.length))
  return (
    <span className="hero-rotor" style={{ minWidth: `${maxLen * 0.55}em` }}>
      <span
        key={idx + '-' + phase}
        className={`hero-rotor-word ${
          phase === 'entering' ? 'is-entering' : phase === 'leaving' ? 'is-leaving' : ''
        }`}
      >
        {words[idx]}
      </span>
    </span>
  )
}
