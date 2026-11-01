(function () {
  "use strict";

  var I = window.Importar;
  var F = window.Formato;
  var R = window.RegistroBMV;

  var $ = function (id) { return document.getElementById(id); };
  var soltar = $("soltar");
  var archivos = $("archivos");
  var colaEl = $("cola");
  var vista = $("vista");
  var pie = $("carga-pie");
  var btnAgregar = $("btn-agregar");
  var btnDescartar = $("btn-descartar");
  var btnTodas = $("btn-todas");
  var listaEl = $("empresas");
  var vacio = $("vacio");
  var btnVaciar = $("btn-vaciar");
  var btnConfigurar = $("btn-configurar");
  var avisoEl = $("aviso");

  var lista = R.leer();
  var cola = [];
  var indice = 0;
  var nuevas = {};

  var logo = $("logo-img");
  function sinLogo() { logo.hidden = true; $("logo-texto").hidden = false; }
  logo.addEventListener("error", sinLogo);
  if (logo.complete && !logo.naturalWidth) sinLogo();

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

  function leerArchivo(archivo) {
    return new Promise(function (resolver) {
      var lector = new FileReader();
      lector.onload = function () { resolver({ archivo: archivo.name, texto: lector.result }); };
      lector.onerror = function () { resolver({ archivo: archivo.name, texto: null }); };
      lector.readAsText(archivo);
    });
  }

  function encolar(listaArchivos) {
    var arr = Array.prototype.slice.call(listaArchivos || []);
    if (!arr.length) return;
    Promise.all(arr.map(leerArchivo)).then(function (leidos) {
      var primero = cola.length;
      leidos.forEach(function (l) {
        var item = { archivo: l.archivo, error: null, validacion: null };
        if (l.texto === null) item.error = "No se pudo leer el archivo.";
        else {
          var lectura = I.leerTexto(l.texto);
          if (!lectura.ok) item.error = lectura.error;
          else item.validacion = I.validarEmpresa(lectura.objeto);
        }
        cola.push(item);
      });
      indice = primero;
      pintarCola(true);
    });
  }

  function estadoDe(item) {
    if (item.error || !item.validacion.ok) return "invalido";
    if (I.buscar(lista, item.validacion.clave) !== -1) return "duplicado";
    return lista.length >= I.MAX_EMPRESAS ? "llena" : "valido";
  }

  var SELLOS = {
    valido: { texto: "Lista para agregar", clase: "sello--ok" },
    duplicado: { texto: "Ya está cargada", clase: "sello--aviso" },
    invalido: { texto: "Con errores", clase: "sello--error" },
    llena: { texto: "Partida completa", clase: "sello--aviso" }
  };

  function fila(nombre, valor) {
    return '<div class="dato"><dt>' + F.escapar(nombre) + "</dt><dd>" + F.escapar(valor) + "</dd></div>";
  }

  function grupo(titulo, filas) {
    return '<section class="vista__grupo"><h3 class="etiqueta">' + titulo + '</h3><dl class="datos">' + filas.join("") + "</dl></section>";
  }

  function htmlVista(item, estado) {
    var sello = SELLOS[estado];
    var datos = item.validacion ? item.validacion.datos : null;
    var r = datos ? I.resumenEmpresa(datos) : null;
    var html = '<div class="vista__cabeza"><span class="sello ' + sello.clase + '">' + sello.texto + "</span>";

    if (!r) {
      html += '<p class="vista__nombre">' + F.escapar(item.archivo) + "</p></div>" +
        '<ul class="errores"><li>' + F.escapar(item.error || "Archivo no reconocido.") + "</li></ul>";
      return html;
    }

    html += '<p class="vista__nombre">' + F.escapar(r.nombre) + "</p>" +
      '<p class="vista__meta">' + [r.mercado, r.divisa, r.tipoEmpresa].filter(Boolean).map(F.escapar).join(" · ") + "</p></div>";

    if (estado === "duplicado") {
      var previa = lista[I.buscar(lista, item.validacion.clave)];
      html += '<p class="nota nota--aviso">Esta empresa ya está en el simulador' +
        (previa && previa.archivo ? " (cargada desde " + F.escapar(previa.archivo) + ")" : "") +
        ". Puedes reemplazarla con este archivo; conserva su lugar en la lista.</p>";
    }
    if (estado === "llena") {
      html += '<p class="nota nota--aviso">La partida ya tiene ' + I.MAX_EMPRESAS + " empresas. Elimina una de la lista para agregar esta.</p>";
    }
    if (item.validacion.errores.length) {
      html += '<ul class="errores">' + item.validacion.errores.map(function (e) { return "<li>" + F.escapar(e) + "</li>"; }).join("") + "</ul>";
    }
    if (item.validacion.avisos.length) {
      html += '<ul class="avisos">' + item.validacion.avisos.map(function (e) { return "<li>" + F.escapar(e) + "</li>"; }).join("") + "</ul>";
    }
    if (estado === "invalido") return html;

    var d = r.divisa, o = r.otraDivisa, e = r.emision;
    html += grupo("Empresa", [
      fila("Carrera", r.carrera || "—"),
      fila("Tipo de empresa", r.tipoEmpresa || "—"),
      fila("Objetivo de la emisión", r.objetivo || "—")
    ]);
    html += grupo(e.tipo === "bonos" ? "Emisión de bonos" : "Emisión de acciones", e.tipo === "bonos" ? [
      fila("Monto", F.dinero(e.monto, d)),
      fila("Plazo", F.numero(e.plazoAnios, 0) + (e.plazoAnios === 1 ? " año" : " años")),
      fila("Cupón", F.porcentaje(e.cupon) + (e.periodicidad ? " · " + e.periodicidad : "")),
      fila("Precio de emisión", F.porcentaje(e.precio))
    ] : [
      fila("Monto", F.dinero(e.monto, d)),
      fila("Acciones", F.numero(e.acciones, 0)),
      fila("Valor por acción", F.dinero(e.valorPorAccion, d)),
      fila("Precio de emisión", F.porcentaje(e.precio))
    ]);
    html += grupo("Operación", [
      fila("Ventas del año 1", F.dinero(r.ventas, d)),
      fila("Crecimiento anual", F.porcentaje(r.crecimiento)),
      fila("Utilidad neta", F.dinero(r.utilidadNeta, d)),
      fila("Capital contable", F.dinero(r.capital, d))
    ]);
    html += grupo("Caja y financiamiento", [
      fila("Caja en " + d, F.dinero(r.caja, d)),
      fila("Caja en " + o, F.dinero(r.cajaOtra, o)),
      fila("Deuda bancaria", r.deuda.monto > 0
        ? F.dinero(r.deuda.monto, d) + " · " + F.porcentaje(r.deuda.tasaAnual) + " · " + F.numero(r.deuda.plazoMeses, 0) + " meses"
        : "Sin deuda"),
      fila("Dividendos", r.dividendos
        ? F.porcentaje(r.dividendos.porcentaje) + " de la utilidad · " + (r.dividendos.periodicidad || "—")
        : (r.mercado === "Deuda" ? "No aplica (Deuda)" : "—"))
    ]);
    return html;
  }

  function pintarCola(animar) {
    soltar.classList.toggle("soltar--compacta", cola.length > 0);
    colaEl.hidden = cola.length === 0;
    pie.hidden = cola.length === 0;
    if (!cola.length) return;
    if (indice >= cola.length) indice = cola.length - 1;

    var item = cola[indice];
    var estado = estadoDe(item);
    $("cola-pos").textContent = "Archivo " + (indice + 1) + " de " + cola.length;
    $("cola-archivo").textContent = item.archivo;
    $("cola-ant").disabled = indice === 0;
    $("cola-sig").disabled = indice === cola.length - 1;
    colaEl.classList.toggle("cola--uno", cola.length === 1);

    vista.innerHTML = htmlVista(item, estado);
    vista.classList.remove("entrando");
    if (animar) { void vista.offsetWidth; vista.classList.add("entrando"); }
    $("carga-cuerpo").scrollTop = 0;

    var sinAgregar = estado === "invalido" || estado === "llena";
    btnAgregar.hidden = sinAgregar;
    btnAgregar.textContent = estado === "duplicado" ? "Reemplazar" : "Agregar al simulador";
    pie.classList.toggle("tarjeta__pie--solo", sinAgregar);

    var validas = cola.filter(function (c) { return estadoDe(c) === "valido"; }).length;
    btnTodas.hidden = !(cola.length > 1 && validas > 0);
    btnTodas.textContent = "Agregar todas las válidas (" + validas + ")";
  }

  function quitarDeCola(i) {
    cola.splice(i, 1);
    if (indice > i || indice >= cola.length) indice = Math.max(0, indice - 1);
    if (!cola.length) indice = 0;
    pintarCola(true);
  }

  function registrar(item) {
    var v = item.validacion;
    var res = I.agregarALista(lista, { clave: v.clave, cargado: new Date().toISOString(), archivo: item.archivo, datos: v.datos });
    if (res.accion === "llena") return res.accion;
    lista = res.lista;
    nuevas[v.clave] = true;
    return res.accion;
  }

  function guardarLista() {
    if (!R.guardar(lista)) aviso("No se pudo guardar en este navegador.");
  }

  btnAgregar.addEventListener("click", function () {
    var item = cola[indice];
    var estado = item && estadoDe(item);
    if (!item || estado === "invalido" || estado === "llena") return;
    var nombre = I.resumenEmpresa(item.validacion.datos).nombre;
    var accion = registrar(item);
    if (accion === "llena") { aviso("La partida ya tiene el máximo de " + I.MAX_EMPRESAS + " empresas."); return; }
    guardarLista();
    aviso(nombre + (accion === "reemplazada" ? " se reemplazó." : " se agregó al simulador."));
    pintarLista();
    quitarDeCola(indice);
  });

  btnDescartar.addEventListener("click", function () {
    if (cola.length) quitarDeCola(indice);
  });

  btnTodas.addEventListener("click", function () {
    var agregadas = 0, llena = false;
    cola = cola.filter(function (item) {
      if (llena || estadoDe(item) !== "valido") return true;
      if (registrar(item) === "llena") { llena = true; return true; }
      agregadas++;
      return false;
    });
    guardarLista();
    indice = 0;
    aviso(agregadas + (agregadas === 1 ? " empresa agregada." : " empresas agregadas.") + (llena ? " Se alcanzó el máximo de " + I.MAX_EMPRESAS + "." : ""));
    pintarLista();
    pintarCola(true);
  });

  $("cola-ant").addEventListener("click", function () { if (indice > 0) { indice--; pintarCola(false); } });
  $("cola-sig").addEventListener("click", function () { if (indice < cola.length - 1) { indice++; pintarCola(false); } });

  archivos.addEventListener("change", function () {
    encolar(archivos.files);
    archivos.value = "";
  });

  var profundidad = 0;
  soltar.addEventListener("dragenter", function (e) { e.preventDefault(); profundidad++; soltar.classList.add("soltar--encima"); });
  soltar.addEventListener("dragleave", function () { if (--profundidad <= 0) { profundidad = 0; soltar.classList.remove("soltar--encima"); } });
  soltar.addEventListener("dragover", function (e) { e.preventDefault(); });
  soltar.addEventListener("drop", function (e) {
    e.preventDefault();
    profundidad = 0;
    soltar.classList.remove("soltar--encima");
    encolar(e.dataTransfer.files);
  });
  window.addEventListener("dragover", function (e) { e.preventDefault(); });
  window.addEventListener("drop", function (e) { e.preventDefault(); });

  function htmlFila(reg, n) {
    var r = I.resumenEmpresa(reg.datos);
    var k = F.escapar(reg.clave);
    return '<li class="empresa' + (nuevas[reg.clave] ? " entrando" : "") + '" data-clave="' + k + '">' +
      '<span class="empresa__num">' + String(n).padStart(2, "0") + "</span>" +
      '<div class="empresa__info">' +
        '<p class="empresa__nombre">' + F.escapar(r.nombre) + "</p>" +
        '<p class="empresa__meta"><span class="marca-mercado marca-mercado--' + (r.mercado === "Deuda" ? "deuda" : "capitales") + '">' + F.escapar(r.mercado || "—") + "</span>" +
          F.escapar(r.divisa || "—") + (r.tipoEmpresa ? " · " + F.escapar(r.tipoEmpresa) : "") + "</p>" +
      "</div>" +
      '<div class="empresa__acciones">' +
        '<button class="icono-boton icono-boton--borrar" type="button" data-accion="pedir" aria-label="Eliminar ' + F.escapar(r.nombre) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>' +
        "</button>" +
        '<div class="confirmar" role="group" aria-label="Confirmar eliminación">' +
          '<span class="confirmar__texto">¿Eliminar?</span>' +
          '<button class="mini-boton mini-boton--peligro" type="button" data-accion="si">Sí</button>' +
          '<button class="mini-boton" type="button" data-accion="no">No</button>' +
        "</div>" +
      "</div>" +
    "</li>";
  }

  function pintarLista() {
    var c = I.conteos(lista);
    listaEl.innerHTML = lista.map(function (reg, i) { return htmlFila(reg, i + 1); }).join("");
    nuevas = {};
    vacio.hidden = lista.length > 0;
    $("contador").textContent = c.total;
    $("ind-total").textContent = c.total + " / " + I.MAX_EMPRESAS;
    $("ind-mercado").textContent = c.Capitales + " · " + c.Deuda;
    $("ind-divisa").textContent = c.MXN + " · " + c.USD;
    btnVaciar.disabled = lista.length === 0;
    restaurarVaciar();
    var listo = lista.length >= I.MIN_EMPRESAS;
    btnConfigurar.setAttribute("aria-disabled", listo ? "false" : "true");
    btnConfigurar.title = listo ? "" : "Se necesitan al menos " + I.MIN_EMPRESAS + " empresas";
    if (cola.length) pintarCola(false);
  }

  btnConfigurar.addEventListener("click", function (e) {
    if (btnConfigurar.getAttribute("aria-disabled") === "true") {
      e.preventDefault();
      aviso("Carga al menos " + I.MIN_EMPRESAS + " empresas para configurar la partida.");
    }
  });

  function cerrarConfirmaciones(excepto) {
    Array.prototype.forEach.call(listaEl.querySelectorAll(".empresa.confirmando"), function (li) {
      if (li !== excepto) li.classList.remove("confirmando");
    });
  }

  listaEl.addEventListener("click", function (e) {
    var boton = e.target.closest("button[data-accion]");
    if (!boton) return;
    var li = boton.closest(".empresa");
    var accion = boton.getAttribute("data-accion");
    if (accion === "pedir") {
      cerrarConfirmaciones(li);
      li.classList.add("confirmando");
      li.querySelector('[data-accion="no"]').focus();
    } else if (accion === "no") {
      li.classList.remove("confirmando");
      li.querySelector('[data-accion="pedir"]').focus();
    } else if (accion === "si") {
      var k = li.getAttribute("data-clave");
      var nombre = li.querySelector(".empresa__nombre").textContent;
      lista = I.quitarDeLista(lista, k);
      guardarLista();
      li.classList.add("saliendo");
      var listo = false;
      var terminar = function () {
        if (listo) return;
        listo = true;
        pintarLista();
        aviso(nombre + " se eliminó.");
      };
      li.addEventListener("transitionend", terminar);
      setTimeout(terminar, 260);
    }
  });

  listaEl.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var li = e.target.closest(".empresa.confirmando");
    if (li) { li.classList.remove("confirmando"); li.querySelector('[data-accion="pedir"]').focus(); }
  });

  var vaciarTimer = null;
  function restaurarVaciar() {
    clearTimeout(vaciarTimer);
    btnVaciar.classList.remove("boton--peligro");
    btnVaciar.textContent = "Vaciar lista";
    delete btnVaciar.dataset.confirmar;
  }

  btnVaciar.addEventListener("click", function () {
    if (!btnVaciar.dataset.confirmar) {
      btnVaciar.dataset.confirmar = "1";
      btnVaciar.classList.add("boton--peligro");
      btnVaciar.textContent = "¿Vaciar " + lista.length + "? Confirmar";
      vaciarTimer = setTimeout(restaurarVaciar, 4000);
      return;
    }
    lista = [];
    R.vaciar();
    pintarLista();
    aviso("Se vació la lista de empresas.");
  });

  pintarLista();
})();
