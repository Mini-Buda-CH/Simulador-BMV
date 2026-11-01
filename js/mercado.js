(function (raiz) {
  "use strict";

  var CALIFICACIONES = ["AAA", "AA", "A", "BBB", "BB", "B", "C"];
  var DIFERENCIAL = { AAA: 0.01, AA: 0.015, A: 0.025, BBB: 0.04, BB: 0.06, B: 0.09, C: 0.20 };
  var FACTOR_COLOCACION = { AAA: 1, AA: 0.98, A: 0.95, BBB: 0.90, BB: 0.85, B: 0.80, C: 0.70 };
  var VOL_GIRO = {
    "Grupos financieros y banca comercial": 0.035,
    "Fideicomisos de bienes raíces": 0.03,
    "Casas de bolsa y operadoras de fondos": 0.045,
    "Conglomerados industriales y de materiales": 0.04,
    "Grandes cadenas de retail": 0.035,
    "Empresas de infraestructura y logística": 0.035,
    "Operadores de aeropuertos": 0.045,
    "Cadenas hoteleras e inmobiliarias turísticas": 0.045,
    "Servicios de entretenimiento y restaurantes": 0.05
  };
  var VOL_BASE = 0.04;

  var KAPPA = 0.10;
  var PESO_DEMANDA = 2;
  var PESO_DEMANDA_BONO = 0.5;
  var SENSIBILIDAD_TIIE = 3;
  var TOPE_MENSUAL = 0.25;
  var TOPE_PREMIO_BONO = 0.10;

  function limitar(x, min, max) { return Math.min(max, Math.max(min, x)); }

  function calificar(d) {
    var razon = d.pasivoCirculante > 0 ? d.activoCirculante / d.pasivoCirculante : Infinity;
    var endeudamiento = d.capital > 0 ? d.pasivoTotal / d.capital : Infinity;
    if (!(d.capital > 0)) return { nota: "C", puntos: 0, razon: razon, endeudamiento: endeudamiento };
    var pr = razon >= 2 ? 3 : razon >= 1.5 ? 2 : razon >= 1 ? 1 : 0;
    var pe = endeudamiento <= 0.5 ? 3 : endeudamiento <= 1 ? 2 : endeudamiento <= 2 ? 1 : 0;
    var puntos = pr + pe;
    var nota = puntos === 6 ? "AAA" : puntos === 5 ? "AA" : puntos === 4 ? "A" : puntos === 3 ? "BBB" : puntos === 2 ? "BB" : "B";
    return { nota: nota, puntos: puntos, razon: razon, endeudamiento: endeudamiento };
  }

  function valorJustoAccion(utilidad12m, acciones, capital, multiplo) {
    if (!(acciones > 0)) return null;
    if (utilidad12m > 0) return (multiplo || 12) * utilidad12m / acciones;
    return Math.max(0.01, 0.8 * capital / acciones);
  }

  function nuevoPrecioAccion(o) {
    var partes = {
      valorJusto: o.valorJusto > 0 ? KAPPA * Math.log(o.valorJusto / o.precio) : 0,
      demanda: PESO_DEMANDA * (o.presion || 0),
      economia: -SENSIBILIDAD_TIIE * (o.deltaTiie || 0),
      azar: (o.sigma === undefined ? VOL_BASE : o.sigma) * (o.epsilon || 0)
    };
    var total = partes.valorJusto + partes.demanda + partes.economia + partes.azar;
    var factor = limitar(Math.exp(total), 1 - TOPE_MENSUAL, 1 + TOPE_MENSUAL);
    return { precio: o.precio * factor, cambio: factor - 1, partes: partes, topado: factor !== Math.exp(total) };
  }

  function mesesDePago(n, mesesRestantes) {
    var cada = 12 / n;
    var pagos = [];
    for (var m = mesesRestantes; m > 0; m -= cada) pagos.unshift(m);
    return pagos;
  }

  function precioBono(cupon, n, mesesRestantes, y) {
    if (mesesRestantes <= 0) return 100;
    var precio = 0;
    var pagos = mesesDePago(n, mesesRestantes);
    pagos.forEach(function (m) {
      var fd = Math.pow(1 + y / n, -(m * n / 12));
      precio += (100 * cupon / n) * fd;
      if (m === mesesRestantes) precio += 100 * fd;
    });
    return precio;
  }

  function rendimientoImplicito(cupon, n, mesesRestantes, precio) {
    var bajo = -0.5, alto = 3;
    for (var i = 0; i < 200; i++) {
      var medio = (bajo + alto) / 2;
      if (precioBono(cupon, n, mesesRestantes, medio) > precio) bajo = medio; else alto = medio;
    }
    return (bajo + alto) / 2;
  }

  function nuevoPrecioBono(o) {
    var y = o.y0 + (o.tiie - o.tiie0) + (o.diferencial - o.diferencial0);
    var premio = limitar((o.premio || 0) * 0.5 + PESO_DEMANDA_BONO * (o.presion || 0), -TOPE_PREMIO_BONO, TOPE_PREMIO_BONO);
    return { precio: precioBono(o.cupon, o.n, o.mesesRestantes, y) * (1 + premio), rendimiento: y, premio: premio };
  }

  function normalizar(valores) {
    var min = Math.min.apply(null, valores), max = Math.max.apply(null, valores);
    return valores.map(function (v) { return max - min < 1e-12 ? 50 : 100 * (v - min) / (max - min); });
  }

  function puntajes(items, pesos) {
    pesos = pesos || { valorMercado: 0.4, utilidad: 0.3, salud: 0.3 };
    if (!items.length) return [];
    var rend = items.map(function (i) { return i.valorInicial > 0 ? i.valorActual / i.valorInicial - 1 : 0; });
    var util = items.map(function (i) { return i.activosIniciales > 0 ? i.utilidad / i.activosIniciales : 0; });
    var nv = normalizar(rend), nu = normalizar(util);
    return items.map(function (i, k) {
      var salud = 100 * (i.puntosCalificacion || 0) / 6;
      var p = pesos.valorMercado * nv[k] + pesos.utilidad * nu[k] + pesos.salud * salud;
      return { clave: i.clave, orden: i.orden, puntaje: p, componentes: { valor: nv[k], utilidad: nu[k], salud: salud }, rendimiento: rend[k] };
    }).sort(function (a, b) { return b.puntaje - a.puntaje || a.orden - b.orden; });
  }

  var api = {
    CALIFICACIONES: CALIFICACIONES,
    DIFERENCIAL: DIFERENCIAL,
    FACTOR_COLOCACION: FACTOR_COLOCACION,
    VOL_GIRO: VOL_GIRO,
    VOL_BASE: VOL_BASE,
    TOPE_MENSUAL: TOPE_MENSUAL,
    volatilidad: function (tipoEmpresa) { return VOL_GIRO[tipoEmpresa] || VOL_BASE; },
    calificar: calificar,
    valorJustoAccion: valorJustoAccion,
    nuevoPrecioAccion: nuevoPrecioAccion,
    mesesDePago: mesesDePago,
    precioBono: precioBono,
    rendimientoImplicito: rendimientoImplicito,
    nuevoPrecioBono: nuevoPrecioBono,
    puntajes: puntajes
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.Mercado = api;
})(typeof window !== "undefined" ? window : this);
