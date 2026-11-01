window.RegistroBMV = (function () {
  "use strict";

  var CLAVE = "simuladorBMV.empresas";

  function leer() {
    try {
      var lista = JSON.parse(localStorage.getItem(CLAVE) || "[]");
      return Array.isArray(lista) ? lista.filter(function (r) { return r && r.clave && r.datos; }) : [];
    } catch (e) {
      return [];
    }
  }

  function guardar(lista) {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(lista));
      return true;
    } catch (e) {
      return false;
    }
  }

  function vaciar() {
    try { localStorage.removeItem(CLAVE); } catch (e) { /* sin almacenamiento */ }
  }

  return { CLAVE: CLAVE, leer: leer, guardar: guardar, vaciar: vaciar };
})();
