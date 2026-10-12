# Compartido por actualizar.sh y alta-cliente.sh. Se carga con `source`, no se ejecuta.
#
# Cada cliente de la suite es una instalación completa: su propio clon de este repo,
# su base de datos, su proceso PM2 y su dirección. El registro dice cuáles existen.
# Una línea por instalación, seis campos separados por espacios:
#
#   codigo  carpeta  proceso_pm2  puerto  carpeta_web  dominio
#
# `codigo` es el identificador del cliente en el back-office (oido-talent → /admin → Suite OidoOps).

REGISTRO="${OIDOOPS_REGISTRO:-/root/oidoops/instalaciones}"

# La primera vez no hay registro: se crea con la instalación que ya existía (Sensi),
# apuntando a donde vive hoy. No se mueve ni se renombra nada suyo.
asegurar_registro() {
  [ -f "$REGISTRO" ] && return 0
  mkdir -p "$(dirname "$REGISTRO")"
  {
    echo "# codigo carpeta proceso_pm2 puerto carpeta_web dominio"
    echo "sensi /root/almacen almacen-api 3001 /var/www/almacen almacen.ezeangeloni.xyz"
  } > "$REGISTRO"
  echo "→ Registro de instalaciones creado en $REGISTRO"
}

# Líneas útiles del registro (sin comentarios ni vacías)
instalaciones() {
  grep -vE '^[[:space:]]*(#|$)' "$REGISTRO" || true
}
