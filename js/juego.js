window.Juego = (function () {
  "use strict";

  var CLAVE = "simuladorBMV.juego";
  var CLAVE_RESPALDOS = "simuladorBMV.respaldos";
  var MAX_RESPALDOS = 6;
  var canal = null;
  try { canal = "BroadcastChannel" in window ? new BroadcastChannel("simuladorBMV") : null; } catch (e) { canal = null; }

  function leer() {
    try {
      var j = JSON.parse(localStorage.getItem(CLAVE) || "null");
      return j && j.formato === "simulador-bmv/juego" ? j : null;
    } catch (e) {
      return null;
    }
  }

  function avisar() {
    if (canal) try { canal.postMessage({ tipo: "juego", hora: Date.now() }); } catch (e) { /* sin canal */ }
  }

  function guardar(juego) {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(juego));
      avisar();
      return true;
    } catch (e) {
      return false;
    }
  }

  function borrar() {
    try { localStorage.removeItem(CLAVE); } catch (e) { /* sin almacenamiento */ }
    avisar();
  }

  function respaldos() {
    try {
      var r = JSON.parse(localStorage.getItem(CLAVE_RESPALDOS) || "[]");
      return Array.isArray(r) ? r : [];
    } catch (e) {
      return [];
    }
  }

  function respaldar(juego, etiqueta) {
    var lista = respaldos();
    lista.push({ ronda: juego.ronda, fase: juego.fase, mes: juego.entorno[juego.t].mes, fecha: new Date().toISOString(), etiqueta: etiqueta || "", juego: juego });
    while (lista.length > MAX_RESPALDOS) lista.shift();
    while (lista.length) {
      try {
        localStorage.setItem(CLAVE_RESPALDOS, JSON.stringify(lista));
        return true;
      } catch (e) {
        lista.shift();
      }
    }
    return false;
  }

  function restaurar(indice) {
    var r = respaldos()[indice];
    return r ? JSON.parse(JSON.stringify(r.juego)) : null;
  }

  function borrarRespaldos() {
    try { localStorage.removeItem(CLAVE_RESPALDOS); } catch (e) { /* sin almacenamiento */ }
  }

  function escuchar(fn) {
    if (canal) canal.addEventListener("message", fn);
    window.addEventListener("storage", function (e) { if (e.key === CLAVE) fn(e); });
  }

  return {
    CLAVE: CLAVE, leer: leer, guardar: guardar, borrar: borrar,
    respaldos: respaldos, respaldar: respaldar, restaurar: restaurar, borrarRespaldos: borrarRespaldos,
    escuchar: escuchar
  };
})();
