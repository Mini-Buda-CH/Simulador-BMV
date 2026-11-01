window.Formato = (function () {
  "use strict";

  var nf2 = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function dinero(n, divisa) {
    if (n === null || n === undefined || !isFinite(n)) return "—";
    var texto = (n < 0 ? "-$" : "$") + nf2.format(Math.abs(n));
    return divisa ? texto + " " + divisa : texto;
  }

  function numero(n, decimales) {
    if (n === null || n === undefined || !isFinite(n)) return "—";
    var d = decimales === undefined ? 2 : decimales;
    return new Intl.NumberFormat("es-MX", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  }

  function porcentaje(n) {
    return n === null || n === undefined || !isFinite(n) ? "—" : numero(n * 100, 2) + " %";
  }

  function escapar(texto) {
    return String(texto).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function limpiarDecimal(valor, negativos) {
    var signo = negativos && valor.trim().charAt(0) === "-" ? "-" : "";
    var s = valor.replace(/[^\d.]/g, "");
    var punto = s.indexOf(".");
    if (punto !== -1) s = s.slice(0, punto + 1) + s.slice(punto + 1).replace(/\./g, "").slice(0, 4);
    return signo + s;
  }

  function limpiarEntero(valor) { return valor.replace(/\D/g, ""); }

  function campo(spec) {
    var id = escapar(spec.id);
    var describe = ' aria-describedby="' + (spec.ayuda ? id + "-ayuda " : "") + id + '-error"';
    var html = '<div class="campo" data-campo="' + id + '">' +
      '<label class="campo__label" for="' + id + '">' + escapar(spec.label) + "</label>";
    if (spec.tipo === "select") {
      html += '<select class="control" id="' + id + '" name="' + id + '"' + describe + ">";
      spec.opciones.forEach(function (op) {
        var sel = String(op.valor) === String(spec.valor) ? " selected" : "";
        html += '<option value="' + escapar(op.valor) + '"' + sel + ">" + escapar(op.nombre) + "</option>";
      });
      html += "</select>";
    } else {
      var sufijo = spec.tipo === "porcentaje" ? "%" : "";
      var valor = spec.valor === undefined || spec.valor === null ? "" : spec.valor;
      html += '<div class="afijos' + (sufijo ? " afijos--suf" : "") + '">' +
        '<input class="control" id="' + id + '" name="' + id + '"' + describe + ' type="text" inputmode="' + (spec.tipo === "entero" ? "numeric" : "decimal") +
        '" autocomplete="off" data-tipo="' + spec.tipo + '" value="' + escapar(valor) + '">' +
        (sufijo ? '<span class="afijos__suf" aria-hidden="true">' + sufijo + "</span>" : "") +
        "</div>";
    }
    if (spec.ayuda) html += '<span class="campo__ayuda" id="' + id + '-ayuda">' + escapar(spec.ayuda) + "</span>";
    html += '<span class="campo__error" id="' + id + '-error" aria-live="polite"></span></div>';
    return html;
  }

  function activar(form) {
    form.querySelectorAll("input[data-tipo]").forEach(function (input) {
      input.addEventListener("input", function () {
        var antes = input.value;
        var limpio = input.dataset.tipo === "entero" ? limpiarEntero(antes) : limpiarDecimal(antes, false);
        if (limpio !== antes) input.value = limpio;
        limpiarError(form, input.id);
      });
    });
    form.querySelectorAll("select").forEach(function (s) {
      s.addEventListener("change", function () { limpiarError(form, s.id); });
    });
  }

  function mostrarError(form, id, mensaje) {
    var c = form.querySelector('[data-campo="' + id + '"]');
    if (c) c.classList.add("invalido");
    var control = form.querySelector("#" + id);
    if (control) control.setAttribute("aria-invalid", "true");
    var e = form.querySelector("#" + id + "-error");
    if (e) e.textContent = mensaje;
  }

  function limpiarError(form, id) {
    var c = form.querySelector('[data-campo="' + id + '"]');
    if (c) c.classList.remove("invalido");
    var control = form.querySelector("#" + id);
    if (control) control.removeAttribute("aria-invalid");
    var e = form.querySelector("#" + id + "-error");
    if (e) e.textContent = "";
  }

  return {
    dinero: dinero, numero: numero, porcentaje: porcentaje, escapar: escapar,
    campo: campo, activar: activar, mostrarError: mostrarError, limpiarError: limpiarError
  };
})();
