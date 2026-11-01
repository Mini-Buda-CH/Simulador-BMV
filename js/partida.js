window.Partida = (function () {
  "use strict";

  var CLAVE = "simuladorBMV.partida";

  function leer() {
    try {
      var p = JSON.parse(localStorage.getItem(CLAVE) || "null");
      return p && typeof p === "object" ? p : null;
    } catch (e) {
      return null;
    }
  }

  function guardar(parametros) {
    try {
      localStorage.setItem(CLAVE, JSON.stringify({ parametros: parametros, guardada: new Date().toISOString() }));
      return true;
    } catch (e) {
      return false;
    }
  }

  return { CLAVE: CLAVE, leer: leer, guardar: guardar };
})();
