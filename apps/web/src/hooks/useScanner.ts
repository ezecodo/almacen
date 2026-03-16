import { useEffect, useRef } from 'react'

interface UseScannerOptions {
  onScan: (barcode: string) => void
  enabled?: boolean
  minLength?: number
  /** Max ms between chars to be considered scanner input (default 100) */
  scanSpeed?: number
}

export function useScanner({
  onScan,
  enabled = true,
  minLength = 4,
  scanSpeed = 100,
}: UseScannerOptions) {
  const bufferRef = useRef('')
  const lastKeyTimeRef = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now()
      const timeSinceLast = now - lastKeyTimeRef.current
      lastKeyTimeRef.current = now

      // If too much time passed since last key, reset buffer (human typing)
      if (timeSinceLast > scanSpeed && bufferRef.current.length > 0) {
        bufferRef.current = ''
      }

      if (e.key === 'Enter') {
        const barcode = bufferRef.current.trim()
        bufferRef.current = ''
        if (barcode.length >= minLength) {
          onScan(barcode)
        }
        return
      }

      // Only accumulate printable single chars
      if (e.key.length === 1) {
        bufferRef.current += e.key
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, minLength, onScan, scanSpeed])
}
