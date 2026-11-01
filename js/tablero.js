(function () {
  "use strict";

  var F = window.Formato;
  var Mo = window.Motor;
  var P = window.Publicar;
  var E = window.Entorno;
  var $ = function (id) { return document.getElementById(id); };

  var juego = window.Juego.leer();
  if (!juego) { location.replace("configurar.html"); return; }
  Mo.normalizar(juego);
  if (P.asegurarCodigos(juego)) window.Juego.guardar(juego);

  var deshacer = [];
  var pestana = "cotizaciones";
  var filtro = "";
  var inversionista = juego.ordenBase[0];
  var op = { tipo: "compra", emisora: "", cantidad: "", lado: "compra", contraparte: "", precio: "", modoCredito: "solicitar", montoCredito: "", plazoCredito: "12", creditoSel: "", montoPago: "" };
  var PERIODOS_DIV = { 4: "trimestral", 2: "semestral", 1: "anual" };
  var turnoPintado = null;
  var animar = true;
  var preciosAntes = null;

  var logo = $("logo-img");
  function sinLogo() { logo.hidden = true; $("logo-texto").hidden = false; }
  logo.addEventListener("error", sinLogo);
  if (logo.complete && !logo.naturalWidth) sinLogo();

  function emp(k) { return Mo.empresa(juego, k); }
  function val(k) { return Mo.valor(juego, k); }
  function nombre(k) { var e = emp(k); return e ? e.nombre : "—"; }
  function esc(t) { return F.escapar(t); }
  function entero(n) { return F.numero(n, 0); }
  function pct(n) { return F.porcentaje(n); }
  function unidad(v, n) { return v.tipo === "bonos" ? (n === 1 ? "título" : "títulos") : (n === 1 ? "acción" : "acciones"); }

  function guardar() {
    P.asegurarCodigos(juego);
    if (!window.Juego.guardar(juego)) aviso("No se pudo guardar la partida en este navegador.");
    P.programar(juego);
  }

  var avisoEl = $("aviso");
  var avisoTimer = null;
  function aviso(texto) {
    avisoEl.textContent = texto;
    avisoEl.hidden = false;
    avisoEl.classList.remove("visible");
    void avisoEl.offsetWidth;
    avisoEl.classList.add("visible");
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function () { avisoEl.classList.remove("visible"); }, 3200);
  }

  function confirmar(boton, textoConfirmar, accion) {
    if (boton.dataset.confirmar) {
      clearTimeout(Number(boton.dataset.timer));
      delete boton.dataset.confirmar;
      boton.classList.remove("boton--peligro");
      accion();
      return;
    }
    var original = boton.textContent;
    boton.dataset.confirmar = "1";
    boton.classList.add("boton--peligro");
    boton.textContent = textoConfirmar;
    boton.dataset.timer = String(setTimeout(function () {
      delete boton.dataset.confirmar;
      boton.classList.remove("boton--peligro");
      boton.textContent = original;
    }, 4000));
  }

  function periodoEnJuego(env) {
    var n = E.mesesPorRonda(juego.parametros.partida.periodo);
    var ini = E.sumarMeses(env.mes, 1), fin = E.sumarMeses(env.mes, n);
    if (n === 1) return E.nombreMes(ini);
    var a = E.nombreMes(ini, true).split(" "), b = E.nombreMes(fin, true).split(" ");
    return a[1] === b[1] ? a[0] + " – " + b[0] + " " + b[1] : a.join(" ") + " – " + b.join(" ");
  }

  function pintarBarra() {
    var env = Mo.entornoActual(juego);
    var coloc = juego.fase === "colocacion";
    var fin = juego.fase === "terminada";
    $("tb-fase").textContent = coloc ? "Ronda 0" : fin ? "Ronda " + juego.final.ronda : "Ronda " + juego.ronda;
    $("tb-ronda").textContent = coloc ? "Colocación" : fin ? "Partida terminada" : periodoEnJuego(env);
    $("btn-cerrar").disabled = fin;
    $("btn-riesgos").disabled = juego.fase !== "turnos";
    $("tb-inflacion").textContent = pct(env.inflacionAnual);
    $("tb-tiie").textContent = pct(env.tiie);
    $("tb-tc").textContent = F.numero(env.tc, 2);
    var btn = $("btn-cerrar");
    if (!btn.dataset.confirmar) btn.textContent = coloc ? "Cerrar colocación" : fin ? "Partida terminada" : "Cerrar periodo";
  }

  var ESTADOS = { pendiente: "Pendiente", terminado: "Terminó", paso: "Pasó", sancionada: "Sin turno" };

  function pintarOrden() {
    var coloc = juego.fase === "colocacion";
    var lista = coloc ? juego.ordenBase : juego.fase === "terminada" ? [] : juego.ordenRonda;
    var hechos = coloc ? 0 : lista.filter(function (k) { return emp(k).estadoTurno !== "pendiente"; }).length;
    $("tb-avance").textContent = coloc ? lista.length + " empresas" : juego.fase === "terminada" ? "" : hechos + " de " + lista.length;
    var f = filtro.trim().toLowerCase();
    $("orden").innerHTML = lista.map(function (k, i) {
      var e = emp(k);
      if (f && e.nombre.toLowerCase().indexOf(f) === -1) return "";
      var actual = coloc ? k === inversionista : k === juego.turno;
      var ordenes = coloc ? juego.valores.filter(function (v) { return v.ordenes.some(function (o) { return o.inversionista === k; }); }).length : 0;
      var estado = coloc ? (ordenes ? ordenes + (ordenes === 1 ? " orden" : " órdenes") : "") : ESTADOS[e.estadoTurno];
      return '<li><button class="tb-orden__item' + (actual ? " actual" : "") + " estado-" + (coloc ? "coloc" : e.estadoTurno) + '" type="button" data-clave="' + esc(k) + '"' +
        (!coloc && e.estadoTurno !== "pendiente" ? " disabled" : "") + ">" +
        '<span class="tb-orden__num">' + String(i + 1).padStart(2, "0") + "</span>" +
        '<span class="tb-orden__nombre" title="' + esc(e.nombre) + '">' + esc(e.nombre) + (e.alertas.length ? ' <span class="punto-alerta" title="' + esc(e.alertas.join(", ")) + '"></span>' : "") + "</span>" +
        '<span class="tb-orden__estado">' + esc(actual && !coloc ? "En turno" : estado) + "</span>" +
        "</button></li>";
    }).join("");
  }

  $("orden").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-clave]");
    if (!b) return;
    animar = e.detail !== 0;
    var k = b.getAttribute("data-clave");
    if (juego.fase === "colocacion") {
      inversionista = k;
    } else {
      var r = Mo.seleccionarTurno(juego, k);
      if (!r.ok) { aviso(r.error); return; }
      guardar();
    }
    pintarTodo();
  });

  $("buscar").addEventListener("input", function () {
    filtro = $("buscar").value;
    pintarOrden();
  });
  $("buscar").addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var primero = $("orden").querySelector("button[data-clave]:not([disabled])");
    if (primero) { animar = false; primero.click(); }
  });

  function htmlColocacion() {
    var inv = emp(inversionista);
    var comp = Mo.compromisos(juego, inversionista);
    var filas = juego.valores.filter(function (v) { return v.emisora !== inversionista; }).map(function (v) {
      var demanda = v.ordenes.reduce(function (s, o) { return s + o.cantidad; }, 0);
      var mia = v.ordenes.filter(function (o) { return o.inversionista === inversionista; })[0];
      var maximo = Math.floor(v.total * juego.parametros.limites.tenenciaMax);
      var pctDem = demanda / v.total;
      return '<tr data-emisora="' + esc(v.emisora) + '">' +
        '<td><span class="tb-nombre">' + esc(nombre(v.emisora)) + '</span><span class="tb-sub">' + (v.tipo === "bonos" ? "Bonos" : "Acciones") + " · " + v.divisa + "</span></td>" +
        "<td>" + F.dinero(v.precioColocacion) + "</td>" +
        "<td>" + entero(v.total) + "</td>" +
        '<td class="tb-demanda' + (pctDem > 1 ? " sobre" : "") + '"><span>' + entero(demanda) + '</span><span class="tb-sub">' + F.numero(pctDem * 100, 0) + " %</span></td>" +
        '<td class="tb-celda-orden"><input class="control control--chico" type="text" inputmode="numeric" value="' + (mia ? mia.cantidad : "") + '" aria-label="Orden de ' + esc(inv.nombre) + " en " + esc(nombre(v.emisora)) + '" placeholder="0"><span class="tb-sub">Máx. ' + entero(maximo) + '</span><span class="tb-error"></span></td>' +
        "</tr>";
    }).join("");
    return '<div class="tb-centro__cabeza">' +
        '<span class="etiqueta">Ronda 0 · Colocación</span>' +
        '<h1 class="tb-titulo"><em>Órdenes de colocación</em></h1>' +
        '<p class="tb-nota">Anota cuánto quiere cada empresa de cada emisión. Al cerrar, la sobredemanda se reparte a prorrata y el público compra lo que sobre, con descuento según la calificación de la emisora.</p>' +
      "</div>" +
      '<div class="tb-inversionista">' +
        '<label class="campo__label" for="sel-inversionista">Empresa inversionista</label>' +
        '<select class="control" id="sel-inversionista">' + juego.ordenBase.map(function (k) {
          return '<option value="' + esc(k) + '"' + (k === inversionista ? " selected" : "") + ">" + esc(nombre(k)) + "</option>";
        }).join("") + "</select>" +
        '<dl class="tb-cajas">' +
          '<div><dt class="etiqueta">Caja MXN</dt><dd>' + F.dinero(inv.caja.MXN) + "</dd></div>" +
          '<div><dt class="etiqueta">Caja USD</dt><dd>' + F.dinero(inv.caja.USD) + "</dd></div>" +
          '<div><dt class="etiqueta">Comprometido</dt><dd id="comprometido">' + textoCompromiso(comp) + "</dd></div>" +
        "</dl>" +
      "</div>" +
      '<div class="tabla-scroll tb-tabla-coloc"><table class="tabla tabla--tablero"><thead><tr><th>Emisión</th><th>Precio</th><th>Oferta</th><th>Demanda</th><th>Orden</th></tr></thead><tbody>' + filas + "</tbody></table></div>";
  }

  function textoCompromiso(c) {
    var partes = [];
    if (c.MXN) partes.push(F.dinero(c.MXN, "MXN"));
    if (c.USD) partes.push(F.dinero(c.USD, "USD"));
    return partes.length ? partes.join(" · ") : "—";
  }

  function activarColocacion(centro) {
    centro.querySelector("#sel-inversionista").addEventListener("change", function (e) {
      inversionista = e.target.value;
      animar = false;
      pintarTodo();
    });
    centro.querySelectorAll(".tb-celda-orden input").forEach(function (input) {
      input.addEventListener("input", function () { input.value = input.value.replace(/\D/g, ""); });
      function aplicar() {
        var fila = input.closest("tr");
        var emisora = fila.getAttribute("data-emisora");
        var cantidad = input.value === "" ? 0 : Number(input.value);
        var r = Mo.ordenColocacion(juego, inversionista, emisora, cantidad);
        var error = fila.querySelector(".tb-error");
        if (!r.ok) {
          error.textContent = r.error;
          fila.classList.add("invalida");
          return;
        }
        error.textContent = "";
        fila.classList.remove("invalida");
        guardar();
        var v = val(emisora);
        var demanda = v.ordenes.reduce(function (s, o) { return s + o.cantidad; }, 0);
        var celda = fila.querySelector(".tb-demanda");
        celda.classList.toggle("sobre", demanda > v.total);
        celda.innerHTML = "<span>" + entero(demanda) + '</span><span class="tb-sub">' + F.numero(demanda / v.total * 100, 0) + " %</span>";
        $("comprometido").textContent = textoCompromiso(Mo.compromisos(juego, inversionista));
        pintarOrden();
        pintarInfo();
      }
      input.addEventListener("change", aplicar);
      input.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        aplicar();
        var filas = Array.prototype.slice.call(centro.querySelectorAll(".tb-celda-orden input"));
        var sig = filas[filas.indexOf(input) + 1];
        if (sig) sig.focus();
      });
    });
  }

  function opcionesValor(e) {
    var tenidos = Object.keys(e.cartera);
    var vende = op.tipo === "venta" || (op.tipo === "cruce" && op.lado === "venta");
    return juego.valores
      .filter(function (v) { return v.colocado && !v.vencido && v.emisora !== e.clave && (!vende || tenidos.indexOf(v.emisora) !== -1); })
      .sort(function (a, b) { return nombre(a.emisora).localeCompare(nombre(b.emisora), "es"); });
  }

  function htmlTurno() {
    var e = emp(juego.turno);
    var p = juego.parametros;
    var maxOps = p.operacion.operacionesPorTurno;
    var tc = Mo.entornoActual(juego).tc;
    var posicion = juego.ordenRonda.indexOf(e.clave) + 1;
    var opciones = opcionesValor(e);
    if (!opciones.some(function (v) { return v.emisora === op.emisora; })) op.emisora = opciones.length ? opciones[0].emisora : "";
    var v = op.emisora ? val(op.emisora) : null;
    if (op.tipo === "cruce" && v && (op.precio === "" || op.precioDe !== op.emisora)) { op.precio = F.numero(v.precio, 2).replace(/,/g, ""); op.precioDe = op.emisora; }

    var puntos = "";
    for (var i = 0; i < maxOps; i++) puntos += '<span class="tb-op-punto' + (i < e.ops ? " usado" : "") + '"></span>';

    var cartera = Object.keys(e.cartera).map(function (k) {
      var vv = val(k), pos = e.cartera[k];
      return "<li><span>" + esc(nombre(k)) + ' <span class="tb-sub">' + (vv.tipo === "bonos" ? "bonos" : "acciones") + "</span></span><span>" + entero(pos.cantidad) + " · " + F.dinero(pos.cantidad * vv.precio, vv.divisa) + "</span></li>";
    }).join("");

    var contrapartes = juego.ordenRonda.filter(function (k) { return k !== e.clave; });
    if (op.tipo === "cruce" && contrapartes.indexOf(op.contraparte) === -1) op.contraparte = contrapartes[0] || "";

    var opsTurno = juego.operaciones.filter(function (o) { return o.empresa === e.clave; });

    return '<div class="tb-centro__cabeza">' +
        '<div class="tb-turno-linea"><span class="etiqueta">En turno · ' + posicion + " de " + juego.ordenRonda.length + '</span><span class="tb-ops" title="Operaciones del turno">' + puntos + "<span>" + e.ops + "/" + maxOps + "</span></span></div>" +
        '<h1 class="tb-titulo">' + esc(e.nombre) + "</h1>" +
        '<p class="tb-meta"><span class="marca-mercado marca-mercado--' + (e.mercado === "Deuda" ? "deuda" : "capitales") + '">' + esc(e.mercado) + "</span>" + esc(e.divisa) + " · Calificación " + esc(e.calificacion || "—") +
        (e.dividendos ? " · Dividendos " + F.numero(e.dividendos.porcentaje * 100, 0) + " % " + (PERIODOS_DIV[e.dividendos.periodicidad] || "") : "") +
        (e.alertas.length ? ' · <span class="tb-alerta">' + esc(e.alertas.join(", ")) + "</span>" : "") + "</p>" +
      "</div>" +
      '<dl class="tb-cajas">' +
        '<div><dt class="etiqueta">Caja MXN</dt><dd>' + F.dinero(e.caja.MXN) + "</dd></div>" +
        '<div><dt class="etiqueta">Caja USD</dt><dd>' + F.dinero(e.caja.USD) + "</dd></div>" +
        '<div><dt class="etiqueta">Cartera ' + e.divisa + "</dt><dd>" + F.dinero(Mo.valorCartera(juego, e, tc)) + "</dd></div>" +
        '<div><dt class="etiqueta">Deuda bancaria ' + e.divisa + "</dt><dd>" + F.dinero(Mo.deudaBancaria(e)) + "</dd></div>" +
      "</dl>" +
      (cartera ? '<details class="tb-cartera"><summary class="etiqueta">Ver cartera</summary><ul>' + cartera + "</ul></details>" : "") +
      '<form class="tb-form" id="form-op" novalidate>' +
        '<div class="segmentado" role="tablist" aria-label="Tipo de operación">' +
          ["compra", "venta", "cruce", "credito"].map(function (t) {
            return '<button type="button" role="tab" class="segmentado__btn' + (op.tipo === t ? " activo" : "") + '" aria-selected="' + (op.tipo === t) + '" data-tipo="' + t + '">' + { compra: "Comprar", venta: "Vender", cruce: "Cruce", credito: "Crédito" }[t] + "</button>";
          }).join("") +
        "</div>" +
        (op.tipo === "credito" ? htmlCredito(e) : (
        (op.tipo === "cruce"
          ? '<div class="tb-campos tb-campos--dos">' +
              '<div class="campo"><span class="campo__label">' + esc(e.nombre) + "</span>" +
                '<div class="segmentado segmentado--chico">' +
                  '<button type="button" class="segmentado__btn' + (op.lado === "compra" ? " activo" : "") + '" data-lado="compra">Compra</button>' +
                  '<button type="button" class="segmentado__btn' + (op.lado === "venta" ? " activo" : "") + '" data-lado="venta">Vende</button>' +
                "</div></div>" +
              '<div class="campo"><label class="campo__label" for="op-contraparte">Contraparte</label><select class="control" id="op-contraparte">' +
                contrapartes.map(function (k) { return '<option value="' + esc(k) + '"' + (k === op.contraparte ? " selected" : "") + ">" + esc(nombre(k)) + "</option>"; }).join("") +
              "</select></div>" +
            "</div>"
          : "") +
        '<div class="tb-campos">' +
          '<div class="campo"><label class="campo__label" for="op-valor">Valor</label>' +
            (opciones.length
              ? '<select class="control" id="op-valor">' + opciones.map(function (o) {
                  return '<option value="' + esc(o.emisora) + '"' + (o.emisora === op.emisora ? " selected" : "") + ">" + esc(nombre(o.emisora)) + " · " + (o.tipo === "bonos" ? "Bonos" : "Acciones") + " · " + F.dinero(o.precio, o.divisa) + "</option>";
                }).join("") + "</select>"
              : '<p class="tb-vacio-campo">' + (op.tipo === "venta" || (op.tipo === "cruce" && op.lado === "venta") ? "No tiene valores para vender." : "No hay valores disponibles.") + "</p>") +
          "</div>" +
          '<div class="campo"><label class="campo__label" for="op-cantidad">' + (v ? unidad(v, 2) : "Cantidad") + '</label><input class="control" id="op-cantidad" type="text" inputmode="numeric" autocomplete="off" value="' + esc(op.cantidad) + '" placeholder="0" aria-describedby="op-maximo"><span class="tb-sub tb-maximo" id="op-maximo" aria-live="polite"></span></div>' +
          (op.tipo === "cruce" ? '<div class="campo"><label class="campo__label" for="op-precio">Precio' + (v ? " (" + v.divisa + ")" : "") + '</label><input class="control" id="op-precio" type="text" inputmode="decimal" autocomplete="off" value="' + esc(op.precio) + '"></div>' : "") +
        "</div>"
        )) +
        '<div class="tb-previa" id="previa" aria-live="polite"></div>' +
        '<div class="tb-form__pie">' +
          '<button class="boton boton--primario" type="submit" id="btn-registrar">Registrar operación</button>' +
        "</div>" +
      "</form>" +
      '<div class="tb-ops-lista">' +
        '<div class="tb-ops-lista__cabeza"><span class="etiqueta">Operaciones del turno</span>' +
          '<button class="enlace-boton enlace-boton--chico" type="button" id="btn-deshacer"' + (deshacer.length ? "" : " disabled") + ">Deshacer última operación</button></div>" +
        (opsTurno.length
          ? "<ol>" + opsTurno.map(function (o) { return '<li class="' + (o.nueva ? "entrando" : "") + '">' + esc(textoOperacion(o.detalle)) + "</li>"; }).join("") + "</ol>"
          : '<p class="tb-sub">Aún no registra operaciones.</p>') +
      "</div>" +
      '<div class="tb-turno-pie">' +
        (e.ops === 0
          ? '<button class="boton boton--fantasma" type="button" id="btn-pasar">Pasar</button>'
          : '<button class="boton boton--fantasma" type="button" id="btn-terminar">Terminar turno</button>') +
      "</div>";
  }

  function htmlCredito(e) {
    var creditos = e.creditos || [];
    if (!creditos.some(function (c) { return c.id === op.creditoSel; })) op.creditoSel = creditos.length ? creditos[0].id : "";
    if (op.modoCredito === "pagar" && !creditos.length) op.modoCredito = "solicitar";
    var c = juego.parametros.credito;
    var lista = creditos.length
      ? '<div class="tabla-scroll tb-creditos"><table class="tabla tabla--tablero"><thead><tr><th>Crédito</th><th>Saldo</th><th>Tasa</th><th>Mensualidad</th><th>Restan</th></tr></thead><tbody>' +
        creditos.map(function (x, i) {
          return "<tr><td>" + (i + 1) + '<span class="tb-sub">TIIE + ' + F.numero(x.sobretasa * 100, 2) + "</span></td><td>" + F.dinero(x.saldo) + "</td><td>" + pct(x.tasa) + "</td><td>" + F.dinero(x.pago) + "</td><td>" + x.plazoRestante + " m</td></tr>";
        }).join("") + "</tbody></table></div>"
      : "";
    var modos = '<div class="segmentado segmentado--chico tb-modos">' +
      '<button type="button" class="segmentado__btn' + (op.modoCredito === "solicitar" ? " activo" : "") + '" data-modo="solicitar">Solicitar</button>' +
      '<button type="button" class="segmentado__btn' + (op.modoCredito === "pagar" ? " activo" : "") + '" data-modo="pagar"' + (creditos.length ? "" : " disabled") + ">Pagar anticipado</button>" +
      "</div>";
    var campos = op.modoCredito === "solicitar"
      ? '<div class="tb-campos">' +
          '<div class="campo"><label class="campo__label" for="cr-monto">Monto (' + e.divisa + ')</label><input class="control" id="cr-monto" type="text" inputmode="decimal" autocomplete="off" value="' + esc(op.montoCredito) + '" placeholder="0.00"></div>' +
          '<div class="campo"><label class="campo__label" for="cr-plazo">Plazo (meses)</label><input class="control" id="cr-plazo" type="text" inputmode="numeric" autocomplete="off" value="' + esc(op.plazoCredito) + '" placeholder="' + c.plazoMin + "–" + c.plazoMax + '"></div>' +
        "</div>"
      : '<div class="tb-campos">' +
          '<div class="campo"><label class="campo__label" for="cr-credito">Crédito</label><select class="control" id="cr-credito">' +
            creditos.map(function (x, i) { return '<option value="' + x.id + '"' + (x.id === op.creditoSel ? " selected" : "") + ">Crédito " + (i + 1) + " · saldo " + F.dinero(x.saldo, e.divisa) + "</option>"; }).join("") +
          "</select></div>" +
          '<div class="campo"><label class="campo__label" for="cr-pago">Monto a pagar</label><div class="tb-con-boton"><input class="control" id="cr-pago" type="text" inputmode="decimal" autocomplete="off" value="' + esc(op.montoPago) + '" placeholder="0.00"><button class="boton boton--fantasma boton--chico" type="button" id="cr-todo">Todo</button></div></div>' +
        "</div>";
    return lista + modos + campos;
  }

  function textoOperacion(d) {
    if (d.tipo === "credito") return "Crédito de " + F.dinero(d.monto, d.divisa) + " a " + d.plazo + " meses (tasa " + pct(d.tasa) + ")";
    if (d.tipo === "pago") return (d.saldo <= 0.005 ? "Liquidó un crédito: " : "Pago anticipado de crédito: ") + F.dinero(d.monto, d.divisa);
    var v = val(d.emisora);
    var verbo = d.tipo === "compra" ? "Compró" : d.tipo === "venta" ? "Vendió" : (d.lado === "venta" ? "Cruce: vendió a " + nombre(d.comprador.clave) : "Cruce: compró a " + nombre(d.vendedor.clave));
    return verbo + " " + entero(d.cantidad) + " " + unidad(v, d.cantidad) + " de " + nombre(d.emisora) + " a " + F.dinero(d.precioUnit, d.divisa);
  }

  function numeroDe(id) {
    var el = $(id);
    if (!el) return 0;
    var n = Number(el.value.replace(/,/g, ""));
    return el.value.trim() === "" || !isFinite(n) ? 0 : n;
  }

  function leerCredito() {
    if ($("cr-monto")) op.montoCredito = $("cr-monto").value;
    if ($("cr-plazo")) op.plazoCredito = $("cr-plazo").value;
    if ($("cr-credito")) op.creditoSel = $("cr-credito").value;
    if ($("cr-pago")) op.montoPago = $("cr-pago").value;
    return op.modoCredito === "solicitar"
      ? { empresa: juego.turno, monto: numeroDe("cr-monto"), plazo: numeroDe("cr-plazo") }
      : { empresa: juego.turno, credito: op.creditoSel, monto: numeroDe("cr-pago") };
  }

  function previaCredito(previa, boton) {
    var o = leerCredito();
    var e = emp(juego.turno), div = e.divisa;
    if (op.modoCredito === "solicitar") {
      var r = Mo.vistaPreviaCredito(juego, o);
      boton.disabled = !r.ok;
      var d = r.detalle;
      if (!r.ok) {
        var extra = d ? '<dl class="tb-previa__datos">' + filaPrevia("Calificación", d.calificacion) + filaPrevia("Disponible (" + F.numero(juego.parametros.credito.maxActivos * 100, 0) + " % de activos)", F.dinero(d.disponible, div)) + "</dl>" : "";
        previa.innerHTML = (o.monto || /negado/.test(r.error) ? '<p class="tb-error-linea">' + esc(r.error) + "</p>" : "") + extra;
        return;
      }
      previa.innerHTML = '<dl class="tb-previa__datos">' +
        filaPrevia("Calificación", d.calificacion + " · TIIE + " + F.numero(d.sobretasa * 100, 2)) +
        filaPrevia("Tasa inicial", pct(d.tasa) + " (cambia con la TIIE)") +
        filaPrevia("Comisión de apertura", F.dinero(d.comision, div)) +
        filaPrevia("Monto a recibir", F.dinero(d.recibe, div), "total") +
        filaPrevia("Mensualidad estimada", F.dinero(d.pago, div)) +
        filaPrevia("Intereses estimados", F.dinero(d.intereses, div)) +
        filaPrevia("Disponible después", F.dinero(d.disponible - d.monto, div)) +
        "</dl>";
      return;
    }
    var rp = Mo.vistaPreviaPago(juego, o);
    boton.disabled = !rp.ok;
    if (!rp.ok) { previa.innerHTML = o.monto ? '<p class="tb-error-linea">' + esc(rp.error) + "</p>" : ""; return; }
    var dp = rp.detalle;
    var filas = [filaPrevia("Saldo actual", F.dinero(dp.saldoAntes, div)), filaPrevia("Pago", F.dinero(dp.monto, div), "total")];
    dp.conversiones.forEach(function (c) { filas.push(filaPrevia("Conversión", F.dinero(c.entrega, c.de) + " → " + F.dinero(c.recibe, c.a))); });
    filas.push(filaPrevia("Saldo después", F.dinero(dp.saldo, div)));
    filas.push(filaPrevia("Nueva mensualidad", dp.saldo > 0.005 ? F.dinero(dp.pago, div) + " (antes " + F.dinero(dp.pagoAntes) + ")" : "Crédito liquidado"));
    previa.innerHTML = '<dl class="tb-previa__datos">' + filas.join("") + "</dl>";
  }

  function leerOp() {
    var cant = $("op-cantidad") ? $("op-cantidad").value.replace(/\D/g, "") : "";
    op.cantidad = cant;
    if ($("op-valor")) op.emisora = $("op-valor").value;
    if ($("op-contraparte")) op.contraparte = $("op-contraparte").value;
    if ($("op-precio")) op.precio = $("op-precio").value;
    var o = { tipo: op.tipo, empresa: juego.turno, emisora: op.emisora, cantidad: cant === "" ? 0 : Number(cant) };
    if (op.tipo === "cruce") { o.lado = op.lado; o.contraparte = op.contraparte; o.precio = Number(String(op.precio).replace(/,/g, "")); }
    return o;
  }

  function filaPrevia(etiqueta, valor, clase) {
    return '<div class="' + (clase || "") + '"><dt>' + esc(etiqueta) + "</dt><dd>" + esc(valor) + "</dd></div>";
  }

  function pintarMaximo(o) {
    var el = $("op-maximo");
    if (!el) return;
    var m = o.emisora ? Mo.maximoOperable(juego, o) : null;
    if (!m) { el.textContent = ""; return; }
    var u = unidad(val(o.emisora), 2);
    var antes = o.tipo === "compra" ? "Público: " + entero(m.publico) + " disponibles"
      : o.tipo === "venta" ? "Tienes " + entero(m.tenencia)
      : (o.lado === "venta" ? "Tienes " + entero(m.tenencia) : nombre(o.contraparte) + " tiene " + entero(m.contraparte));
    var verbo = o.tipo === "compra" ? "Puedes comprar" : o.tipo === "venta" ? "Puedes vender" : "Puedes cruzar";
    el.textContent = antes + " · " + verbo + " hasta " + entero(m.maximo) + " " + u;
  }

  function actualizarPrevia() {
    var o = op.tipo === "credito" ? null : leerOp();
    var previa = $("previa");
    var boton = $("btn-registrar");
    if (!previa) return;
    if (op.tipo === "credito") { previaCredito(previa, boton); return; }
    pintarMaximo(o);
    if (!o.emisora || !o.cantidad) {
      previa.innerHTML = "";
      boton.disabled = true;
      return;
    }
    var r = Mo.vistaPrevia(juego, o);
    boton.disabled = !r.ok;
    if (!r.ok) { previa.innerHTML = '<p class="tb-error-linea">' + esc(r.error) + "</p>"; return; }
    var d = r.detalle, div = d.divisa, v = val(d.emisora);
    var filas = [filaPrevia("Precio por " + unidad(v, 1), F.dinero(d.precioUnit, div) + (d.tipo === "cruce" ? "" : " (cotización " + F.dinero(d.precio) + ")"))];
    filas.push(filaPrevia("Importe", F.dinero(d.bruto, div)));
    var mio = d.comprador && d.comprador.clave === juego.turno ? "comprador" : "vendedor";
    if (mio === "comprador") {
      filas.push(filaPrevia("Comisión", F.dinero(d.comision, div)));
      d.comprador.conversiones.forEach(function (c) {
        filas.push(filaPrevia("Conversión", F.dinero(c.entrega, c.de) + " → " + F.dinero(c.recibe, c.a)));
      });
      filas.push(filaPrevia("Total a pagar", F.dinero(d.comprador.total, div), "total"));
      filas.push(filaPrevia("Tenencia final", entero(d.comprador.tenenciaFinal) + " (" + F.numero(d.comprador.tenenciaFinal / v.total * 100, 2) + " %)"));
    } else {
      var s = d.vendedor;
      filas.push(filaPrevia("Comisión", F.dinero(s.comision, div)));
      filas.push(filaPrevia("Ganancia", F.dinero(s.ganancia, div)));
      if (s.impuesto) filas.push(filaPrevia("Impuesto (" + F.numero(juego.parametros.operacion.impuestoGanancias * 100, 0) + " %)", F.dinero(s.impuesto, div)));
      filas.push(filaPrevia("Neto a recibir", F.dinero(s.neto, div), "total"));
      filas.push(filaPrevia("Tenencia final", entero(s.tenenciaFinal)));
    }
    if (d.tipo === "cruce") {
      var otraClave = mio === "comprador" ? d.vendedor.clave : d.comprador.clave;
      var otroMonto = mio === "comprador" ? "recibe " + F.dinero(d.vendedor.neto, div) : "paga " + F.dinero(d.comprador.total, div);
      filas.push(filaPrevia(nombre(otraClave), otroMonto));
    }
    previa.innerHTML = '<dl class="tb-previa__datos">' + filas.join("") + "</dl>";
  }

  function activarTurno(centro) {
    centro.querySelectorAll("[data-tipo]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        op.tipo = b.getAttribute("data-tipo");
        animar = false;
        pintarCentro();
        focoCantidad(e.detail === 0);
      });
    });
    centro.querySelectorAll("[data-modo]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        op.modoCredito = b.getAttribute("data-modo");
        animar = false;
        pintarCentro();
        var primero = $(op.modoCredito === "solicitar" ? "cr-monto" : "cr-pago");
        if (primero && (e.detail === 0 || window.matchMedia("(pointer: fine)").matches)) primero.focus({ preventScroll: true });
      });
    });
    ["cr-monto", "cr-pago"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("input", function () { el.value = el.value.replace(/[^\d.]/g, ""); actualizarPrevia(); });
    });
    if ($("cr-plazo")) $("cr-plazo").addEventListener("input", function () { $("cr-plazo").value = $("cr-plazo").value.replace(/\D/g, ""); actualizarPrevia(); });
    if ($("cr-credito")) $("cr-credito").addEventListener("change", function () { op.montoPago = ""; leerCredito(); animar = false; pintarCentro(); });
    if ($("cr-todo")) $("cr-todo").addEventListener("click", function () {
      var c = (emp(juego.turno).creditos || []).filter(function (x) { return x.id === $("cr-credito").value; })[0];
      if (c) { $("cr-pago").value = String(Math.round(c.saldo * 100) / 100); actualizarPrevia(); }
    });
    centro.querySelectorAll("[data-lado]").forEach(function (b) {
      b.addEventListener("click", function () {
        op.lado = b.getAttribute("data-lado");
        animar = false;
        pintarCentro();
      });
    });
    ["op-valor", "op-contraparte"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("change", function () {
        if (id === "op-valor") op.precio = "";
        leerOp();
        if (id === "op-valor" && op.tipo === "cruce") { animar = false; pintarCentro(); return; }
        actualizarPrevia();
      });
    });
    ["op-cantidad", "op-precio"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener("input", function () {
        if (id === "op-cantidad") el.value = el.value.replace(/\D/g, "");
        else el.value = el.value.replace(/[^\d.]/g, "");
        actualizarPrevia();
      });
    });
    $("form-op").addEventListener("submit", function (e) {
      e.preventDefault();
      registrar();
    });
    $("btn-deshacer").addEventListener("click", deshacerUltima);
    var pasar = $("btn-pasar") || $("btn-terminar");
    pasar.addEventListener("click", function (e) {
      animar = e.detail !== 0;
      var nombreAntes = emp(juego.turno).nombre;
      Mo.terminarTurno(juego, pasar.id === "btn-pasar");
      guardar();
      op.cantidad = "";
      aviso(nombreAntes + (pasar.id === "btn-pasar" ? " pasó." : " terminó su turno."));
      pintarTodo();
    });
    actualizarPrevia();
  }

  function focoCantidad(siempre) {
    var c = $("op-cantidad") || $("cr-monto") || $("cr-pago");
    if (c && (siempre || window.matchMedia("(pointer: fine)").matches)) c.focus({ preventScroll: true });
  }

  function registrar() {
    var previo = JSON.stringify(juego);
    var antesTurno = juego.turno;
    var r;
    if (op.tipo === "credito") {
      var oc = leerCredito();
      r = op.modoCredito === "solicitar" ? Mo.solicitarCredito(juego, oc) : Mo.pagarCredito(juego, oc);
      if (r.ok) { op.montoCredito = ""; op.montoPago = ""; }
    } else {
      r = Mo.operar(juego, leerOp());
    }
    if (!r.ok) { aviso(r.error); actualizarPrevia(); return; }
    deshacer.push(previo);
    guardar();
    r.registro.nueva = true;
    var nota = juego.bitacora.filter(function (n) { return n.tipo === "operacion" || n.tipo === "credito"; }).pop();
    aviso(nota ? nota.texto : "Operación registrada.");
    op.cantidad = "";
    animar = false;
    pintarTodo();
    juego.operaciones.forEach(function (x) { delete x.nueva; });
    if (juego.turno === antesTurno) focoCantidad(false);
  }

  function deshacerUltima() {
    if (!deshacer.length) return;
    juego = JSON.parse(deshacer.pop());
    guardar();
    aviso("Se deshizo la última operación.");
    animar = false;
    pintarTodo();
  }

  function htmlFinRonda() {
    return '<div class="tb-fin">' +
      '<span class="etiqueta">Ronda ' + juego.ronda + "</span>" +
      '<h1 class="tb-titulo">Turnos <em>completos</em></h1>' +
      '<p class="tb-nota">Todas las empresas terminaron su turno. Cierra el periodo para aplicar la economía, los resultados y los nuevos precios.</p>' +
      '<button class="boton boton--primario" type="button" id="btn-cerrar-fin">Cerrar periodo</button>' +
      (deshacer.length ? '<button class="enlace-boton" type="button" id="btn-deshacer-fin">Deshacer última operación</button>' : "") +
      "</div>";
  }

  function pintarCentro() {
    var centro = $("centro");
    var clave = juego.fase === "terminada" ? "fin" : juego.fase === "colocacion" ? "coloc:" + inversionista : "turno:" + juego.turno + ":" + juego.ronda;
    var cambio = clave !== turnoPintado;
    if (juego.fase === "terminada") {
      centro.innerHTML = htmlFinal();
      activarFinal(centro);
    } else if (juego.fase === "colocacion") {
      centro.innerHTML = htmlColocacion();
      activarColocacion(centro);
    } else if (juego.turno) {
      centro.innerHTML = htmlTurno();
      activarTurno(centro);
    } else {
      centro.innerHTML = htmlFinRonda();
      $("btn-cerrar-fin").addEventListener("click", function () { cerrarPeriodo(); });
      if ($("btn-deshacer-fin")) $("btn-deshacer-fin").addEventListener("click", deshacerUltima);
    }
    centro.classList.remove("entrando");
    if (cambio && animar) { void centro.offsetWidth; centro.classList.add("entrando"); }
    if (cambio) centro.scrollTop = 0;
    turnoPintado = clave;
    animar = true;
  }

  function htmlCotizaciones() {
    var coloc = juego.fase === "colocacion";
    var filas = juego.valores.slice().sort(function (a, b) { return nombre(a.emisora).localeCompare(nombre(b.emisora), "es"); }).map(function (v) {
      var e = emp(v.emisora);
      var cambio = v.precioRondaAnterior ? v.precio / v.precioRondaAnterior - 1 : 0;
      var demanda = v.ordenes.reduce(function (s, o) { return s + o.cantidad; }, 0);
      var destello = preciosAntes && preciosAntes[v.emisora] !== undefined && Math.abs(v.precio - preciosAntes[v.emisora]) > 1e-9
        ? (v.precio > preciosAntes[v.emisora] ? " destello-sube" : " destello-baja") : "";
      return '<tr class="' + destello + '" data-emisora="' + esc(v.emisora) + '">' +
        '<td><span class="tb-nombre">' + esc(e.nombre) + '</span><span class="tb-sub">' + (v.tipo === "bonos" ? "Bonos" : "Acciones") + " · " + v.divisa + (v.vencido ? " · vencido" : "") + (v.liquidado ? " · liquidado" : "") + "</span></td>" +
        "<td>" + F.dinero(coloc ? v.precioColocacion : v.precio) + "</td>" +
        (coloc
          ? '<td class="' + (demanda > v.total ? "sube" : "") + '">' + F.numero(demanda / v.total * 100, 0) + " %</td>"
          : '<td class="' + (cambio > 1e-9 ? "sube" : cambio < -1e-9 ? "baja" : "") + '">' + (cambio > 0 ? "+" : "") + F.numero(cambio * 100, 2) + " %</td>") +
        "<td>" + esc(e.calificacion || "—") + "</td>" +
        "<td>" + entero(v.publico) + "</td>" +
        "</tr>";
    }).join("");
    return '<div class="tabla-scroll tb-tabla-info"><table class="tabla tabla--tablero"><thead><tr><th>Emisora</th><th>' + (coloc ? "Colocación" : "Precio") + "</th><th>" + (coloc ? "Demanda" : "Var.") + "</th><th>Calif.</th><th>Público</th></tr></thead><tbody>" + filas + "</tbody></table></div>";
  }

  function compacto(n, divisa) {
    if (n === null || n === undefined || !isFinite(n)) return "—";
    var t = new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(n));
    return (n < 0 ? "-$" : "$") + t + (divisa ? " " + divisa : "");
  }

  function htmlEmpresas() {
    var puntos = {};
    Mo.puntajeActual(juego).forEach(function (p) { puntos[p.clave] = p.puntaje; });
    var filas = juego.empresas.slice().sort(function (a, b) {
      return (a.quebrada ? 1 : 0) - (b.quebrada ? 1 : 0) || (puntos[b.clave] || 0) - (puntos[a.clave] || 0);
    }).map(function (e) {
      var otraD = e.divisa === "MXN" ? "USD" : "MXN";
      if (e.quebrada) {
        return '<tr class="quebrada"><td><span class="tb-nombre">' + esc(e.nombre) + '</span><span class="tb-sub tb-alerta">Quebrada (ronda ' + e.quiebra.ronda + ")</span></td>" +
          '<td colspan="4"><span class="tb-sub">Bancos cobraron ' + compacto(e.quiebra.aBancos, e.divisa) + " de " + compacto(e.quiebra.deuda) + "</span></td></tr>";
      }
      return "<tr>" +
        '<td><span class="tb-nombre">' + esc(e.nombre) + "</span>" + (e.alertas.length ? '<span class="tb-sub tb-alerta">' + esc(e.alertas.join(", ")) + "</span>" : '<span class="tb-sub">' + esc(e.mercado) + " · " + e.divisa + "</span>") + "</td>" +
        "<td>" + compacto(e.caja[e.divisa]) + '<span class="tb-sub">' + compacto(e.caja[otraD], otraD) + "</span></td>" +
        "<td>" + compacto(Mo.deudaBancaria(e)) + "</td>" +
        '<td class="' + (e.utilidadAcumulada < 0 ? "baja" : "") + '">' + compacto(e.utilidadAcumulada) + "</td>" +
        "<td>" + F.numero(puntos[e.clave] || 0, 1) + '<span class="tb-sub">' + esc(e.calificacion || "—") + "</span></td>" +
        "</tr>";
    }).join("");
    return '<div class="tabla-scroll tb-tabla-info"><table class="tabla tabla--tablero"><thead><tr><th>Empresa</th><th>Caja</th><th>Deuda</th><th>Utilidad</th><th>Puntaje</th></tr></thead><tbody>' + filas + "</tbody></table></div>";
  }

  var ETIQUETAS_BITACORA = { riesgo: "Riesgo", fin: "Fin", inicio: "Inicio", colocacion: "Colocación", operacion: "Operación", turno: "Turno", cierre: "Cierre", precio: "Precio", bonos: "Bonos", alerta: "Alerta", credito: "Crédito", dividendo: "Dividendo", impago: "Impago", quiebra: "Quiebra" };

  function htmlBitacora() {
    var notas = juego.bitacora.slice(-200).reverse();
    return '<ol class="tb-bitacora">' + notas.map(function (n) {
      return '<li class="tb-bitacora__item tipo-' + n.tipo + '"><span class="tb-bitacora__meta">R' + n.ronda + " · " + esc(E.nombreMes(n.mes, true)) + " · " + (ETIQUETAS_BITACORA[n.tipo] || n.tipo) + "</span>" + esc(n.texto) + "</li>";
    }).join("") + "</ol>";
  }

  function pintarInfo() {
    var info = $("info");
    var arriba = info.scrollTop;
    info.innerHTML = pestana === "cotizaciones" ? htmlCotizaciones() : pestana === "empresas" ? htmlEmpresas() : htmlBitacora();
    info.scrollTop = arriba;
  }

  document.querySelectorAll(".pestana").forEach(function (b) {
    b.addEventListener("click", function () {
      pestana = b.getAttribute("data-pestana");
      document.querySelectorAll(".pestana").forEach(function (o) {
        o.classList.toggle("activa", o === b);
        o.setAttribute("aria-selected", String(o === b));
      });
      $("info").scrollTop = 0;
      pintarInfo();
    });
  });

  $("info").addEventListener("click", function (e) {
    var fila = e.target.closest("tr[data-emisora]");
    if (!fila || juego.fase !== "turnos" || !juego.turno) return;
    var k = fila.getAttribute("data-emisora");
    if (k === juego.turno) return;
    if (op.tipo === "credito" || (op.tipo === "venta" && !emp(juego.turno).cartera[k])) op.tipo = "compra";
    op.emisora = k;
    op.precio = "";
    animar = false;
    pintarCentro();
    focoCantidad(false);
  });

  function cerrarPeriodo() {
    var antes = {};
    juego.valores.forEach(function (v) { antes[v.emisora] = v.precio; });
    var r = Mo.cerrarPeriodo(juego);
    if (!r.ok) { aviso(r.error); return; }
    deshacer = [];
    guardar();
    window.Juego.respaldar(juego, "Cierre de ronda " + (juego.ronda - 1));
    preciosAntes = antes;
    var env = Mo.entornoActual(juego);
    aviso("Periodo cerrado: " + E.nombreMes(env.mes) + ". Empieza la ronda " + juego.ronda + ".");
    pintarTodo();
    preciosAntes = null;
  }

  $("btn-cerrar").addEventListener("click", function () {
    var boton = $("btn-cerrar");
    if (juego.fase === "colocacion") {
      confirmar(boton, "¿Cerrar colocación? Confirmar", function () {
        var r = Mo.cerrarColocacion(juego);
        if (!r.ok) { aviso(r.error); return; }
        deshacer = [];
        guardar();
        window.Juego.respaldar(juego, "Colocación cerrada");
        var sobre = r.resumen.filter(function (x) { return x.demanda > x.oferta; }).length;
        aviso("Colocación cerrada: " + r.resumen.length + " emisiones" + (sobre ? ", " + sobre + " con sobredemanda" : "") + ". Empieza la ronda 1.");
        pintarTodo();
      });
      return;
    }
    var pend = Mo.pendientes(juego).length;
    if (!pend) { cerrarPeriodo(); return; }
    confirmar(boton, "Quedan " + pend + " turnos. ¿Cerrar?", cerrarPeriodo);
  });

  function htmlFinal() {
    var r = juego.final.ranking;
    var podio = r.slice(0, 3).map(function (x) {
      return '<li class="tb-podio__lugar lugar-' + x.posicion + '"><span class="tb-podio__pos">' + x.posicion + "</span>" +
        '<span class="tb-podio__nombre">' + esc(x.nombre) + '</span><span class="tb-podio__puntos">' + F.numero(x.puntaje, 1) + " pts</span></li>";
    }).join("");
    var filas = r.map(function (x) {
      return "<tr><td>" + x.posicion + "</td><td>" + esc(x.nombre) + '<span class="tb-sub">' + esc(x.mercado) + " · " + x.divisa + "</span></td>" +
        "<td>" + F.numero(x.puntaje, 1) + "</td><td>" + F.numero(x.componentes.valor, 0) + "</td><td>" + F.numero(x.componentes.utilidad, 0) + "</td><td>" + F.numero(x.componentes.salud, 0) + "</td>" +
        '<td class="' + (x.rendimiento >= 0 ? "sube" : "baja") + '">' + (x.rendimiento >= 0 ? "+" : "") + F.numero(x.rendimiento * 100, 1) + " %</td>" +
        "<td>" + F.dinero(x.utilidadAcumulada) + "</td></tr>";
    }).join("");
    var quebradas = juego.empresas.filter(function (e) { return e.quebrada; });
    return '<div class="tb-centro__cabeza"><span class="etiqueta">Partida terminada · ronda ' + juego.final.ronda + "</span>" +
        '<h1 class="tb-titulo">Ranking <em>final</em></h1></div>' +
      '<ol class="tb-podio">' + podio + "</ol>" +
      '<div class="tabla-scroll"><table class="tabla tabla--tablero tabla--final"><thead><tr><th>#</th><th>Empresa</th><th>Puntaje</th><th>Valor</th><th>Utilidad</th><th>Salud</th><th>Rend.</th><th>Utilidad acum.</th></tr></thead><tbody>' + filas + "</tbody></table></div>" +
      (quebradas.length ? '<p class="tb-nota">Quebradas: ' + quebradas.map(function (e) { return esc(e.nombre) + " (ronda " + e.quiebra.ronda + ")"; }).join(", ") + ".</p>" : "") +
      '<div class="tb-fin__acciones"><button class="boton boton--primario" type="button" id="btn-csv">Exportar ranking (CSV)</button>' +
      '<button class="boton boton--fantasma" type="button" id="btn-json-fin">Exportar partida</button></div>';
  }

  function descargar(nombreArchivo, contenido, tipo) {
    var blob = new Blob([contenido], { type: tipo });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportarPartida() {
    descargar("partida-bmv-ronda" + juego.ronda + ".json", JSON.stringify(juego, null, 1), "application/json");
  }

  function csvRanking() {
    var celda = function (t) { t = String(t); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    var filas = [["Posición", "Empresa", "Mercado", "Divisa", "Puntaje", "Valor", "Utilidad", "Salud", "Rendimiento %", "Utilidad acumulada", "Calificación"]];
    juego.final.ranking.forEach(function (x) {
      filas.push([x.posicion, x.nombre, x.mercado, x.divisa, x.puntaje.toFixed(2), x.componentes.valor.toFixed(1), x.componentes.utilidad.toFixed(1), x.componentes.salud.toFixed(1), (x.rendimiento * 100).toFixed(2), x.utilidadAcumulada.toFixed(2), x.calificacion || ""]);
    });
    return "\uFEFF" + filas.map(function (f) { return f.map(celda).join(","); }).join("\n");
  }

  function activarFinal() {
    $("btn-csv").addEventListener("click", function () { descargar("ranking-bmv.csv", csvRanking(), "text/csv;charset=utf-8"); });
    $("btn-json-fin").addEventListener("click", exportarPartida);
  }

  function abrirDialogo(d) {
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
  }
  document.querySelectorAll(".tb-dialogo").forEach(function (d) {
    d.addEventListener("click", function (e) {
      if (e.target === d || e.target.closest("[data-cerrar]")) d.close();
    });
  });

  var RI = window.Riesgos;
  function giros() {
    var g = [];
    Mo.activas(juego).forEach(function (e) { if (e.tipoEmpresa && g.indexOf(e.tipoEmpresa) === -1) g.push(e.tipoEmpresa); });
    return g.sort();
  }

  function opcionesObjetivo(r) {
    var vivas = Mo.activas(juego);
    if (r.alcance === "giro") {
      var lista = r.id === "giro" ? giros().filter(function (g) { return vivas.some(function (e) { return e.tipoEmpresa === g && e.mercado === "Capitales"; }); }) : giros();
      return lista.map(function (g) { return '<option value="' + esc(g) + '">' + esc(g) + "</option>"; }).join("");
    }
    if (r.alcance === "empresa" || r.alcance === "propio" || r.alcance === "capitales") {
      return vivas.filter(function (e) { return r.alcance !== "capitales" || e.mercado === "Capitales"; })
        .sort(function (a, b) { return a.nombre.localeCompare(b.nombre, "es"); })
        .map(function (e) { return '<option value="' + esc(e.clave) + '">' + esc(e.nombre) + "</option>"; }).join("");
    }
    return null;
  }

  function htmlRiesgos() {
    var pr = juego.parametros.riesgos;
    var filas = RI.RIESGOS.map(function (r) {
      var prob = r.id === "incumplimiento" ? F.numero(pr.incumplimientoMin * 100, 0) + "–" + F.numero(pr.incumplimientoMax * 100, 0) + " %" : F.numero((pr[r.id] || 0) * 100, 0) + " %";
      var ops = opcionesObjetivo(r);
      return '<li class="tb-riesgo" data-riesgo="' + r.id + '">' +
        '<div class="tb-riesgo__info"><span class="tb-riesgo__nombre">' + esc(r.nombre) + '</span><span class="tb-sub">' + esc(r.categoria) + " · " + prob + " al mes</span><span class=\"tb-riesgo__efecto\">" + esc(r.efecto) + "</span></div>" +
        '<div class="tb-riesgo__accion">' + (ops !== null ? '<select class="control control--chico" aria-label="A quién afecta">' + ops + "</select>" : "") +
        '<button class="boton boton--fantasma boton--chico" type="button" data-activar>Activar</button></div></li>';
    }).join("");
    var vig = [];
    Object.keys(juego.efectos.chismes).forEach(function (k) {
      var c = juego.efectos.chismes[k];
      vig.push("<li><span>Chisme sobre " + esc(nombre(k)) + (c.desmentido ? " · desmentido, recupera al cierre" : " · " + c.rondas + (c.rondas === 1 ? " ronda" : " rondas")) + "</span>" +
        (c.desmentido ? "" : '<button class="boton boton--fantasma boton--chico" type="button" data-desmentir="' + esc(k) + '">Desmentir</button>') + "</li>");
    });
    juego.efectos.regulatorios.filter(function (r) { return r.hasta > juego.t; }).forEach(function (r) {
      vig.push("<li><span>Regulación en " + esc(r.giro) + " · costos +" + F.numero(r.factor * 100, 0) + " %, quedan " + (r.hasta - juego.t) + " meses</span></li>");
    });
    juego.empresas.filter(function (e) { return !e.quebrada && (e.estadoTurno === "sancionada" || e.sancion > 0); }).forEach(function (e) {
      vig.push("<li><span>" + esc(e.nombre) + (e.estadoTurno === "sancionada" ? " · sin turno esta ronda" : " · pierde su siguiente turno") + "</span></li>");
    });
    return '<p class="tb-nota">Al cerrar cada mes se sortean al azar (máximo ' + pr.maxPorPeriodo + ' por ronda). Aquí puedes activar cualquiera ahora; los manuales no cuentan para el máximo.</p>' +
      '<h3 class="etiqueta tb-dialogo__sub">Efectos vigentes</h3>' +
      (vig.length ? '<ul class="tb-vigentes">' + vig.join("") + "</ul>" : '<p class="tb-sub">Ninguno.</p>') +
      '<h3 class="etiqueta tb-dialogo__sub">Catálogo</h3><ul class="tb-riesgos">' + filas + "</ul>";
  }

  function pintarRiesgos() {
    var cuerpo = $("riesgos-cuerpo");
    cuerpo.innerHTML = htmlRiesgos();
    cuerpo.querySelectorAll("[data-activar]").forEach(function (b) {
      b.addEventListener("click", function () {
        var li = b.closest("[data-riesgo]");
        var sel = li.querySelector("select");
        var previo = JSON.stringify(juego);
        var r = Mo.activarRiesgo(juego, li.getAttribute("data-riesgo"), sel ? sel.value : null);
        if (!r.ok) { aviso(r.error); return; }
        deshacer.push(previo);
        guardar();
        var nota = juego.bitacora[juego.bitacora.length - 1];
        aviso(nota.texto);
        pintarRiesgos();
        animar = false;
        pintarTodo();
      });
    });
    cuerpo.querySelectorAll("[data-desmentir]").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = Mo.desmentir(juego, b.getAttribute("data-desmentir"));
        if (!r.ok) { aviso(r.error); return; }
        guardar();
        aviso("Chisme desmentido.");
        pintarRiesgos();
        pintarInfo();
      });
    });
  }

  $("btn-riesgos").addEventListener("click", function () {
    pintarRiesgos();
    abrirDialogo($("dlg-riesgos"));
  });

  $("btn-publica").addEventListener("click", function () {
    window.open("publico.html", "simuladorBMV-publico");
  });

  function htmlPartida() {
    var lista = window.Juego.respaldos();
    var filas = lista.map(function (r, i) {
      var hora = "";
      try { hora = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(r.fecha)); } catch (e) { hora = ""; }
      return '<li><span><strong>' + esc(r.etiqueta || ("Ronda " + r.ronda)) + '</strong><span class="tb-sub">' + esc(E.nombreMes(r.mes)) + " · " + hora + "</span></span>" +
        '<button class="boton boton--fantasma boton--chico" type="button" data-restaurar="' + i + '">Restaurar</button></li>';
    }).reverse().join("");
    return '<h3 class="etiqueta tb-dialogo__sub">Respaldos automáticos</h3>' +
      (filas ? '<ul class="tb-vigentes">' + filas + "</ul>" : '<p class="tb-sub">Se crean al cerrar la colocación y cada periodo.</p>') +
      '<h3 class="etiqueta tb-dialogo__sub">Archivo</h3>' +
      '<div class="tb-dialogo__botones"><button class="boton boton--fantasma boton--chico" type="button" id="btn-exportar">Exportar partida</button>' +
      '<button class="boton boton--fantasma boton--chico" type="button" id="btn-importar">Importar partida</button>' +
      '<a class="boton boton--fantasma boton--chico" href="configurar.html">Configuración</a></div>' +
      '<h3 class="etiqueta tb-dialogo__sub">Carteras en línea</h3><div id="carteras-panel">' + htmlCarteras() + "</div>" +
      (juego.fase === "turnos"
        ? '<h3 class="etiqueta tb-dialogo__sub">Fin</h3><p class="tb-nota">Termina la partida y muestra el ranking final en el tablero y en la pantalla pública.</p>' +
          '<button class="boton boton--primario" type="button" id="btn-terminar-partida">Terminar partida</button>'
        : "");
  }

  function pintarPartida() {
    var cuerpo = $("partida-cuerpo");
    cuerpo.innerHTML = htmlPartida();
    cuerpo.querySelectorAll("[data-restaurar]").forEach(function (b) {
      b.addEventListener("click", function () {
        confirmar(b, "Confirmar", function () {
          var j = window.Juego.restaurar(Number(b.getAttribute("data-restaurar")));
          if (!j) { aviso("No se encontró ese respaldo."); return; }
          juego = Mo.normalizar(j);
          deshacer = [];
          guardar();
          $("dlg-partida").close();
          aviso("Se restauró el respaldo de la ronda " + juego.ronda + ".");
          animar = true;
          pintarTodo();
        });
      });
    });
    activarCarteras();
    $("btn-exportar").addEventListener("click", exportarPartida);
    $("btn-importar").addEventListener("click", function () { $("importar").click(); });
    var term = $("btn-terminar-partida");
    if (term) term.addEventListener("click", function () {
      confirmar(term, "¿Terminar la partida? Confirmar", function () {
        var r = Mo.terminarPartida(juego);
        if (!r.ok) { aviso(r.error); return; }
        deshacer = [];
        guardar();
        window.Juego.respaldar(juego, "Partida terminada");
        $("dlg-partida").close();
        aviso("Partida terminada. Primer lugar: " + (r.final.ranking[0] ? r.final.ranking[0].nombre : "—") + ".");
        pintarTodo();
      });
    });
  }

  $("importar").addEventListener("change", function () {
    var archivo = $("importar").files[0];
    $("importar").value = "";
    if (!archivo) return;
    var lector = new FileReader();
    lector.onload = function () {
      var obj;
      try { obj = JSON.parse(lector.result); } catch (e) { aviso("El archivo no es un JSON válido."); return; }
      var error = Mo.validarPartida(obj);
      if (error) { aviso(error); return; }
      juego = Mo.normalizar(obj);
      deshacer = [];
      guardar();
      window.Juego.respaldar(juego, "Partida importada");
      $("dlg-partida").close();
      aviso("Partida importada: ronda " + juego.ronda + ".");
      pintarTodo();
    };
    lector.readAsText(archivo);
  });

  $("btn-partida").addEventListener("click", function () {
    pintarPartida();
    abrirDialogo($("dlg-partida"));
  });

  var FASES = { "apagado": "Sin conectar", "sin-sesion": "Sin conectar", "publicando": "Publicando…", "en-vivo": "En vivo", "sin-conexion": "Sin conexión: se reintentará", "error": "No se publicó" };

  function htmlCarteras() {
    var st = P.estado();
    var retiradas = juego.publicacion && juego.publicacion.activa === false;
    var hora = "";
    if (st.hora) try { hora = " · " + new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(st.hora)); } catch (e) { hora = ""; }
    var error = '<p class="campo__error" id="carteras-error" role="alert">' + esc(st.error || "") + "</p>";
    var codigos = '<button class="boton boton--fantasma boton--chico" type="button" id="btn-codigos">Mostrar códigos</button>';
    if (!st.correo) {
      return '<p class="tb-nota">Cada equipo ve su cartera en <strong>' + esc(P.URL_CARTERA.replace(/^https:\/\//, "")) + "</strong> con su código. Conéctate con la cuenta de operador para publicar.</p>" +
        '<form class="tb-carteras-form" id="carteras-form" novalidate>' +
        '<label class="campo"><span class="campo__label">Correo</span><input class="control control--chico" id="cr-correo" type="email" autocomplete="username" required></label>' +
        '<label class="campo"><span class="campo__label">Contraseña</span><input class="control control--chico" id="cr-clave" type="password" autocomplete="current-password" required></label>' +
        error +
        '<div class="tb-dialogo__botones"><button class="boton boton--primario boton--chico" type="submit" id="btn-conectar">Conectar</button>' + codigos + "</div></form>";
    }
    return '<p class="tb-carteras-estado fase-' + st.fase + '"><span class="tb-punto"></span><span><strong>' + (retiradas ? "Carteras retiradas" : FASES[st.fase] + hora) + "</strong>" +
      '<span class="tb-sub">' + esc(st.correo) + "</span></span></p>" + error +
      '<div class="tb-dialogo__botones">' + codigos +
      (retiradas ? '<button class="boton boton--fantasma boton--chico" type="button" id="btn-republicar">Volver a publicar</button>'
                 : '<button class="boton boton--fantasma boton--chico" type="button" id="btn-retirar">Retirar carteras</button>') +
      '<button class="boton boton--fantasma boton--chico" type="button" id="btn-desconectar">Desconectar</button></div>';
  }

  function activarCarteras() {
    var form = $("carteras-form");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      var correo = $("cr-correo").value.trim(), clave = $("cr-clave").value;
      if (!correo || !clave) { $("carteras-error").textContent = "Escribe el correo y la contraseña del operador."; return; }
      var b = $("btn-conectar");
      b.disabled = true;
      b.textContent = "Conectando…";
      P.conectar(correo, clave).then(function () { P.ahora(juego); aviso("Carteras conectadas."); }, function () { b.disabled = false; b.textContent = "Conectar"; });
    });
    $("btn-codigos").addEventListener("click", function () { codigoActual = 0; pintarCodigo(); abrirDialogo($("dlg-codigos")); });
    var ret = $("btn-retirar");
    if (ret) ret.addEventListener("click", function () {
      confirmar(ret, "¿Retirar todas? Confirmar", function () {
        juego.publicacion.activa = false;
        guardar();
        P.ahora(juego);
        aviso("Carteras retiradas: los códigos ya no muestran nada.");
        repintarCarteras();
      });
    });
    var rep = $("btn-republicar");
    if (rep) rep.addEventListener("click", function () {
      juego.publicacion.activa = true;
      guardar();
      P.ahora(juego);
      repintarCarteras();
    });
    var des = $("btn-desconectar");
    if (des) des.addEventListener("click", function () { P.desconectar(); });
  }

  function repintarCarteras() {
    var panel = $("carteras-panel");
    if (!panel || panel.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return;
    panel.innerHTML = htmlCarteras();
    activarCarteras();
  }

  P.alCambiar(function (st) {
    var punto = $("tb-carteras");
    punto.hidden = !st.correo;
    punto.className = "tb-punto fase-" + st.fase;
    $("btn-partida").setAttribute("aria-label", st.correo ? "Partida (carteras: " + (FASES[st.fase] || "") + ")" : "Partida");
    if ($("dlg-partida").open) repintarCarteras();
  });

  var codigoActual = 0;
  function pintarCodigo() {
    var orden = juego.ordenBase;
    codigoActual = (codigoActual + orden.length) % orden.length;
    var k = orden[codigoActual];
    $("codigos-cuenta").textContent = "Equipo " + (codigoActual + 1) + " de " + orden.length;
    var dir = P.URL_CARTERA.replace(/^https:\/\//, "");
    $("codigos-cuerpo").innerHTML =
      '<p class="tb-codigos__empresa">' + esc(nombre(k)) + "</p>" +
      '<p class="tb-codigos__codigo" aria-label="Código ' + esc(juego.codigos[k].split("").join(" ")) + '">' + esc(juego.codigos[k].slice(0, 4)) + "<span>" + esc(juego.codigos[k].slice(4)) + "</span></p>" +
      '<p class="tb-nota">Entra a <strong>' + esc(dir) + "</strong> y escribe el código. Guárdalo: sirve toda la partida.</p>" +
      '<div class="tb-codigos__nav"><button class="boton boton--fantasma boton--chico" type="button" data-paso="-1" aria-label="Equipo anterior">←</button>' +
      '<button class="boton boton--fantasma boton--chico" type="button" data-paso="1" aria-label="Equipo siguiente">→</button></div>';
    $("codigos-cuerpo").querySelectorAll("[data-paso]").forEach(function (b) {
      b.addEventListener("click", function () { codigoActual += Number(b.getAttribute("data-paso")); pintarCodigo(); });
    });
  }
  $("dlg-codigos").addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    codigoActual += e.key === "ArrowRight" ? 1 : -1;
    pintarCodigo();
    var b = $("codigos-cuerpo").querySelector('[data-paso="' + (e.key === "ArrowRight" ? 1 : -1) + '"]');
    if (b) b.focus();
  });

  P.iniciar();
  P.programar(juego);

  function pintarTodo() {
    pintarBarra();
    pintarOrden();
    pintarCentro();
    pintarInfo();
  }

  pintarTodo();
})();
