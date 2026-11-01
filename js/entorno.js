(function (raiz) {
  "use strict";

  var NOMBRES_MES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  var CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  var PERSISTENCIA = 0.5;

  function azar(semilla) {
    var a = (Number(semilla) >>> 0) || 1;
    var reserva = null;
    function uniforme() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function normal() {
      if (reserva !== null) { var r = reserva; reserva = null; return r; }
      var u = 0;
      while (u === 0) u = uniforme();
      var v = uniforme();
      var m = Math.sqrt(-2 * Math.log(u));
      reserva = m * Math.sin(2 * Math.PI * v);
      return m * Math.cos(2 * Math.PI * v);
    }
    return { uniforme: uniforme, normal: normal };
  }

  function sumarMeses(mes, n) {
    var p = mes.split("-");
    var total = Number(p[0]) * 12 + (Number(p[1]) - 1) + n;
    var m = total % 12;
    return Math.floor(total / 12) + "-" + String(m + 1).padStart(2, "0");
  }

  function nombreMes(mes, corto) {
    var p = mes.split("-");
    return (corto ? CORTOS : NOMBRES_MES)[Number(p[1]) - 1] + " " + p[0];
  }

  function desviacion(arr) {
    if (arr.length < 2) return 0;
    var media = arr.reduce(function (s, x) { return s + x; }, 0) / arr.length;
    var v = arr.reduce(function (s, x) { return s + (x - media) * (x - media); }, 0) / (arr.length - 1);
    return Math.sqrt(v);
  }

  function calibrar(historia) {
    var mensual = historia.map(function (h) { return h.inflacionMensual; });
    var anual = historia.map(function (h) { return h.inflacionAnual; });
    var rendTc = [];
    for (var i = 1; i < historia.length; i++) rendTc.push(Math.log(historia[i].tc / historia[i - 1].tc));
    var volAnual = desviacion(anual);
    var factor = Math.sqrt(12 * (1 + PERSISTENCIA) / (1 - PERSISTENCIA));
    return {
      mediaInflacion: mensual.reduce(function (s, x) { return s + x; }, 0) / mensual.length,
      volInflacionAnual: volAnual,
      volInflacion: volAnual / factor,
      volTc: desviacion(rendTc)
    };
  }

  function tasaObjetivo(anual, meta, banda, realNeutral) {
    var brecha = anual - meta;
    var reaccion = Math.abs(brecha) > banda ? 2 : 1.5;
    return meta + realNeutral + reaccion * brecha;
  }

  function indiceMes(historia, mes) {
    for (var i = 0; i < historia.length; i++) if (historia[i].mes === mes) return i;
    return -1;
  }

  function ventanaInicial(historia, k) {
    var reales = [];
    for (var i = Math.max(0, k - 11); i <= k; i++) reales.push(historia[i].inflacionMensual);
    var faltan = 12 - reales.length;
    if (!faltan) return reales;
    var acumulado = reales.reduce(function (p, m) { return p * (1 + m); }, 1);
    var relleno = Math.pow((1 + historia[k].inflacionAnual) / acumulado, 1 / faltan) - 1;
    var ventana = [];
    for (var j = 0; j < faltan; j++) ventana.push(relleno);
    return ventana.concat(reales);
  }

  function simular(o) {
    var historia = o.historia;
    var k = indiceMes(historia, o.mesInicial);
    if (k === -1) k = 0;
    var meta = o.meta === undefined ? 0.03 : o.meta;
    var banda = o.banda === undefined ? 0.01 : o.banda;
    var paso = o.pasoTiie || 0.0025;
    var piso = o.pisoTiie === undefined ? 0.03 : o.pisoTiie;
    var techo = o.techoTiie === undefined ? 0.15 : o.techoTiie;
    var cada = o.cadaMesesTiie || 1;
    var realNeutral = o.tasaRealNeutral === undefined ? 0.03 : o.tasaRealNeutral;
    var externa = o.inflacionExterna === undefined ? 0.025 : o.inflacionExterna;

    var cal = calibrar(historia);
    var gen = azar(o.semilla);
    var metaMensual = Math.pow(1 + meta, 1 / 12) - 1;
    var externaMensual = Math.pow(1 + externa, 1 / 12) - 1;

    var h = historia[k];
    var ventana = ventanaInicial(historia, k);
    var m = h.inflacionMensual;
    var inpc = h.inpc;
    var tiie = h.tiie;
    var tc = h.tc;
    var salida = [];

    for (var t = 1; t <= o.meses; t++) {
      m = metaMensual + PERSISTENCIA * (m - metaMensual) + cal.volInflacion * gen.normal();
      ventana.shift();
      ventana.push(m);
      var anual = ventana.reduce(function (p, x) { return p * (1 + x); }, 1) - 1;
      inpc *= 1 + m;

      var cambio = 0;
      if (t % cada === 0) {
        var objetivo = tasaObjetivo(anual, meta, banda, realNeutral);
        if (objetivo - tiie >= paso / 2) cambio = paso;
        else if (tiie - objetivo >= paso / 2) cambio = -paso;
        var nueva = Math.min(techo, Math.max(piso, tiie + cambio));
        cambio = Math.round((nueva - tiie) * 1e6) / 1e6;
        tiie = nueva;
      }

      var deriva = Math.log((1 + m) / (1 + externaMensual));
      tc *= Math.exp(deriva + cal.volTc * gen.normal());

      salida.push({
        periodo: t,
        mes: sumarMeses(o.mesInicial || h.mes, t),
        inflacionMensual: m,
        inflacionAnual: anual,
        inpc: inpc,
        tiie: tiie,
        cambioTiie: cambio,
        tc: tc
      });
    }

    return {
      calibracion: cal,
      inicio: { mes: h.mes, inflacionMensual: h.inflacionMensual, inflacionAnual: h.inflacionAnual, inpc: h.inpc, tiie: h.tiie, tc: h.tc },
      meses: salida
    };
  }

  function mesesPorRonda(periodo) { return periodo === "trimestre" ? 3 : 1; }

  function agruparPorRonda(meses, periodo) {
    var n = mesesPorRonda(periodo);
    var rondas = [];
    for (var i = 0; i + n <= meses.length; i += n) {
      var bloque = meses.slice(i, i + n);
      var fin = bloque[bloque.length - 1];
      rondas.push({
        ronda: rondas.length + 1,
        mesInicio: bloque[0].mes,
        mesFin: fin.mes,
        inflacionPeriodo: bloque.reduce(function (p, x) { return p * (1 + x.inflacionMensual); }, 1) - 1,
        inflacionAnual: fin.inflacionAnual,
        inpc: fin.inpc,
        tiie: fin.tiie,
        tc: fin.tc
      });
    }
    return rondas;
  }

  var api = {
    azar: azar,
    sumarMeses: sumarMeses,
    nombreMes: nombreMes,
    calibrar: calibrar,
    tasaObjetivo: tasaObjetivo,
    indiceMes: indiceMes,
    ventanaInicial: ventanaInicial,
    simular: simular,
    mesesPorRonda: mesesPorRonda,
    agruparPorRonda: agruparPorRonda
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.Entorno = api;
})(typeof window !== "undefined" ? window : this);
