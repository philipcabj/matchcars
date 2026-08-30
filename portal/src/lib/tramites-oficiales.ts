// portal/src/lib/tramites-oficiales.ts
// Links a trámites oficiales y gratuitos del Estado para los pasos del
// checklist de Módulo A que hoy son 100% manuales — sin ninguna API paga
// de por medio (esas quedan pausadas hasta tener presupuesto, ver memoria
// de la sesión). Verificados en argentina.gob.ar/DNRPA.
export const TRAMITE_INFORME_DOMINIO_URL = "https://www.argentina.gob.ar/servicio/solicitar-un-informe-de-dominio-del-automotor";

export const TRAMITE_FORMULARIO_08_URL = "https://www.argentina.gob.ar/servicio/tramitar-en-linea-formulario-08-para-transferencia-automotor";

// La URL original de este trámite específico (.../realizar-la-verificacion-
// policial-de-automotor-y-motovehiculo) quedó dada de baja en el portal del
// Estado (403 verificado). Esta explica el trámite y linkea a la propia
// DNRPA para ubicar la planta verificadora/Registro Seccional más cercano —
// sigue siendo genérico nacional (CABA, Provincia de Buenos Aires, etc.
// tienen su propio portal de turnos aparte). Un directorio provincia por
// provincia queda para más adelante si esto se termina usando.
export const TRAMITE_VERIFICACION_POLICIAL_URL = "https://www.argentina.gob.ar/servicio/hacer-la-transferencia-de-dominio-de-un-auto-moto-o-maquinaria";
