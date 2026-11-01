(function () {
  "use strict";

  var F = window.Formato;
  var I = window.Importar;
  var E = window.Entorno;
  var P = window.Parametros;
  var H = window.HistoriaEntorno;

  var $ = function (id) { return document.getElementById(id); };
  var RONDAS_VISTA = 12;
  var COLORES = { real: "rgba(245,245,247,0.45)", inflacion: "#dd90d8", tiie: "#847dff", tc: "#00b3dd", meta: "rgba(255,210,127,0.7)", rejilla: "rgba(255,255,255,0.08)", texto: "#9f9fa0" };

  var logo = $("logo-img");
  function sinLogo() { logo.hidden = true; $("logo-texto").hidden = false; }
  logo.addEventListener("error", sinLogo);
  if (logo.complete && !logo.naturalWidth) sinLogo();

  var lista = window.RegistroBMV.leer();
  if (lista.length < I.MIN_EMPRESAS) { location.replace("index.html"); return; }

  (function pintarEmpresas() {
    var c = I.conteos(lista);
    $("contador").textContent = c.total;
    $("ind-total").textContent = c.total;
    $("ind-mercado").textContent = c.Capitales + " · " + c.Deuda;
    $("ind-divisa").textContent = c.MXN + " · " + c.USD;
    $("empresas").innerHTML = lista.map(function (reg, i) {
      var r = I.resumenEmpresa(reg.datos);
      return '<li class="empresa empresa--compacta"><span class="empresa__num">' + String(i + 1).padStart(2, "0") + "</span>" +
        '<div class="empresa__info"><p class="empresa__nombre">' + F.escapar(r.nombre) + "</p>" +
        '<p class="empresa__meta"><span class="marca-mercado marca-mercado--' + (r.mercado === "Deuda" ? "deuda" : "capitales") + '">' + F.escapar(r.mercado || "—") + "</span>" +
        F.escapar(r.divisa || "—") + "</p></div>" +
        '<span class="empresa__monto">' + F.dinero(r.emision.monto, r.divisa) + "</span></li>";
    }).join("");
  })();

  var form = $("form-config");
  var contenedor = $("grupos");
  var MESES = H.map(function (h) { return h.mes; });
  var guardada = window.Partida.leer();
  var parametros = P.fusionar(P.BASE, guardada && guardada.parametros);

  function idDe(ruta) { return "p-" + ruta.replace(/\./g, "-"); }

  function opcionesDe(campo) {
    if (campo.ruta === "partida.mesInicial") {
      return MESES.map(function (m) { return { valor: m, nombre: E.nombreMes(m) }; });
    }
    return campo.opciones;
  }

  var NOMBRES_MES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  var ANIOS = [];
  MESES.forEach(function (m) { var a = m.slice(0, 4); if (ANIOS.indexOf(a) === -1) ANIOS.push(a); });
  var ID_MES_INICIAL = idDe("partida.mesInicial");

  function htmlMesInicial() {
    var id = ID_MES_INICIAL;
    var describe = ' aria-describedby="' + id + "-ayuda " + id + '-error"';
    return '<div class="campo" data-campo="' + id + '-mes">' +
        '<label class="campo__label" for="' + id + '-mes">Mes inicial</label>' +
        '<select class="control" id="' + id + '-mes"' + describe + ">" +
          NOMBRES_MES.map(function (n, i) { return '<option value="' + String(i + 1).padStart(2, "0") + '">' + n + "</option>"; }).join("") +
        "</select></div>" +
      '<div class="campo" data-campo="' + id + '">' +
        '<label class="campo__label" for="' + id + '-anio">Año inicial</label>' +
        '<select class="control" id="' + id + '-anio"' + describe + ">" +
          ANIOS.map(function (a) { return '<option value="' + a + '">' + a + "</option>"; }).join("") +
        "</select>" +
        '<input type="hidden" id="' + id + '" name="' + id + '">' +
      "</div>" +
      '<p class="campo__ayuda campo--ancho" id="' + id + '-ayuda">Datos disponibles de ' + E.nombreMes(MESES[0]).toLowerCase() + " a " + E.nombreMes(MESES[MESES.length - 1]).toLowerCase() + ".</p>" +
      '<span class="campo__error campo--ancho" id="' + id + '-error" aria-live="polite"></span>';
  }

  function ajustarMeses(preferido) {
    var anio = $(ID_MES_INICIAL + "-anio").value;
    var selMes = $(ID_MES_INICIAL + "-mes");
    var disponibles = MESES.filter(function (m) { return m.slice(0, 4) === anio; }).map(function (m) { return m.slice(5); });
    Array.prototype.forEach.call(selMes.options, function (o) { o.disabled = disponibles.indexOf(o.value) === -1; });
    var mes = preferido || selMes.value;
    if (disponibles.indexOf(mes) === -1) mes = mes > disponibles[disponibles.length - 1] ? disponibles[disponibles.length - 1] : disponibles[0];
    selMes.value = mes;
    $(ID_MES_INICIAL).value = anio + "-" + mes;
  }

  function ponerMesInicial(valor) {
    if (MESES.indexOf(valor) === -1) valor = MESES[0];
    $(ID_MES_INICIAL + "-anio").value = valor.slice(0, 4);
    ajustarMeses(valor.slice(5));
  }

  var FLECHA = '<svg class="plegable__flecha" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  function htmlGrupos() {
    return P.GRUPOS.map(function (g, i) {
      var abierto = g.id === "partida";
      var campos = P.CAMPOS.filter(function (c) { return P.grupoDe(c) === g.id; });
      var html = '<section class="plegable' + (abierto ? " abierto" : "") + '" data-grupo="' + g.id + '">' +
        '<h3 class="plegable__titulo"><button class="plegable__cabeza" type="button" aria-expanded="' + abierto + '" aria-controls="grupo-' + g.id + '">' +
        "<span>" + F.escapar(g.titulo) + "</span>" + FLECHA + "</button></h3>" +
        '<div class="plegable__cuerpo" id="grupo-' + g.id + '"' + (abierto ? "" : " inert") + '><div class="plegable__interior">' +
        (g.nota ? '<p class="plegable__nota">' + F.escapar(g.nota) + "</p>" : "") +
        '<div class="campos-rejilla">';
      campos.forEach(function (c) {
        if (c.ruta === "partida.mesInicial") { html += htmlMesInicial(); return; }
        html += F.campo({ id: idDe(c.ruta), label: c.label, tipo: c.tipo, opciones: c.tipo === "select" ? opcionesDe(c) : null, ayuda: c.ayuda });
        if (c.ruta === "partida.semilla") {
          html += '<div class="campo campo--accion"><button class="boton boton--fantasma boton--chico" type="button" id="btn-semilla">Nueva semilla</button></div>';
        }
      });
      html += "</div></div></div></section>";
      return html;
    }).join("");
  }

  contenedor.innerHTML = htmlGrupos();
  F.activar(form);
  $(ID_MES_INICIAL + "-anio").addEventListener("change", function () { ajustarMeses(); F.limpiarError(form, ID_MES_INICIAL); });
  $(ID_MES_INICIAL + "-mes").addEventListener("change", function () { ajustarMeses(); F.limpiarError(form, ID_MES_INICIAL); });

  function llenar(p) {
    P.CAMPOS.forEach(function (c) {
      var el = $(idDe(c.ruta));
      if (c.ruta === "partida.mesInicial") ponerMesInicial(P.obtener(p, c.ruta));
      else el.value = P.aPantalla(c, P.obtener(p, c.ruta));
      F.limpiarError(form, el.id);
    });
  }

  function leerFormulario() {
    var p = JSON.parse(JSON.stringify(P.BASE));
    var errores = [];
    P.CAMPOS.forEach(function (c) {
      var texto = $(idDe(c.ruta)).value;
      var v = P.desdePantalla(c, texto);
      if (c.tipo !== "select" && Number.isNaN(v)) {
        errores.push({ ruta: c.ruta, mensaje: String(texto).trim() === "" ? "Campo obligatorio." : "Debe ser un número." });
      }
      P.asignar(p, c.ruta, v);
    });
    if (!errores.length) errores = P.validarParametros(p, MESES).errores;
    return { parametros: p, errores: errores };
  }

  function abrir(seccion, abierto) {
    var boton = seccion.querySelector(".plegable__cabeza");
    var cuerpo = seccion.querySelector(".plegable__cuerpo");
    seccion.classList.toggle("abierto", abierto);
    boton.setAttribute("aria-expanded", String(abierto));
    if (abierto) cuerpo.removeAttribute("inert"); else cuerpo.setAttribute("inert", "");
  }

  contenedor.addEventListener("click", function (e) {
    var boton = e.target.closest(".plegable__cabeza");
    if (!boton) return;
    var seccion = boton.closest(".plegable");
    seccion.classList.toggle("sin-animacion", e.detail === 0);
    abrir(seccion, !seccion.classList.contains("abierto"));
  });

  var estado = $("estado-guardado");
  function marcar(texto, clase) {
    estado.textContent = texto;
    estado.className = "estado-guardado" + (clase ? " " + clase : "");
  }
  function fechaCorta(iso) {
    try {
      return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
    } catch (e) { return ""; }
  }
  if (guardada && guardada.guardada) marcar("Guardada · " + fechaCorta(guardada.guardada), "estado-guardado--ok");
  else marcar("Sin guardar", "");

  var avisoEl = $("aviso");
  var avisoTimer = null;
  function aviso(texto) {
    avisoEl.textContent = texto;
    avisoEl.hidden = false;
    avisoEl.classList.remove("visible");
    void avisoEl.offsetWidth;
    avisoEl.classList.add("visible");
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function () { avisoEl.classList.remove("visible"); }, 2600);
  }

  if (window.Chart) {
    Chart.defaults.color = COLORES.texto;
    Chart.defaults.font.family = "Inter, ui-sans-serif, system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.borderColor = COLORES.rejilla;
    Chart.defaults.plugins.tooltip.backgroundColor = "#2e2e2e";
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.maintainAspectRatio = false;
  }

  var graficas = {};

  function crearGrafica(id, formato) {
    if (!window.Chart) return null;
    return new Chart($(id), {
      type: "line",
      data: { labels: [], datasets: [] },
      options: {
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return c.parsed.y === null ? null : " " + c.dataset.label + ": " + formato(c.parsed.y); } } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
          y: { grid: { color: COLORES.rejilla }, ticks: { maxTicksLimit: 5, callback: function (v) { return formato(v); } } }
        }
      }
    });
  }

  var pct = function (v) { return F.numero(v * 100, 2) + " %"; };
  var tc2 = function (v) { return F.numero(v, 2); };

  graficas.inflacion = crearGrafica("g-inflacion", pct);
  graficas.tiie = crearGrafica("g-tiie", pct);
  graficas.tc = crearGrafica("g-tc", tc2);

  function etiquetaPeriodo(r) {
    if (r.mesInicio === r.mesFin) return E.nombreMes(r.mesInicio, true);
    var a = E.nombreMes(r.mesInicio, true).split(" ");
    var b = E.nombreMes(r.mesFin, true).split(" ");
    return a[1] === b[1] ? a[0] + " – " + b[0] + " " + b[1] : a.join(" ") + " – " + b.join(" ");
  }

  function actualizarGrafica(grafica, clave, color, etiquetas, inicio, k, simulados, finRonda, meta) {
    if (!grafica) return;
    var real = etiquetas.map(function (_, i) { return i < H.length ? H[i][clave] : null; });
    var sim = etiquetas.map(function (_, i) {
      if (i < k) return null;
      if (i === k) return inicio[clave];
      var m = simulados[i - k - 1];
      return m ? m[clave] : null;
    });
    var radios = etiquetas.map(function (_, i) { return i === k ? 4 : (finRonda[i] ? 2.5 : 0); });
    var datasets = [
      { label: "Real", data: real, borderColor: COLORES.real, borderWidth: 1.5, pointRadius: 0, tension: 0.25, spanGaps: false },
      { label: "Simulado", data: sim, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: radios, pointHoverRadius: 4, tension: 0.25 }
    ];
    if (meta !== undefined) {
      datasets.push({ label: "Meta", data: etiquetas.map(function () { return meta; }), borderColor: COLORES.meta, borderWidth: 1, borderDash: [4, 4], pointRadius: 0 });
    }
    grafica.data.labels = etiquetas.map(function (m) { return E.nombreMes(m, true); });
    grafica.data.datasets = datasets;
    grafica.update("none");
  }

  var ultimaVista = "";

  function actualizarVista() {
    var leido = leerFormulario();
    var p = leido.parametros;
    var bloquea = leido.errores.some(function (e) { return /^(partida|entorno)\./.test(e.ruta); });
    if (bloquea) return;
    var clave = JSON.stringify([p.partida, p.entorno]);
    if (clave === ultimaVista) return;
    ultimaVista = clave;

    var porRonda = E.mesesPorRonda(p.partida.periodo);
    var meses = RONDAS_VISTA * porRonda;
    var sim = E.simular({
      historia: H,
      mesInicial: p.partida.mesInicial,
      meses: meses,
      semilla: p.partida.semilla,
      meta: p.entorno.metaInflacion,
      banda: p.entorno.banda,
      pasoTiie: p.entorno.pasoTiie,
      tasaRealNeutral: p.entorno.tasaRealNeutral,
      pisoTiie: p.entorno.pisoTiie,
      inflacionExterna: p.entorno.inflacionExterna
    });
    var rondas = E.agruparPorRonda(sim.meses, p.partida.periodo);
    var ini = sim.inicio;

    $("entorno-sub").textContent = "Semilla " + p.partida.semilla + " · " + (porRonda === 3 ? "Trimestral" : "Mensual") + " · desde " + E.nombreMes(ini.mes);
    $("ini-inflacion").textContent = pct(ini.inflacionAnual);
    $("ini-tiie").textContent = pct(ini.tiie);
    $("ini-tc").textContent = tc2(ini.tc);
    $("tabla-titulo").textContent = "Primeras " + RONDAS_VISTA + " rondas · " + (porRonda === 3 ? "trimestrales" : "mensuales");

    $("tabla-rondas").innerHTML = rondas.map(function (r) {
      return "<tr><td>" + r.ronda + "</td><td>" + F.escapar(etiquetaPeriodo(r)) + "</td><td>" + pct(r.inflacionPeriodo) +
        "</td><td>" + pct(r.inflacionAnual) + "</td><td>" + pct(r.tiie) + "</td><td>" + tc2(r.tc) + "</td></tr>";
    }).join("");

    var k = E.indiceMes(H, ini.mes);
    var total = Math.max(H.length, k + 1 + sim.meses.length);
    var etiquetas = [];
    for (var i = 0; i < total; i++) etiquetas.push(E.sumarMeses(H[0].mes, i));
    var finRonda = {};
    rondas.forEach(function (r) { finRonda[etiquetas.indexOf(r.mesFin)] = true; });

    actualizarGrafica(graficas.inflacion, "inflacionAnual", COLORES.inflacion, etiquetas, ini, k, sim.meses, finRonda, p.entorno.metaInflacion);
    actualizarGrafica(graficas.tiie, "tiie", COLORES.tiie, etiquetas, ini, k, sim.meses, finRonda);
    actualizarGrafica(graficas.tc, "tc", COLORES.tc, etiquetas, ini, k, sim.meses, finRonda);
  }

  var vistaTimer = null;
  form.addEventListener("input", function () {
    marcar("Cambios sin guardar", "estado-guardado--pendiente");
    clearTimeout(vistaTimer);
    vistaTimer = setTimeout(actualizarVista, 150);
  });
  form.addEventListener("change", function () {
    marcar("Cambios sin guardar", "estado-guardado--pendiente");
    actualizarVista();
  });

  $("btn-semilla").addEventListener("click", function () {
    var nueva = 1 + Math.floor(Math.random() * 99999);
    var el = $(idDe("partida.semilla"));
    el.value = String(nueva);
    F.limpiarError(form, el.id);
    marcar("Cambios sin guardar", "estado-guardado--pendiente");
    actualizarVista();
  });

  var btnRestablecer = $("btn-restablecer");
  var restablecerTimer = null;
  function restaurarBoton() {
    clearTimeout(restablecerTimer);
    btnRestablecer.classList.remove("boton--peligro");
    btnRestablecer.textContent = "Restablecer";
    delete btnRestablecer.dataset.confirmar;
  }
  btnRestablecer.addEventListener("click", function () {
    if (!btnRestablecer.dataset.confirmar) {
      btnRestablecer.dataset.confirmar = "1";
      btnRestablecer.classList.add("boton--peligro");
      btnRestablecer.textContent = "¿Restablecer? Confirmar";
      restablecerTimer = setTimeout(restaurarBoton, 4000);
      return;
    }
    restaurarBoton();
    llenar(P.BASE);
    marcar("Cambios sin guardar", "estado-guardado--pendiente");
    actualizarVista();
    aviso("Se restablecieron los valores aprobados.");
  });

  function guardarFormulario() {
    P.CAMPOS.forEach(function (c) { F.limpiarError(form, idDe(c.ruta)); });
    var leido = leerFormulario();
    if (leido.errores.length) {
      leido.errores.forEach(function (er) {
        F.mostrarError(form, idDe(er.ruta), er.mensaje);
        var seccion = $(idDe(er.ruta)).closest(".plegable");
        seccion.classList.add("sin-animacion");
        abrir(seccion, true);
      });
      var primero = $(idDe(leido.errores[0].ruta));
      (primero.type === "hidden" ? $(primero.id + "-mes") : primero).focus();
      aviso(leido.errores.length === 1 ? "Revisa el campo marcado." : "Revisa los " + leido.errores.length + " campos marcados.");
      return null;
    }
    if (!window.Partida.guardar(leido.parametros)) { aviso("No se pudo guardar en este navegador."); return null; }
    marcar("Guardada · " + fechaCorta(new Date().toISOString()), "estado-guardado--ok");
    return leido.parametros;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (guardarFormulario()) aviso("Configuración guardada.");
  });

  var enCurso = window.Juego.leer();
  var btnIniciar = $("btn-iniciar");
  var btnNueva = $("btn-nueva");

  function crearPartida() {
    var p = guardarFormulario();
    if (!p) return;
    var juego = window.Motor.crearJuego(window.RegistroBMV.leer(), p);
    window.Juego.borrarRespaldos();
    if (!window.Juego.guardar(juego)) { aviso("No se pudo guardar la partida en este navegador."); return; }
    location.href = "tablero.html";
  }

  if (enCurso) {
    btnIniciar.textContent = "Continuar partida";
    btnNueva.hidden = false;
  }

  btnIniciar.addEventListener("click", function () {
    if (enCurso) { location.href = "tablero.html"; return; }
    crearPartida();
  });

  var nuevaTimer = null;
  btnNueva.addEventListener("click", function () {
    if (!btnNueva.dataset.confirmar) {
      btnNueva.dataset.confirmar = "1";
      btnNueva.textContent = "Se borrará la partida en curso. Confirmar";
      btnNueva.classList.add("enlace-boton--peligro");
      nuevaTimer = setTimeout(function () {
        delete btnNueva.dataset.confirmar;
        btnNueva.textContent = "Empezar una partida nueva";
        btnNueva.classList.remove("enlace-boton--peligro");
      }, 4000);
      return;
    }
    clearTimeout(nuevaTimer);
    crearPartida();
  });

  llenar(parametros);
  actualizarVista();
})();
