import { useEffect, useRef, useState, type RefObject } from 'react'

export function useInView<T extends Element = HTMLDivElement>(
  opts: { threshold?: number; rootMargin?: string; once?: boolean } = {}
): [RefObject<T>, boolean] {
  const { threshold = 0.15, rootMargin = '0px', once = true } = opts
  const ref = useRef<T>(null as unknown as T)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    const node = ref.current
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) io.unobserve(node)
        } else if (!once) {
          setInView(false)
        }
      },
      { threshold, rootMargin },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [threshold, rootMargin, once])

  return [ref, inView]
}

export function useStickyActiveIndex<T extends Element = HTMLDivElement>(
  ref: RefObject<T | null> | RefObject<T>,
  count: number,
): number {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const onScroll = () => {
      if (!ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const sectionH = rect.height
      const vh = window.innerHeight
      const traveled = vh / 2 - rect.top
      const p = Math.max(0, Math.min(1, traveled / sectionH))
      const newIdx = Math.min(count - 1, Math.floor(p * count))
      setIdx(newIdx)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [ref, count])
  return idx
}

export function useCounter(target: number, durationMs = 1600, trigger = true): number {
  const [value, setValue] = useState(0)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!trigger) return
    const animate = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      const t = Math.min(1, elapsed / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(target * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      startRef.current = null
    }
  }, [target, durationMs, trigger])

  return value
}

export function useNavScrollState() {
  const [hidden, setHidden] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const lastY = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      const goingDown = y > lastY.current
      setScrolled(y > 80)
      if (y > 200 && goingDown && y - lastY.current > 8) setHidden(true)
      else if (!goingDown && lastY.current - y > 4) setHidden(false)
      lastY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return { hidden, scrolled }
}
