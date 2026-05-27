import { useEffect } from 'react'
import { Nav } from './landing/components/Nav'
import { HeroSection } from './landing/components/Hero'
import { MarqueeSection } from './landing/components/Marquee'
import { StickyFeaturesSection } from './landing/components/StickyFeatures'
import { CamareroSection } from './landing/components/Camarero'
import { ModulesSection } from './landing/components/Modules'
import { VerifactuSection } from './landing/components/Verifactu'
import { StatementSection } from './landing/components/Statement'
import { StatsSection } from './landing/components/Stats'
import { CloserSection } from './landing/components/Closer'
import './landing/landing.css'

export default function LandingPage() {
  useEffect(() => {
    const prev = document.body.style.overflowX
    document.body.style.overflowX = 'hidden'
    return () => {
      document.body.style.overflowX = prev
    }
  }, [])

  return (
    <div className="landing-root">
      <Nav />
      <HeroSection />
      <MarqueeSection />
      <StickyFeaturesSection />
      <CamareroSection />
      <ModulesSection />
      <VerifactuSection />
      <StatementSection />
      <StatsSection />
      <CloserSection />
    </div>
  )
}
