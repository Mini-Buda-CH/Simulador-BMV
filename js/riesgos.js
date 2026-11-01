(function (raiz) {
  "use strict";

  var E = typeof module !== "undefined" && module.exports ? require("./entorno.js") : raiz.Entorno;

  var RIESGOS = [
    { id: "mercado", nombre: "Caída general del mercado", categoria: "Mercado", alcance: "mercado", rango: [0.05, 0.20], efecto: "Todas las acciones bajan de 5 a 20 %." },
    { id: "giro", nombre: "Caída por giro comercial", categoria: "Mercado", alcance: "giro", rango: [0.08, 0.25], efecto: "Las acciones de un tipo de empresa bajan de 8 a 25 %." },
    { id: "incumplimiento", nombre: "Incumplimiento de pago", categoria: "Crédito", alcance: "propio", rango: [0.15, 0.40], efecto: "Sus clientes no le pagan: pierde de 15 a 40 % de su saldo de clientes. Si se queda sin caja, entra en impago." },
    { id: "personas", nombre: "Falla de personas", categoria: "Operación", alcance: "empresa", rango: [0.10, 0.10], efecto: "Costo del 10 % de su utilidad mensual." },
    { id: "procesos", nombre: "Falla de procesos", categoria: "Operación", alcance: "empresa", rango: [0.15, 0.15], efecto: "Costo del 15 % de su utilidad mensual." },
    { id: "sistemas", nombre: "Falla de sistemas", categoria: "Operación", alcance: "empresa", rango: [0.10, 0.10], efecto: "Pierde su siguiente turno y un costo del 10 % de su utilidad mensual." },
    { id: "tasas", nombre: "Cambio de tasas", categoria: "Tasa", alcance: "entorno", rango: [0.005, 0.01], efecto: "La TIIE sube de 50 a 100 pb y regresa 25 pb por mes." },
    { id: "tipoCambio", nombre: "Tipo de cambio", categoria: "Tipo de cambio", alcance: "entorno", rango: [0.03, 0.10], efecto: "El dólar sube o baja de 3 a 10 %." },
    { id: "legal", nombre: "Incumplimiento legal", categoria: "Legal", alcance: "empresa", rango: [0.10, 0.10], efecto: "Multa del 10 % de sus activos y una ronda sin operar." },
    { id: "regulatorio", nombre: "Cambio regulatorio", categoria: "Legal", alcance: "giro", rango: [0.03, 0.03], efecto: "Los costos de un tipo de empresa suben 3 % durante 6 meses." },
    { id: "chisme", nombre: "Chisme", categoria: "Reputacional", alcance: "capitales", rango: [0.10, 0.35], efecto: "Su acción baja de 10 a 35 % y su demanda se reduce a la mitad durante 2 rondas. Se puede desmentir." }
  ];

  function buscar(id) {
    for (var i = 0; i < RIESGOS.length; i++) if (RIESGOS[i].id === id) return RIESGOS[i];
    return null;
  }

  function probIncumplimiento(endeudamiento, min, max) {
    var e = isFinite(endeudamiento) ? endeudamiento : 2;
    return min + (max - min) * Math.min(1, Math.max(0, e / 2));
  }

  function magnitud(id, gen) {
    var r = buscar(id);
    if (id === "tasas") return 0.005 + 0.0025 * Math.floor(gen.uniforme() * 3); // 50, 75 o 100 pb
    var m = r.rango[0] + (r.rango[1] - r.rango[0]) * gen.uniforme();
    if (id === "tipoCambio") return gen.uniforme() < 0.5 ? m : -m;
    return m;
  }

  function elegir(lista, gen) { return lista.length ? lista[Math.floor(gen.uniforme() * lista.length)] : null; }

  function barajar(lista, gen) {
    var a = lista.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(gen.uniforme() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function sortearMes(ctx) {
    var gen = E.azar(ctx.semilla * 97 + ctx.t * 131 + 7);
    var pr = ctx.probabilidades;
    var eventos = [];
    if (!(ctx.cupo > 0) || !ctx.empresas.length) return eventos;
    var giros = [];
    ctx.empresas.forEach(function (e) { if (e.tipoEmpresa && giros.indexOf(e.tipoEmpresa) === -1) giros.push(e.tipoEmpresa); });
    var capitales = ctx.empresas.filter(function (e) { return e.mercado === "Capitales"; });
    var giroAcciones = [];
    capitales.forEach(function (e) { if (e.tipoEmpresa && giroAcciones.indexOf(e.tipoEmpresa) === -1) giroAcciones.push(e.tipoEmpresa); });

    var orden = barajar(RIESGOS.map(function (r) { return r.id; }), gen);
    for (var i = 0; i < orden.length && eventos.length < ctx.cupo; i++) {
      var id = orden[i], r = buscar(id);
      if (id === "incumplimiento") {
        for (var k = 0; k < ctx.empresas.length && eventos.length < ctx.cupo; k++) {
          var emp = ctx.empresas[k];
          if (gen.uniforme() < probIncumplimiento(emp.endeudamiento, pr.incumplimientoMin, pr.incumplimientoMax)) {
            eventos.push({ id: id, objetivo: emp.clave, magnitud: magnitud(id, gen) });
          }
        }
        continue;
      }
      if (!(gen.uniforme() < (pr[id] || 0))) continue;
      var objetivo = null;
      if (r.alcance === "empresa") objetivo = elegir(ctx.empresas, gen).clave;
      else if (r.alcance === "capitales") { var c = elegir(capitales, gen); if (!c) continue; objetivo = c.clave; }
      else if (r.alcance === "giro") { objetivo = elegir(id === "giro" ? giroAcciones : giros, gen); if (!objetivo) continue; }
      eventos.push({ id: id, objetivo: objetivo, magnitud: magnitud(id, gen) });
    }
    return eventos;
  }

  var api = {
    RIESGOS: RIESGOS,
    buscar: buscar,
    probIncumplimiento: probIncumplimiento,
    magnitud: magnitud,
    sortearMes: sortearMes
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.Riesgos = api;
})(typeof window !== "undefined" ? window : this);
