import VerifactuMatrixLedger from '../components/VerifactuMatrixLedger'

// Demostración de la cadena de registros que exige Veri*factu, a toda la altura de la página.
// Todavía no hay facturación real detrás: ver docs/verifactu.md para el mapa de lo que falta.
export default function VerifactuPage() {
  return (
    <div className="h-full min-h-[700px] bg-[#030712] p-3 sm:p-4">
      <VerifactuMatrixLedger />
    </div>
  )
}
