(function () {
  "use strict";

  var F = window.Formato, Mo = window.Motor, E = window.Entorno;
  var $ = function (id) { return document.getElementById(id); };
  var NOTICIAS = ["riesgo", "cierre", "dividendo", "impago", "quiebra", "colocacion", "bonos", "fin"];
  var ETIQUETAS = { riesgo: "Riesgo", cierre: "Cierre", dividendo: "Dividendo", impago: "Impago", quiebra: "Quiebra", colocacion: "Colocación", bonos: "Bonos", fin: "Fin de la partida" };
  var GRUPO = { riesgo: "riesgos", cierre: "cierre", bonos: "bonos", colocacion: "colocacion", dividendo: "dividendos", impago: "impago", quiebra: "quiebra", fin: "cierre" };
  var filtro = "todas";
  var reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var precios = null;
  var ultimaNoticia = 0;

  var logo = $("logo-img");
  function sinLogo() { logo.hidden = true; $("logo-texto").hidden = false; }
  logo.addEventListener("error", sinLogo);
  if (logo.complete && !logo.naturalWidth) sinLogo();

  function esc(t) { return F.escapar(t); }
  function pct(n) { return F.porcentaje(n); }

  function periodo(juego) {
    var env = juego.entorno[juego.t];
    if (juego.fase === "colocacion") return "Colocación";
    if (juego.fase === "terminada") return "Partida terminada";
    var n = E.mesesPorRonda(juego.parametros.partida.periodo);
    var ini = E.sumarMeses(env.mes, 1), fin = E.sumarMeses(env.mes, n);
    if (n === 1) return E.nombreMes(ini);
    return E.nombreMes(ini, true) + " – " + E.nombreMes(fin, true);
  }

  function pintarBarra(juego) {
    var env = juego.entorno[juego.t];
    $("pb-fase").textContent = juego.fase === "colocacion" ? "Ronda 0" : "Ronda " + (juego.fase === "terminada" ? juego.final.ronda : juego.ronda);
    $("pb-periodo").textContent = periodo(juego);
    $("pb-inflacion").textContent = pct(env.inflacionAnual);
    $("pb-tiie").textContent = pct(env.tiie);
    $("pb-tc").textContent = "$" + F.numero(env.tc, 2);
  }

  function pintarCotizaciones(juego) {
    var nuevos = {};
    var filas = juego.valores.slice().sort(function (a, b) {
      return Mo.empresa(juego, a.emisora).nombre.localeCompare(Mo.empresa(juego, b.emisora).nombre, "es");
    }).map(function (v) {
      var e = Mo.empresa(juego, v.emisora);
      var precio = juego.fase === "colocacion" ? v.precioColocacion : v.precio;
      nuevos[v.emisora] = precio;
      var cambio = v.precioRondaAnterior ? v.precio / v.precioRondaAnterior - 1 : 0;
      var clase = cambio > 1e-9 ? "sube" : cambio < -1e-9 ? "baja" : "";
      var destello = precios && precios[v.emisora] !== undefined && Math.abs(precios[v.emisora] - precio) > 1e-9 ? (precio > precios[v.emisora] ? " destello-sube" : " destello-baja") : "";
      var estado = v.liquidado ? "Liquidada" : v.vencido ? "Vencido" : (v.tipo === "bonos" ? "Bonos" : "Acciones") + " · " + v.divisa;
      return '<tr class="' + destello + (e.quebrada ? " quebrada" : "") + '">' +
        '<td><span class="pb-nombre">' + esc(e.nombre) + '</span><span class="pb-sub">' + esc(estado) + "</span></td>" +
        '<td class="pb-precio">' + F.dinero(precio) + "</td>" +
        '<td class="pb-cambio ' + clase + '">' + (juego.fase === "colocacion" ? "" : (cambio > 0 ? "▲ +" : cambio < 0 ? "▼ " : "") + F.numero(cambio * 100, 2) + " %") + "</td>" +
        '<td class="pb-calif">' + esc(e.calificacion || "—") + "</td></tr>";
    }).join("");
    $("cotizaciones").innerHTML = filas;
    precios = nuevos;
  }

  function pintarTurno(juego) {
    var html;
    if (juego.fase === "terminada") {
      var g = juego.final.ranking[0];
      html = '<span class="etiqueta">Partida terminada · ronda ' + juego.final.ronda + '</span><p class="pb-turno__nombre">' + (g ? esc(g.nombre) : "—") + '</p><p class="pb-turno__nota">Primer lugar con ' + (g ? F.numero(g.puntaje, 1) : "—") + " puntos.</p>";
    } else if (juego.fase === "colocacion") {
      html = '<span class="etiqueta">Ronda 0</span><p class="pb-turno__nombre">Colocación</p><p class="pb-turno__nota">Las empresas anotan sus órdenes de compra de las emisiones.</p>';
    } else if (juego.turno) {
      var pend = Mo.pendientes(juego).filter(function (k) { return k !== juego.turno; }).slice(0, 3);
      var pos = juego.ordenRonda.indexOf(juego.turno) + 1;
      html = '<span class="etiqueta">En turno · ' + pos + " de " + juego.ordenRonda.length + '</span><p class="pb-turno__nombre">' + esc(Mo.empresa(juego, juego.turno).nombre) + "</p>" +
        (pend.length ? '<p class="pb-turno__nota">Siguen: ' + pend.map(function (k) { return esc(Mo.empresa(juego, k).nombre); }).join(" · ") + "</p>" : '<p class="pb-turno__nota">Último turno de la ronda.</p>');
    } else {
      html = '<span class="etiqueta">Ronda ' + juego.ronda + '</span><p class="pb-turno__nombre">Cierre de periodo</p><p class="pb-turno__nota">Se aplican la economía, los resultados y los nuevos precios.</p>';
    }
    $("turno").innerHTML = html;
  }

  function pintarEmpresa(juego) {
    var e = juego.fase === "turnos" && juego.turno ? Mo.empresa(juego, juego.turno) : null;
    if (!e) {
      $("empresa").innerHTML = '<span class="etiqueta">Empresa en turno</span><p class="pb-empresa__vacio">Sin empresa en turno.</p>';
      return;
    }
    var cartera = { MXN: 0, USD: 0 };
    Object.keys(e.cartera).forEach(function (k) {
      var v = Mo.valor(juego, k), pos = e.cartera[k];
      if (v && pos.cantidad) cartera[v.divisa] += pos.cantidad * v.precio;
    });
    var pagos = Mo.pagosRonda(juego, e);
    var dato = function (etiqueta, valor, extra) {
      return '<div' + (extra ? ' class="' + extra + '"' : "") + '><dt class="etiqueta">' + etiqueta + "</dt><dd>" + valor + "</dd></div>";
    };
    $("empresa").innerHTML = '<span class="etiqueta">Empresa en turno</span><p class="pb-empresa__nombre">' + esc(e.nombre) + "</p>" +
      '<dl class="pb-empresa__datos">' +
        dato("Caja MXN", F.dinero(e.caja.MXN, "MXN")) +
        dato("Caja USD", F.dinero(e.caja.USD, "USD")) +
        dato("Cartera MXN", F.dinero(cartera.MXN, "MXN")) +
        dato("Cartera USD", F.dinero(cartera.USD, "USD")) +
        dato("Deuda bancaria", F.dinero(Mo.deudaBancaria(e), e.divisa)) +
        dato("Total a pagar en la ronda", F.dinero(pagos.total, e.divisa), "pb-empresa__total") +
      "</dl>";
  }

  function pintarNoticias(juego, sinAnimar) {
    var lista = $("noticias");
    var arriba = lista.scrollTop;
    var notas = juego.bitacora.filter(function (n) { return NOTICIAS.indexOf(n.tipo) !== -1 && (filtro === "todas" || GRUPO[n.tipo] === filtro); }).reverse();
    var maximo = ultimaNoticia;
    lista.innerHTML = notas.length ? notas.map(function (n) {
      var nueva = !sinAnimar && ultimaNoticia && n.n > ultimaNoticia;
      if (n.n > maximo) maximo = n.n;
      return '<li class="pb-noticia tipo-' + n.tipo + (nueva ? " entrando" : "") + '"><span class="pb-noticia__meta">' + esc(ETIQUETAS[n.tipo] || n.tipo) + " · " + esc(E.nombreMes(n.mes, true)) + "</span>" + esc(n.texto) + "</li>";
    }).join("") : '<li class="pb-vacio">Sin noticias de este tipo.</li>';
    lista.scrollTop = arriba;
    ultimaNoticia = Math.max(maximo, juego.bitacora.length ? juego.bitacora[juego.bitacora.length - 1].n : 0) || -1;
  }

  function flecha(r) {
    if (!r.anterior || r.anterior === r.posicion) return '<span class="pb-flecha igual">–</span>';
    return r.anterior > r.posicion ? '<span class="pb-flecha sube">▲' + (r.anterior - r.posicion) + "</span>" : '<span class="pb-flecha baja">▼' + (r.posicion - r.anterior) + "</span>";
  }

  function pintarRanking(juego) {
    var fin = juego.fase === "terminada";
    var lista = fin ? juego.final.ranking : (juego.fase === "colocacion" ? [] : Mo.rankingActual(juego));
    var caja = $("ranking"), arriba = caja.scrollTop;
    $("ranking-titulo").textContent = fin ? "Ranking final" : "Ranking";
    document.body.classList.toggle("pb-final", fin);
    $("ranking").innerHTML = lista.length ? lista.map(function (r) {
      return '<li class="pb-fila' + (r.posicion <= 3 ? " podio-" + r.posicion : "") + '"><span class="pb-pos">' + r.posicion + "</span>" +
        '<span class="pb-fila__nombre">' + esc(r.nombre) + "</span>" +
        '<span class="pb-puntos">' + F.numero(r.puntaje, 1) + "</span>" + (fin ? "" : flecha(r)) + "</li>";
    }).join("") : '<li class="pb-vacio">El ranking aparece al cerrar la colocación.</li>';
    caja.scrollTop = arriba;
  }

  var ultimo = null;
  function pintar() {
    var juego = window.Juego.leer();
    ultimo = juego;
    $("pb").hidden = !juego;
    $("espera").hidden = !!juego;
    if (!juego) return;
    Mo.normalizar(juego);
    pintarBarra(juego);
    pintarCotizaciones(juego);
    pintarTurno(juego);
    pintarEmpresa(juego);
    pintarNoticias(juego);
    pintarRanking(juego);
  }

  $("filtros").addEventListener("click", function (e) {
    var b = e.target.closest("[data-filtro]");
    if (!b || !ultimo) return;
    filtro = b.getAttribute("data-filtro");
    document.querySelectorAll("[data-filtro]").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
    $("noticias").scrollTop = 0;
    pintarNoticias(ultimo, true);
  });

  var ventana = $("ventana");
  setInterval(function () {
    if (ventana.scrollHeight <= ventana.clientHeight + 4) return;
    var siguiente = ventana.scrollTop + ventana.clientHeight - 60;
    if (ventana.scrollTop + ventana.clientHeight >= ventana.scrollHeight - 4) siguiente = 0;
    ventana.scrollTo({ top: siguiente, behavior: reducido ? "auto" : "smooth" });
  }, 8000);

  var pendiente = null;
  window.Juego.escuchar(function () {
    clearTimeout(pendiente);
    pendiente = setTimeout(pintar, 80);
  });
  pintar();
})();
