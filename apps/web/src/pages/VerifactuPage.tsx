import VerifactuMatrixLedger from '../components/VerifactuMatrixLedger'

// Demostración de la cadena de registros que exige Veri*factu. Todavía no hay facturación
// real detrás: ver docs/verifactu.md para el mapa de lo que falta.
export default function VerifactuPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-black text-gray-800 mb-1">🔗 Veri*factu</h1>
      <p className="text-sm text-gray-400 mb-4">
        Cada ticket queda encadenado al anterior por una huella. Si alguien altera o borra uno, la cadena deja de cuadrar y se nota.
        Esta pantalla es una demostración con datos de ejemplo: tocá un bloque para ver su detalle, o "Simular manipulación" para ver qué pasa.
      </p>
      <VerifactuMatrixLedger />
    </div>
  )
}
