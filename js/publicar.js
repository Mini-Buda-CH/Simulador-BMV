(function (raiz) {
  "use strict";

  var ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  var LARGO = 8;
  var URL_CARTERA = "https://mini-buda-ch.github.io/Cartera/";

  function generarCodigo(usados, azar) {
    azar = azar || function (n) {
      var a = new Uint32Array(n);
      (raiz.crypto || require("crypto").webcrypto).getRandomValues(a);
      return a;
    };
    for (;;) {
      var nums = azar(LARGO), c = "";
      for (var i = 0; i < LARGO; i++) c += ALFABETO[nums[i] % ALFABETO.length];
      if (!usados || usados.indexOf(c) < 0) return c;
    }
  }

  function esCodigo(t) { return typeof t === "string" && /^[A-HJ-NP-Z2-9]{8}$/.test(t); }

  function asegurarCodigos(juego) {
    var cambio = !juego.codigos || !juego.publicacion;
    if (!juego.codigos) juego.codigos = {};
    if (!juego.publicacion) juego.publicacion = { activa: true };
    juego.empresas.forEach(function (e) {
      if (esCodigo(juego.codigos[e.clave])) return;
      juego.codigos[e.clave] = generarCodigo(Object.keys(juego.codigos).map(function (k) { return juego.codigos[k]; }));
      cambio = true;
    });
    return cambio;
  }

  function limpiar(obj) {
    return JSON.parse(JSON.stringify(obj, function (k, v) { return typeof v === "number" && !isFinite(v) ? null : v; }));
  }

  function documento(juego, clave, Motor) {
    var c = Motor.carteraDe(juego, clave);
    if (!c) return null;
    var nombre = function (k) { var e = k && Motor.empresa(juego, k); return e ? e.nombre : null; };
    c.movimientos = c.movimientos.map(function (m) {
      var x = {};
      Object.keys(m).forEach(function (k) { x[k] = m[k]; });
      x.emisoraNombre = nombre(m.emisora);
      x.contraparteNombre = nombre(m.contraparte);
      return x;
    });
    return limpiar({
      version: 1,
      actualizado: new Date().toISOString(),
      periodo: juego.parametros.partida.periodo,
      cartera: c
    });
  }

  function cambios(juego, Motor, anteriores) {
    var u = {}, vigentes = [];
    var activa = !juego.publicacion || juego.publicacion.activa !== false;
    juego.empresas.forEach(function (e) {
      var cod = juego.codigos && juego.codigos[e.clave];
      if (!esCodigo(cod)) return;
      vigentes.push(cod);
      u["carteras/" + cod] = activa ? documento(juego, e.clave, Motor) : null;
    });
    (anteriores || []).forEach(function (cod) { if (vigentes.indexOf(cod) < 0 && esCodigo(cod)) u["carteras/" + cod] = null; });
    return u;
  }

  var api = { generarCodigo: generarCodigo, esCodigo: esCodigo, asegurarCodigos: asegurarCodigos, limpiar: limpiar, documento: documento, cambios: cambios, URL_CARTERA: URL_CARTERA };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  var CLAVE_PUBLICADOS = "simuladorBMV.codigosPublicados";
  var CLAVE_USO = "simuladorBMV.carteras";
  var SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
  var ESPERA = 1500;
  var LOCAL = /[?&]fuente=local\b/.test(location.search);

  var fb = null, cargando = null;
  var estado = { fase: "apagado", correo: "", hora: 0, error: "" };
  var oyentes = [];
  var pendiente = null, timer = null;

  function leerLS(k, def) { try { var v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } }
  function escribirLS(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
  function publicados() { try { var l = JSON.parse(leerLS(CLAVE_PUBLICADOS, "[]")); return Array.isArray(l) ? l : []; } catch (e) { return []; } }

  function fijar(cambio) {
    Object.keys(cambio).forEach(function (k) { estado[k] = cambio[k]; });
    oyentes.forEach(function (f) { f(estado); });
  }

  function fuenteLocal() {
    var canal = null;
    try { canal = new BroadcastChannel("cartera-local"); } catch (e) { canal = null; }
    return {
      local: true,
      conectar: function (correo) { return Promise.resolve(correo || "local"); },
      salir: function () { return Promise.resolve(); },
      escribir: function (u) {
        Object.keys(u).forEach(function (ruta) {
          var k = "carteraLocal." + ruta.split("/")[1];
          if (u[ruta] === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(u[ruta]));
        });
        if (canal) canal.postMessage({ cambios: u });
        return Promise.resolve();
      }
    };
  }

  function cargar() {
    if (cargando) return cargando;
    if (LOCAL) {
      fb = fuenteLocal();
      cargando = Promise.resolve(fb);
      return cargando;
    }
    cargando = Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js"), import(SDK + "firebase-database.js")]).then(function (m) {
      var app = m[0].initializeApp(raiz.FIREBASE_CONFIG);
      var auth = m[1].getAuth(app), db = m[2].getDatabase(app);
      fb = {
        conectar: function (correo, clave) { return m[1].signInWithEmailAndPassword(auth, correo, clave).then(function (r) { return r.user.email; }); },
        salir: function () { return m[1].signOut(auth); },
        escribir: function (u) { return m[2].update(m[2].ref(db), u); }
      };
      m[1].onAuthStateChanged(auth, function (u) {
        if (u) { if (!estado.correo) fijar({ fase: "en-vivo", correo: u.email }); enviar(); }
        else fijar({ fase: "sin-sesion", correo: "" });
      });
      m[2].onValue(m[2].ref(db, ".info/connected"), function (s) {
        if (!auth.currentUser) return;
        if (!s.val()) fijar({ fase: "sin-conexion" });
        else if (estado.fase === "sin-conexion") { fijar({ fase: "en-vivo" }); enviar(); }
      });
      return fb;
    }).catch(function (e) {
      cargando = null;
      fijar({ fase: "sin-conexion", error: "No se pudo cargar Firebase (¿hay internet?)." });
      throw e;
    });
    return cargando;
  }

  function mensajeError(e) {
    var c = (e && e.code) || "";
    if (/wrong-password|invalid-credential|user-not-found|invalid-email/.test(c)) return "Correo o contraseña incorrectos.";
    if (/too-many-requests/.test(c)) return "Demasiados intentos; espera un momento.";
    if (/network/.test(c)) return "Sin conexión a internet.";
    if (/PERMISSION_DENIED/i.test(c + " " + (e && e.message))) return "Firebase negó la escritura: revisa las reglas y el UID del operador.";
    return "No se pudo completar: " + (c || (e && e.message) || "error desconocido") + ".";
  }

  function enviar() {
    if (!pendiente || !fb || !estado.correo) return;
    var juego = pendiente;
    pendiente = null;
    var u = cambios(juego, raiz.Motor, publicados());
    fijar({ fase: "publicando", error: "" });
    fb.escribir(u).then(function () {
      var vigentes = Object.keys(u).filter(function (r) { return u[r] !== null; }).map(function (r) { return r.split("/")[1]; });
      escribirLS(CLAVE_PUBLICADOS, JSON.stringify(vigentes));
      fijar({ fase: "en-vivo", hora: Date.now() });
    }).catch(function (e) {
      pendiente = pendiente || juego;
      fijar({ fase: "error", error: mensajeError(e) });
    });
  }

  raiz.Publicar = Object.assign(api, {
    estado: function () { return estado; },
    alCambiar: function (f) { oyentes.push(f); },
    usado: function () { return LOCAL || leerLS(CLAVE_USO, "") === "1"; },
    iniciar: function () {
      if (!raiz.Publicar.usado()) return;
      cargar().then(function (f) { if (f.local) fijar({ fase: "en-vivo", correo: "local" }); enviar(); }, function () {});
    },
    conectar: function (correo, clave) {
      return cargar().then(function (f) { return f.conectar(correo, clave); }).then(function (c) {
        escribirLS(CLAVE_USO, "1");
        fijar({ fase: "en-vivo", correo: c, error: "" });
        enviar();
      }, function (e) {
        var m = e && e.code ? mensajeError(e) : estado.error || mensajeError(e);
        fijar({ error: m });
        throw new Error(m);
      });
    },
    desconectar: function () {
      return (fb ? fb.salir() : Promise.resolve()).then(function () { fijar({ fase: "sin-sesion", correo: "" }); });
    },
    programar: function (juego) {
      pendiente = juego;
      clearTimeout(timer);
      timer = setTimeout(enviar, ESPERA);
    },
    ahora: function (juego) { pendiente = juego; clearTimeout(timer); enviar(); }
  });
})(typeof window !== "undefined" ? window : globalThis);
