(function (raiz) {
  "use strict";

  var BASE = {
    partida: { periodo: "mes", mesInicial: "2025-01", semilla: 50928 },
    entorno: { metaInflacion: 0.03, banda: 0.01, pasoTiie: 0.0025, tasaRealNeutral: 0.03, pisoTiie: 0.03, inflacionExterna: 0.025 },
    credito: { AAA: 0.02, AA: 0.04, A: 0.06, BBB: 0.09, plazoMin: 6, plazoMax: 36, comisionApertura: 0.01, maxActivos: 0.40, mesesGracia: 2 },
    operacion: { comision: 0.0025, diferencialPublico: 0.005, diferencialCambiario: 0.005, impuestoGanancias: 0.10, retencionDividendos: 0.10, operacionesPorTurno: 3 },
    limites: { porOperacion: 0.05, tenenciaMax: 0.30, bandaCruce: 0.05 },
    precio: { multiploUtilidad: 12, castigoDividendo: 0.05 },
    riesgos: {
      maxPorPeriodo: 2,
      mercado: 0.06, giro: 0.08, personas: 0.04, procesos: 0.04, sistemas: 0.03,
      tasas: 0.05, tipoCambio: 0.05, legal: 0.03, regulatorio: 0.03, chisme: 0.05,
      incumplimientoMin: 0.01, incumplimientoMax: 0.05
    },
    puntaje: { valorMercado: 0.40, utilidad: 0.30, salud: 0.30 }
  };

  var GRUPOS = [
    { id: "partida", titulo: "Partida" },
    { id: "entorno", titulo: "Entorno económico" },
    { id: "credito", titulo: "Crédito bancario", nota: "Tasa = TIIE + sobretasa según la calificación. Debajo de BBB el crédito se niega." },
    { id: "operacion", titulo: "Operación" },
    { id: "limites", titulo: "Límites", nota: "Sin ventas en corto. Los cruces entre empresas se pactan dentro de la banda." },
    { id: "riesgos", titulo: "Riesgos", nota: "Probabilidad de cada evento por periodo. Incumplimiento según el endeudamiento." },
    { id: "puntaje", titulo: "Puntaje y precio", nota: "Las ponderaciones del puntaje deben sumar 100 %." }
  ];

  var CAMPOS = [
    { ruta: "partida.periodo", label: "Periodo por ronda", tipo: "select", opciones: [{ valor: "mes", nombre: "Mensual" }, { valor: "trimestre", nombre: "Trimestral" }] },
    { ruta: "partida.mesInicial", label: "Mes inicial", tipo: "select", opciones: [] },
    { ruta: "partida.semilla", label: "Semilla", tipo: "entero", min: 1, max: 4294967295 },

    { ruta: "entorno.metaInflacion", label: "Meta de inflación", tipo: "porcentaje", min: 0, max: 0.2 },
    { ruta: "entorno.banda", label: "Banda (±)", tipo: "porcentaje", min: 0, max: 0.05 },
    { ruta: "entorno.pasoTiie", label: "Paso de la TIIE", tipo: "porcentaje", min: 0.0005, max: 0.02 },
    { ruta: "entorno.tasaRealNeutral", label: "Tasa real neutral", tipo: "porcentaje", min: 0, max: 0.1 },
    { ruta: "entorno.pisoTiie", label: "Piso de la TIIE", tipo: "porcentaje", min: 0, max: 0.15 },
    { ruta: "entorno.inflacionExterna", label: "Inflación de EUA", tipo: "porcentaje", min: 0, max: 0.2 },

    { ruta: "credito.AAA", label: "Sobretasa AAA", tipo: "porcentaje", min: 0, max: 0.5 },
    { ruta: "credito.AA", label: "Sobretasa AA", tipo: "porcentaje", min: 0, max: 0.5 },
    { ruta: "credito.A", label: "Sobretasa A", tipo: "porcentaje", min: 0, max: 0.5 },
    { ruta: "credito.BBB", label: "Sobretasa BBB", tipo: "porcentaje", min: 0, max: 0.5 },
    { ruta: "credito.plazoMin", label: "Plazo mínimo (meses)", tipo: "entero", min: 1, max: 120 },
    { ruta: "credito.plazoMax", label: "Plazo máximo (meses)", tipo: "entero", min: 1, max: 120 },
    { ruta: "credito.comisionApertura", label: "Comisión de apertura", tipo: "porcentaje", min: 0, max: 0.1 },
    { ruta: "credito.maxActivos", label: "Máximo sobre activos", tipo: "porcentaje", min: 0, max: 1 },
    { ruta: "credito.mesesGracia", label: "Meses para regularizar un impago", tipo: "entero", min: 0, max: 12, ayuda: "Después, la empresa quiebra" },

    { ruta: "operacion.comision", label: "Comisión por operación", tipo: "porcentaje", min: 0, max: 0.05 },
    { ruta: "operacion.diferencialPublico", label: "Diferencial del público", tipo: "porcentaje", min: 0, max: 0.1 },
    { ruta: "operacion.diferencialCambiario", label: "Diferencial cambiario", tipo: "porcentaje", min: 0, max: 0.1 },
    { ruta: "operacion.impuestoGanancias", label: "Impuesto a ganancias", tipo: "porcentaje", min: 0, max: 0.5 },
    { ruta: "operacion.retencionDividendos", label: "Retención de dividendos", tipo: "porcentaje", min: 0, max: 0.5 },
    { ruta: "operacion.operacionesPorTurno", label: "Operaciones por turno", tipo: "entero", min: 1, max: 10 },

    { ruta: "limites.porOperacion", label: "Máximo por operación", tipo: "porcentaje", min: 0.001, max: 1, ayuda: "% de las acciones o bonos de la emisora" },
    { ruta: "limites.tenenciaMax", label: "Tenencia máxima", tipo: "porcentaje", min: 0.001, max: 1, ayuda: "% de una emisora por participante" },
    { ruta: "limites.bandaCruce", label: "Banda de precio en cruces", tipo: "porcentaje", min: 0, max: 0.5, ayuda: "± sobre la cotización vigente" },

    { ruta: "riesgos.maxPorPeriodo", label: "Máximo de riesgos por periodo", tipo: "entero", min: 0, max: 10 },
    { ruta: "riesgos.mercado", label: "Mercado", tipo: "porcentaje", min: 0, max: 1 },
    { ruta: "riesgos.giro", label: "Giro", tipo: "porcentaje", min: 0, max: 1 },
    { ruta: "riesgos.personas", label: "Personas", tipo: "porcentaje", min: 0, max: 1 },
    { ruta: "riesgos.procesos", label: "Procesos", tipo: "porcentaje", min: 0, max: 1 },
    { ruta: "riesgos.sistemas", label: "Sistemas", tipo: "porcentaje", min: 0, max: 1 },
    { ruta: "riesgos.tasas", label: "Tasas de interés", tipo: "porcentaje", min: 0, max: 1 },
    { ruta: "riesgos.tipoCambio", label: "Tipo de cambio", tipo: "porcentaje", min: 0, max: 1 },
    { ruta: "riesgos.legal", label: "Legal", tipo: "porcentaje", min: 0, max: 1 },
    { ruta: "riesgos.regulatorio", label: "Regulatorio", tipo: "porcentaje", min: 0, max: 1 },
    { ruta: "riesgos.chisme", label: "Chisme", tipo: "porcentaje", min: 0, max: 1 },
    { ruta: "riesgos.incumplimientoMin", label: "Incumplimiento mínimo", tipo: "porcentaje", min: 0, max: 1 },
    { ruta: "riesgos.incumplimientoMax", label: "Incumplimiento máximo", tipo: "porcentaje", min: 0, max: 1 },

    { ruta: "puntaje.valorMercado", label: "Valor de mercado", tipo: "porcentaje", min: 0, max: 1 },
    { ruta: "puntaje.utilidad", label: "Utilidad", tipo: "porcentaje", min: 0, max: 1 },
    { ruta: "puntaje.salud", label: "Salud financiera", tipo: "porcentaje", min: 0, max: 1 },
    { ruta: "precio.multiploUtilidad", label: "Múltiplo de utilidad (valor justo)", tipo: "numero", min: 1, max: 50, grupo: "puntaje" },
    { ruta: "precio.castigoDividendo", label: "Castigo por omitir dividendo", tipo: "porcentaje", min: 0, max: 0.5, grupo: "puntaje" }
  ];

  function grupoDe(campo) { return campo.grupo || campo.ruta.split(".")[0]; }

  function copiar(o) { return JSON.parse(JSON.stringify(o)); }

  function obtener(p, ruta) {
    return ruta.split(".").reduce(function (o, k) { return o && o[k]; }, p);
  }

  function asignar(p, ruta, valor) {
    var partes = ruta.split(".");
    var o = p;
    for (var i = 0; i < partes.length - 1; i++) {
      if (!o[partes[i]] || typeof o[partes[i]] !== "object") o[partes[i]] = {};
      o = o[partes[i]];
    }
    o[partes[partes.length - 1]] = valor;
  }

  function fusionar(base, guardados) {
    var p = copiar(base);
    if (!guardados || typeof guardados !== "object") return p;
    CAMPOS.forEach(function (c) {
      var v = obtener(guardados, c.ruta);
      if (c.tipo === "select" ? typeof v === "string" : typeof v === "number" && isFinite(v)) asignar(p, c.ruta, v);
    });
    return p;
  }

  function validarParametros(p, mesesValidos) {
    var errores = [];
    var err = function (ruta, mensaje) { errores.push({ ruta: ruta, mensaje: mensaje }); };

    CAMPOS.forEach(function (c) {
      var v = obtener(p, c.ruta);
      if (c.tipo === "select") {
        var opciones = c.ruta === "partida.mesInicial" ? (mesesValidos || []) : c.opciones.map(function (o) { return o.valor; });
        if (opciones.length && opciones.indexOf(v) === -1) err(c.ruta, "Selecciona una opción.");
        return;
      }
      if (typeof v !== "number" || !isFinite(v)) return err(c.ruta, "Debe ser un número.");
      if (c.tipo === "entero" && Math.round(v) !== v) return err(c.ruta, "Solo números enteros.");
      if (c.min !== undefined && v < c.min - 1e-12) return err(c.ruta, "Mínimo " + mostrar(c, c.min) + ".");
      if (c.max !== undefined && v > c.max + 1e-12) return err(c.ruta, "Máximo " + mostrar(c, c.max) + ".");
    });

    if (!errores.length) {
      var cr = p.credito, r = p.riesgos, pu = p.puntaje;
      if (cr.plazoMin > cr.plazoMax) err("credito.plazoMax", "Debe ser mayor o igual al plazo mínimo.");
      if (!(cr.AAA <= cr.AA && cr.AA <= cr.A && cr.A <= cr.BBB)) err("credito.BBB", "Las sobretasas deben crecer de AAA a BBB.");
      if (r.incumplimientoMin > r.incumplimientoMax) err("riesgos.incumplimientoMax", "Debe ser mayor o igual al mínimo.");
      var suma = pu.valorMercado + pu.utilidad + pu.salud;
      if (Math.abs(suma - 1) > 1e-6) err("puntaje.salud", "El puntaje suma " + redondear(suma * 100) + " %; debe sumar 100 %.");
    }
    return { ok: errores.length === 0, errores: errores };
  }

  function redondear(n) { return Math.round(n * 10000) / 10000; }

  function mostrar(campo, v) {
    return campo.tipo === "porcentaje" ? redondear(v * 100) + " %" : String(v);
  }

  function aPantalla(campo, v) {
    if (v === undefined || v === null) return "";
    return campo.tipo === "porcentaje" ? String(redondear(v * 100)) : String(v);
  }

  function desdePantalla(campo, texto) {
    if (campo.tipo === "select") return texto;
    var n = Number(String(texto).replace(/,/g, "").trim());
    if (String(texto).trim() === "" || !isFinite(n)) return NaN;
    return campo.tipo === "porcentaje" ? redondear(n) / 100 : n;
  }

  var api = {
    BASE: BASE,
    GRUPOS: GRUPOS,
    CAMPOS: CAMPOS,
    grupoDe: grupoDe,
    obtener: obtener,
    asignar: asignar,
    fusionar: fusionar,
    validarParametros: validarParametros,
    aPantalla: aPantalla,
    desdePantalla: desdePantalla
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.Parametros = api;
})(typeof window !== "undefined" ? window : this);
