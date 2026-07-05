import { useState, useEffect } from 'react'

// ── Text-to-Speech multi-idioma (Web Speech API) ───────────────────────────────
// La voz la pone el dispositivo. En tablets Android son las voces neuronales de
// Google; en desktop suelen ser más robóticas. El usuario elige la mejor voz por
// idioma y se recuerda en localStorage (una preferencia de voz por idioma).

export type Lang = 'en' | 'fr' | 'de'

export const LANGS: { code: Lang; label: string; flag: string; bcp47: string }[] = [
  { code: 'en', label: 'Inglés',  flag: '🇬🇧', bcp47: 'en-GB' },
  { code: 'fr', label: 'Francés', flag: '🇫🇷', bcp47: 'fr-FR' },
  { code: 'de', label: 'Alemán',  flag: '🇩🇪', bcp47: 'de-DE' },
]

const SAMPLES: Record<Lang, string> = {
  en: 'Hi, welcome! This is how the welcome speech will sound.',
  fr: 'Bonjour et bienvenue ! Voici comment sonnera le discours.',
  de: 'Hallo und willkommen! So wird die Ansage klingen.',
}

const RATE_KEY = 'tts_rate'
const voiceKey = (lang: Lang) => `tts_voice_${lang}`

export const getSavedVoiceURI = (lang: Lang) => localStorage.getItem(voiceKey(lang)) ?? ''
export const setSavedVoiceURI = (lang: Lang, uri: string) => localStorage.setItem(voiceKey(lang), uri)
export const getSavedRate = () => {
  const r = Number(localStorage.getItem(RATE_KEY))
  return r > 0 ? r : 0.95
}
export const setSavedRate = (r: number) => localStorage.setItem(RATE_KEY, String(r))

// Voces disponibles para un idioma (ej: 'en' → en-GB, en-US…)
export const voicesForLang = (voices: SpeechSynthesisVoice[], lang: Lang) =>
  voices.filter(v => v.lang.toLowerCase().startsWith(lang))

// Elige la voz de un idioma: guardada → región preferida → cualquiera del idioma
function pickVoice(voices: SpeechSynthesisVoice[], lang: Lang): SpeechSynthesisVoice | undefined {
  const saved = getSavedVoiceURI(lang)
  const meta = LANGS.find(l => l.code === lang)!
  return (saved ? voices.find(v => v.voiceURI === saved) : undefined)
    ?? voices.find(v => v.lang.toLowerCase() === meta.bcp47.toLowerCase())
    ?? voices.find(v => v.lang.toLowerCase().startsWith(lang))
}

export function speak(text: string, lang: Lang = 'en') {
  if (!text.trim() || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = getSavedRate()
  const meta = LANGS.find(l => l.code === lang)!
  const chosen = pickVoice(window.speechSynthesis.getVoices(), lang)
  u.lang = chosen?.lang ?? meta.bcp47
  if (chosen) u.voice = chosen
  window.speechSynthesis.speak(u)
}

// Hook: todas las voces del dispositivo (se cargan async)
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const load = () => setVoices(window.speechSynthesis.getVoices())
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])
  return voices
}

const VELOCIDADES = [
  { label: '🐢 Lenta',  v: 0.8  },
  { label: 'Normal',    v: 0.95 },
  { label: '🐇 Rápida', v: 1.1  },
]

// ── Selector reutilizable de voz (por idioma) + velocidad ──────────────────────
export function VozSelector({ langs = ['en', 'fr', 'de'], dark = false }: { langs?: Lang[]; dark?: boolean }) {
  const voices = useVoices()
  const [rate, setRate] = useState(getSavedRate())
  const [sel, setSel] = useState<Record<string, string>>({})

  // Reflejar la voz por defecto de cada idioma cuando cargan las voces
  useEffect(() => {
    if (!voices.length) return
    setSel(prev => {
      const next = { ...prev }
      for (const lang of langs) {
        if (!next[lang]) {
          const def = pickVoice(voices, lang)
          if (def) next[lang] = def.voiceURI
        }
      }
      return next
    })
  }, [voices, langs])

  const cambiarVoz = (lang: Lang, uri: string) => {
    setSel(prev => ({ ...prev, [lang]: uri }))
    setSavedVoiceURI(lang, uri)
  }
  const cambiarRate = (v: number) => { setRate(v); setSavedRate(v) }

  const labelCls  = dark ? 'text-[var(--sala-tx3)]' : 'text-gray-500'
  const selectCls = dark
    ? 'bg-[var(--sala-btn2)] text-[var(--sala-txt)] border-[var(--sala-brd)]'
    : 'bg-white text-gray-700 border-gray-200'

  return (
    <div className="flex flex-col gap-2">
      {langs.map(code => {
        const meta = LANGS.find(l => l.code === code)!
        const opts = voicesForLang(voices, code)
        return (
          <div key={code} className="flex items-center gap-2">
            <span className={`text-xs font-medium shrink-0 w-6 text-center`} title={meta.label}>{meta.flag}</span>
            {opts.length === 0 ? (
              <span className={`text-xs flex-1 ${labelCls}`}>Sin voz {meta.label.toLowerCase()} en este dispositivo</span>
            ) : (
              <select
                value={sel[code] ?? ''}
                onChange={e => cambiarVoz(code, e.target.value)}
                className={`flex-1 min-w-0 text-xs rounded-lg border px-2 py-1.5 focus:outline-none ${selectCls}`}
              >
                {opts.map(v => (
                  <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                ))}
              </select>
            )}
            <button
              onClick={() => speak(SAMPLES[code], code)}
              disabled={opts.length === 0}
              className="shrink-0 text-xs font-semibold bg-[#4CC8A0] text-white px-2.5 py-1.5 rounded-lg active:scale-95 transition-transform disabled:opacity-30"
            >
              ▶
            </button>
          </div>
        )
      })}
      <div className="flex items-center gap-2 pt-0.5">
        <span className={`text-xs font-medium shrink-0 ${labelCls}`}>Velocidad</span>
        <div className="flex gap-1">
          {VELOCIDADES.map(vel => {
            const on = Math.abs(rate - vel.v) < 0.001
            return (
              <button
                key={vel.v}
                onClick={() => cambiarRate(vel.v)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  on
                    ? 'bg-[#4CC8A0] text-white border-transparent'
                    : dark
                      ? 'bg-[var(--sala-btn2)] text-[var(--sala-tx2)] border-[var(--sala-brd)]'
                      : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {vel.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
