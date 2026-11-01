(function (raiz) {
  "use strict";

  var E = typeof module !== "undefined" && module.exports ? require("./entorno.js") : raiz.Entorno;
  var M = typeof module !== "undefined" && module.exports ? require("./mercado.js") : raiz.Mercado;
  var HISTORIA = typeof module !== "undefined" && module.exports ? require("./entorno-datos.js") : raiz.HistoriaEntorno;
  var R = typeof module !== "undefined" && module.exports ? require("./riesgos.js") : raiz.Riesgos;

  var MESES_ENTORNO = 360;
  var ISR = 0.30, PTU = 0.10;
  var NOMINAL_BONO = 100;

  function r2(n) { return Math.round(n * 100) / 100 || 0; }
  function otra(divisa) { return divisa === "MXN" ? "USD" : "MXN"; }

  function empresa(juego, clave) {
    for (var i = 0; i < juego.empresas.length; i++) if (juego.empresas[i].clave === clave) return juego.empresas[i];
    return null;
  }

  function valor(juego, emisora) {
    for (var i = 0; i < juego.valores.length; i++) if (juego.valores[i].emisora === emisora) return juego.valores[i];
    return null;
  }

  function entornoActual(juego) { return juego.entorno[juego.t]; }

  var cerrando = false;
  function mesDeRegistro(juego) {
    var mes = entornoActual(juego).mes;
    return juego.fase === "turnos" && !cerrando ? E.sumarMeses(mes, 1) : mes;
  }

  function anotar(juego, tipo, texto, extra) {
    var nota = { n: juego.bitacora.length + 1, ronda: juego.ronda, mes: mesDeRegistro(juego), tipo: tipo, texto: texto };
    if (extra) nota.detalle = extra;
    juego.bitacora.push(nota);
    return nota;
  }

  function movimiento(juego, m) {
    if (!juego.movimientos) juego.movimientos = [];
    m.n = juego.movimientos.length + 1;
    m.ronda = juego.ronda;
    m.mes = mesDeRegistro(juego);
    juego.movimientos.push(m);
  }

  function convertir(monto, de, a, tc, dif) {
    if (de === a) return monto;
    var bruto = de === "USD" ? monto * tc : monto / tc;
    return bruto * (1 - (dif || 0));
  }

  function costoConversion(monto, a, tc, dif) {
    var de = otra(a);
    var neto = 1 - dif;
    return a === "MXN" ? monto / (tc * neto) : monto * tc / neto;
  }

  function planPago(caja, requerido, tc, dif) {
    var resto = { MXN: caja.MXN - (requerido.MXN || 0), USD: caja.USD - (requerido.USD || 0) };
    var conversiones = [];
    ["MXN", "USD"].forEach(function (d) {
      if (resto[d] < -1e-9) {
        var falta = -resto[d];
        var entrega = costoConversion(falta, d, tc, dif);
        conversiones.push({ de: otra(d), a: d, entrega: entrega, recibe: falta });
        resto[otra(d)] -= entrega;
        resto[d] = 0;
      }
    });
    return { ok: resto.MXN >= -1e-6 && resto.USD >= -1e-6, conversiones: conversiones, resto: resto };
  }

  function aplicarPago(emp, divisa, monto, tc, dif) {
    var req = {}; req[divisa] = monto;
    var plan = planPago(emp.caja, req, tc, dif);
    plan.conversiones.forEach(function (c) {
      emp.caja[c.de] = r2(emp.caja[c.de] - c.entrega);
      emp.caja[c.a] = r2(emp.caja[c.a] + c.recibe);
    });
    emp.caja[divisa] = r2(emp.caja[divisa] - monto);
    return plan;
  }

  function pagoFrances(saldo, tasaMensual, plazo) {
    if (!(saldo > 0) || !(plazo > 0)) return 0;
    if (!tasaMensual) return saldo / plazo;
    return saldo * tasaMensual / (1 - Math.pow(1 + tasaMensual, -plazo));
  }

  function utilidadBaseAnual(base) {
    var uai = base.ventasAnio1 - base.costoVentas - base.gastos - base.depreciacion;
    return uai > 0 ? uai * (1 - ISR - PTU) : uai;
  }

  function valorCartera(juego, emp, tc) {
    var total = 0;
    Object.keys(emp.cartera).forEach(function (k) {
      var pos = emp.cartera[k];
      var v = valor(juego, k);
      if (!v || !pos.cantidad) return;
      total += convertir(pos.cantidad * v.precio, v.divisa, emp.divisa, tc, 0);
    });
    return total;
  }

  function bonosEmitidos(juego, emp) {
    var v = valor(juego, emp.clave);
    return v && v.tipo === "bonos" && v.colocado && !v.vencido && !v.liquidado ? v.total * NOMINAL_BONO : 0;
  }

  function deudaBancaria(emp) {
    return emp.deuda.saldo + (emp.creditos || []).reduce(function (s, c) { return s + c.saldo; }, 0);
  }

  function pagosDoceMeses(emp) {
    var total = Math.min(emp.deuda.saldo, emp.deuda.pago * Math.min(12, emp.deuda.plazoRestante));
    (emp.creditos || []).forEach(function (c) { total += Math.min(c.saldo, c.pago * Math.min(12, c.plazoRestante)); });
    return total;
  }

  function balance(juego, emp) {
    var tc = entornoActual(juego).tc;
    var caja = emp.caja[emp.divisa] + convertir(emp.caja[otra(emp.divisa)], otra(emp.divisa), emp.divisa, tc, 0);
    var inversiones = valorCartera(juego, emp, tc);
    var b = emp.base;
    var activo = caja + b.clientes + b.inventarios + inversiones;
    var bonos = bonosEmitidos(juego, emp);
    var v = valor(juego, emp.clave);
    var cuponesAnuales = bonos && v ? bonos * v.cupon : 0;
    var pasivoTotal = b.proveedores + b.acreedores + deudaBancaria(emp) + bonos;
    var pasivoCirculante = b.proveedores + b.acreedores + pagosDoceMeses(emp) + cuponesAnuales;
    return {
      caja: caja,
      inversiones: inversiones,
      activoCirculante: activo,
      activoTotal: activo,
      pasivoCirculante: pasivoCirculante,
      pasivoTotal: pasivoTotal,
      capital: activo - pasivoTotal
    };
  }

  function actualizarCalificacion(juego, emp) {
    var c = M.calificar(balance(juego, emp));
    emp.calificacion = c.nota;
    emp.puntosCalificacion = c.puntos;
    return c;
  }

  function valorEmpresa(juego, emp) {
    var tc = entornoActual(juego).tc;
    var v = valor(juego, emp.clave);
    var monto = emp.mercado === "Capitales" && v && v.colocado ? v.precio * v.total : balance(juego, emp).capital;
    return convertir(monto, emp.divisa, "MXN", tc, 0);
  }

  function utilidad12m(emp) {
    var u = emp.utilidades;
    if (!u.length) return utilidadBaseAnual(emp.base);
    var suma = u.reduce(function (s, x) { return s + x; }, 0);
    return u.length >= 12 ? suma : suma * 12 / u.length;
  }

  function crearEmpresa(reg, orden, tc0) {
    var d = reg.datos;
    var emp = d.empresa, er = d.estadoResultados, bg = d.balanceGeneral, bmv = d.datosBMV;
    var caja = { MXN: 0, USD: 0 };
    caja[emp.divisa] = bg.bancos;
    caja[otra(emp.divisa)] = bmv.cajaOtraDivisa ? bmv.cajaOtraDivisa.monto : 0;
    var di = bmv.deudaInicial || { monto: 0 };
    var tasa = di.monto > 0 ? di.tasaAnual : 0;
    var plazo = di.monto > 0 ? di.plazoMeses : 0;
    return {
      clave: reg.clave,
      orden: orden,
      nombre: emp.nombre,
      mercado: emp.mercado,
      divisa: emp.divisa,
      carrera: emp.carrera || null,
      tipoEmpresa: emp.tipoEmpresa || null,
      caja: caja,
      base: {
        ventasAnio1: er.ventasAnio1, costoVentas: er.costoVentas, gastos: er.gastos, depreciacion: er.depreciacion,
        crecimiento: bmv.crecimientoAnual,
        clientes: bg.clientes, inventarios: bg.inventarios, proveedores: bg.proveedores, acreedores: bg.acreedores
      },
      deuda: { saldo: di.monto || 0, tasaAnual: tasa, plazoRestante: plazo, pago: pagoFrances(di.monto || 0, tasa / 12, plazo) },
      cartera: {},
      creditos: [],
      dividendos: emp.mercado === "Capitales" && bmv.dividendos && bmv.dividendos.porcentajeUtilidad > 0
        ? { porcentaje: bmv.dividendos.porcentajeUtilidad, periodicidad: bmv.dividendos.periodicidad } : null,
      utilidadDesdeDividendo: 0,
      mesesImpago: 0,
      quebrada: false,
      sancion: 0,
      extraordinarios: 0,
      utilidades: [],
      utilidadAcumulada: 0,
      ultimoMes: null,
      gananciasPendientes: 0,
      calificacion: null,
      puntosCalificacion: 0,
      activosIniciales: 0,
      valorInicial: 0,
      alertas: [],
      ops: 0,
      estadoTurno: "pendiente"
    };
  }

  function crearValor(reg) {
    var d = reg.datos, emi = d.emision;
    if (emi.tipo === "bonos") {
      var titulos = Math.floor(emi.monto / NOMINAL_BONO);
      var plazoMeses = Math.round(emi.plazoAnios * 12);
      return {
        emisora: reg.clave, tipo: "bonos", divisa: d.empresa.divisa, total: titulos, publico: titulos,
        precioColocacion: NOMINAL_BONO * emi.precio, precio: NOMINAL_BONO * emi.precio,
        cupon: emi.cupon, periodicidad: emi.periodicidad, plazoMeses: plazoMeses, mesesRestantes: plazoMeses,
        y0: null, tiie0: null, diferencial0: null, premio: 0,
        ordenes: [], colocado: false, vencido: false, precioRondaAnterior: null
      };
    }
    var nominal = emi.monto / emi.acciones;
    return {
      emisora: reg.clave, tipo: "acciones", divisa: d.empresa.divisa, total: emi.acciones, publico: emi.acciones,
      nominal: nominal, precioColocacion: nominal * emi.precio, precio: nominal * emi.precio,
      ordenes: [], colocado: false, vencido: false, precioRondaAnterior: null
    };
  }

  function crearJuego(registros, parametros, fecha) {
    var p = parametros;
    var sim = E.simular({
      historia: HISTORIA, mesInicial: p.partida.mesInicial, meses: MESES_ENTORNO, semilla: p.partida.semilla,
      meta: p.entorno.metaInflacion, banda: p.entorno.banda, pasoTiie: p.entorno.pasoTiie,
      tasaRealNeutral: p.entorno.tasaRealNeutral, pisoTiie: p.entorno.pisoTiie, inflacionExterna: p.entorno.inflacionExterna
    });
    var inicio = sim.inicio;
    var entorno = [{ mes: inicio.mes, inflacionMensual: inicio.inflacionMensual, inflacionAnual: inicio.inflacionAnual, inpc: inicio.inpc, tiie: inicio.tiie, tc: inicio.tc }]
      .concat(sim.meses.map(function (m) {
        return { mes: m.mes, inflacionMensual: m.inflacionMensual, inflacionAnual: m.inflacionAnual, inpc: m.inpc, tiie: m.tiie, tc: m.tc };
      }));

    var juego = {
      formato: "simulador-bmv/juego",
      version: 1,
      creado: fecha || new Date().toISOString(),
      parametros: p,
      entorno: entorno,
      t: 0,
      ronda: 0,
      fase: "colocacion",
      empresas: registros.map(function (r, i) { return crearEmpresa(r, i, inicio.tc); }),
      valores: registros.map(crearValor),
      ordenBase: [],
      ordenRonda: [],
      turno: null,
      presion: {},
      operaciones: [],
      movimientos: [],
      bitacora: [],
      historial: [],
      eventos: [],
      efectos: { regulatorios: [], chismes: {} },
      riesgosRonda: 0
    };

    juego.empresas.forEach(function (emp) {
      actualizarCalificacion(juego, emp);
      var b = balance(juego, emp);
      emp.activosIniciales = b.activoTotal;
    });

    var items = juego.empresas.map(function (emp) {
      return { clave: emp.clave, orden: emp.orden, valorInicial: 1, valorActual: 1, utilidad: utilidadBaseAnual(emp.base), activosIniciales: emp.activosIniciales, puntosCalificacion: emp.puntosCalificacion };
    });
    var ranking = M.puntajes(items, p.puntaje);
    juego.puntajeRegistro = ranking.map(function (r) { return { clave: r.clave, puntaje: r.puntaje }; });
    juego.ordenBase = ranking.map(function (r) { return r.clave; });
    juego.ordenRonda = juego.ordenBase.slice();

    anotar(juego, "inicio", "Partida creada con " + juego.empresas.length + " empresas. Semilla " + p.partida.semilla + ", periodo " +
      (p.partida.periodo === "trimestre" ? "trimestral" : "mensual") + ", desde " + E.nombreMes(inicio.mes) + ".");
    anotar(juego, "inicio", "Orden del registro: " + juego.ordenBase.map(function (k, i) { return (i + 1) + ". " + empresa(juego, k).nombre; }).join(", ") + ".");
    return juego;
  }

  function compromisos(juego, inversionista, excepto) {
    var req = { MXN: 0, USD: 0 };
    juego.valores.forEach(function (v) {
      if (v.emisora === excepto) return;
      v.ordenes.forEach(function (o) { if (o.inversionista === inversionista) req[v.divisa] += o.cantidad * v.precioColocacion; });
    });
    return req;
  }

  function validarOrdenColocacion(juego, inversionista, emisora, cantidad) {
    var p = juego.parametros;
    var emp = empresa(juego, inversionista), v = valor(juego, emisora);
    if (juego.fase !== "colocacion") return "La colocación ya se cerró.";
    if (!emp || !v) return "Empresa o emisión desconocida.";
    if (inversionista === emisora) return "Una empresa no puede comprar su propia emisión.";
    if (!(cantidad >= 0) || Math.round(cantidad) !== cantidad) return "La cantidad debe ser un número entero.";
    var maximo = Math.floor(v.total * p.limites.tenenciaMax);
    if (cantidad > maximo) return "Máximo " + maximo.toLocaleString("es-MX") + " (" + Math.round(p.limites.tenenciaMax * 100) + " % de la emisión).";
    var req = compromisos(juego, inversionista, emisora);
    req[v.divisa] += cantidad * v.precioColocacion;
    if (!planPago(emp.caja, req, entornoActual(juego).tc, p.operacion.diferencialCambiario).ok) return "La caja no alcanza para todas sus órdenes.";
    return null;
  }

  function ordenColocacion(juego, inversionista, emisora, cantidad) {
    var error = validarOrdenColocacion(juego, inversionista, emisora, cantidad);
    if (error) return { ok: false, error: error };
    var v = valor(juego, emisora);
    v.ordenes = v.ordenes.filter(function (o) { return o.inversionista !== inversionista; });
    if (cantidad > 0) v.ordenes.push({ inversionista: inversionista, cantidad: cantidad });
    return { ok: true };
  }

  function prorrata(ordenes, oferta, demanda, ordenDe) {
    var asign = ordenes.map(function (o) {
      var exacto = o.cantidad * oferta / demanda;
      return { inversionista: o.inversionista, cantidad: Math.floor(exacto), fraccion: exacto - Math.floor(exacto) };
    });
    var resto = oferta - asign.reduce(function (s, a) { return s + a.cantidad; }, 0);
    asign.slice().sort(function (a, b) { return b.fraccion - a.fraccion || ordenDe(a.inversionista) - ordenDe(b.inversionista); })
      .slice(0, resto).forEach(function (a) { a.cantidad++; });
    return asign;
  }

  function cerrarColocacion(juego) {
    if (juego.fase !== "colocacion") return { ok: false, error: "La colocación ya se cerró." };
    var p = juego.parametros;
    var env = entornoActual(juego);
    var dif = p.operacion.diferencialCambiario;
    var ordenDe = function (k) { return empresa(juego, k).orden; };
    var resumen = [];

    juego.valores.forEach(function (v) {
      var emisora = empresa(juego, v.emisora);
      var demanda = v.ordenes.reduce(function (s, o) { return s + o.cantidad; }, 0);
      var pc = v.precioColocacion;
      var asignacion, recibido, publico, apertura;
      if (demanda >= v.total && demanda > 0) {
        asignacion = prorrata(v.ordenes, v.total, demanda, ordenDe);
        publico = 0;
        recibido = v.total * pc;
        apertura = pc * (1 + Math.min(0.10, 0.10 * (demanda / v.total - 1)));
      } else {
        asignacion = v.ordenes.map(function (o) { return { inversionista: o.inversionista, cantidad: o.cantidad }; });
        publico = v.total - demanda;
        var precioPublico = pc * (M.FACTOR_COLOCACION[emisora.calificacion] || 0.7);
        recibido = demanda * pc + publico * precioPublico;
        apertura = recibido / v.total;
      }

      asignacion.forEach(function (a) {
        if (!a.cantidad) return;
        var inv = empresa(juego, a.inversionista);
        aplicarPago(inv, v.divisa, a.cantidad * pc, env.tc, dif);
        inv.cartera[v.emisora] = { cantidad: a.cantidad, costo: a.cantidad * pc };
        movimiento(juego, { tipo: "colocacion", empresa: inv.clave, emisora: v.emisora, cantidad: a.cantidad, precio: pc, monto: a.cantidad * pc, divisa: v.divisa });
      });
      emisora.caja[v.divisa] = r2(emisora.caja[v.divisa] + recibido);
      v.publico = publico;
      v.precio = apertura;
      v.precioRondaAnterior = apertura;
      v.precioInicial = apertura;
      v.precioCierre = apertura;
      v.colocado = true;
      v.demandaColocacion = demanda;
      v.asignacion = asignacion.filter(function (a) { return a.cantidad > 0; });
      resumen.push({ emisora: v.emisora, demanda: demanda, oferta: v.total, publico: publico, apertura: apertura, recibido: recibido });
      anotar(juego, "colocacion", emisora.nombre + ": demanda " + demanda.toLocaleString("es-MX") + " de " + v.total.toLocaleString("es-MX") +
        (v.tipo === "bonos" ? " títulos" : " acciones") + (publico ? "; el público tomó " + publico.toLocaleString("es-MX") : "; sobredemanda, asignación a prorrata") +
        ". Recibe " + r2(recibido).toLocaleString("es-MX") + " " + v.divisa + ".");
    });

    juego.empresas.forEach(function (emp) {
      actualizarCalificacion(juego, emp);
      emp.valorInicial = valorEmpresa(juego, emp);
    });
    juego.valores.forEach(function (v) {
      if (v.tipo !== "bonos") return;
      v.y0 = M.rendimientoImplicito(v.cupon, v.periodicidad, v.mesesRestantes, v.precio);
      v.tiie0 = env.tiie;
      v.diferencial0 = M.DIFERENCIAL[empresa(juego, v.emisora).calificacion];
    });
    juego.fase = "turnos";
    juego.ronda = 1;
    iniciarRonda(juego);
    anotar(juego, "colocacion", "Colocación cerrada. Empieza la ronda 1.");
    return { ok: true, resumen: resumen };
  }

  function activas(juego) { return juego.empresas.filter(function (e) { return !e.quebrada; }); }

  function ordenSerpentina(base, ronda) {
    return ronda % 2 === 1 ? base.slice() : base.slice().reverse();
  }

  function iniciarRonda(juego) {
    var vivas = {};
    activas(juego).forEach(function (e) { vivas[e.clave] = true; });
    juego.ordenRonda = ordenSerpentina(juego.ordenBase, juego.ronda).filter(function (k) { return vivas[k]; });
    juego.empresas.forEach(function (e) {
      e.ops = 0;
      e.estadoTurno = "pendiente";
      if (e.sancion > 0 && !e.quebrada) { e.estadoTurno = "sancionada"; e.sancion--; }
    });
    var chismes = (juego.efectos && juego.efectos.chismes) || {};
    Object.keys(chismes).forEach(function (k) {
      var c = chismes[k];
      if (c.rondas > 0) c.rondas--;
      if (c.rondas <= 0 && !c.recuperar) delete chismes[k];
    });
    juego.riesgosRonda = 0;
    juego.presion = {};
    juego.operaciones = [];
    juego.turno = pendientes(juego)[0] || null;
  }

  function pendientes(juego) {
    return juego.ordenRonda.filter(function (k) { return empresa(juego, k).estadoTurno === "pendiente"; });
  }

  function avanzarTurno(juego) {
    var pend = pendientes(juego);
    juego.turno = pend.length ? pend[0] : null;
    return juego.turno;
  }

  function seleccionarTurno(juego, clave) {
    var emp = empresa(juego, clave);
    if (!emp || emp.estadoTurno !== "pendiente") return { ok: false, error: "Esa empresa ya terminó su turno." };
    juego.turno = clave;
    return { ok: true };
  }

  function terminarTurno(juego, comoPase) {
    var emp = empresa(juego, juego.turno);
    if (!emp) return { ok: false, error: "No hay turno activo." };
    emp.estadoTurno = comoPase && emp.ops === 0 ? "paso" : "terminado";
    anotar(juego, "turno", emp.nombre + (emp.estadoTurno === "paso" ? " pasó." : " terminó su turno (" + emp.ops + (emp.ops === 1 ? " operación)." : " operaciones).")));
    avanzarTurno(juego);
    return { ok: true };
  }

  function posicion(emp, emisora) { return emp.cartera[emisora] || { cantidad: 0, costo: 0 }; }

  function errorTurno(juego, emp) {
    var p = juego.parametros;
    if (juego.fase !== "turnos") return "La partida no está en turnos.";
    if (!emp) return "Selecciona la empresa.";
    if (emp.quebrada) return "La empresa ya no participa.";
    if (emp.estadoTurno !== "pendiente") return "Esa empresa ya terminó su turno.";
    if (emp.ops >= p.operacion.operacionesPorTurno) return "Ya usó sus " + p.operacion.operacionesPorTurno + " operaciones del turno.";
    return null;
  }

  function contarOperacion(juego, emp) {
    var p = juego.parametros;
    emp.ops++;
    if (emp.ops >= p.operacion.operacionesPorTurno) {
      emp.estadoTurno = "terminado";
      anotar(juego, "turno", emp.nombre + " usó sus " + p.operacion.operacionesPorTurno + " operaciones.");
      avanzarTurno(juego);
    }
  }

  function vistaPrevia(juego, op) {
    var p = juego.parametros;
    var env = entornoActual(juego);
    var emp = empresa(juego, op.empresa), v = valor(juego, op.emisora);
    var err = function (t) { return { ok: false, error: t }; };
    var et = errorTurno(juego, emp);
    if (et) return err(et);
    if (!v) return err("Selecciona el valor.");
    if (v.vencido) return err("Ese bono ya venció.");
    if (v.liquidado) return err("Ese valor ya fue liquidado.");
    var cant = op.cantidad;
    if (!(cant > 0) || Math.round(cant) !== cant) return err("La cantidad debe ser un entero mayor que cero.");
    var maxOp = Math.max(1, Math.floor(v.total * p.limites.porOperacion));
    if (cant > maxOp) return err("Máximo " + maxOp.toLocaleString("es-MX") + " por operación (" + r2(p.limites.porOperacion * 100) + " % de la emisión).");

    var comprador, vendedor, precioUnit, conPublico = op.tipo !== "cruce";
    if (op.tipo === "compra") { comprador = emp; precioUnit = v.precio * (1 + p.operacion.diferencialPublico); }
    else if (op.tipo === "venta") { vendedor = emp; precioUnit = v.precio * (1 - p.operacion.diferencialPublico); }
    else if (op.tipo === "cruce") {
      var otraEmp = empresa(juego, op.contraparte);
      if (!otraEmp || otraEmp === emp) return err("Selecciona la contraparte.");
      if (otraEmp.quebrada) return err("La contraparte ya no participa.");
      if (op.lado === "venta") { vendedor = emp; comprador = otraEmp; } else { comprador = emp; vendedor = otraEmp; }
      if (!(op.precio > 0)) return err("Escribe el precio pactado.");
      var banda = p.limites.bandaCruce;
      if (Math.abs(op.precio / v.precio - 1) > banda + 1e-9) {
        return err("El precio debe estar entre " + r2(v.precio * (1 - banda)) + " y " + r2(v.precio * (1 + banda)) + " (± " + r2(banda * 100) + " %).");
      }
      precioUnit = op.precio;
    } else return err("Tipo de operación desconocido.");

    if (comprador && comprador.clave === v.emisora) return err("Una empresa no puede comprar sus propios valores.");
    if (vendedor && vendedor.clave === v.emisora) return err("Una empresa no puede vender sus propios valores.");
    if (conPublico && comprador && v.publico < cant) return err("El público solo tiene " + v.publico.toLocaleString("es-MX") + " disponibles.");
    if (comprador) {
      var maxTen = Math.floor(v.total * p.limites.tenenciaMax);
      if (posicion(comprador, v.emisora).cantidad + cant > maxTen) {
        return err((comprador === emp ? "" : comprador.nombre + ": ") + "la tenencia máxima es " + maxTen.toLocaleString("es-MX") + " (" + r2(p.limites.tenenciaMax * 100) + " % de la emisión).");
      }
    }
    if (vendedor && posicion(vendedor, v.emisora).cantidad < cant) {
      return err((vendedor === emp ? "Solo tiene " : vendedor.nombre + " solo tiene ") + posicion(vendedor, v.emisora).cantidad.toLocaleString("es-MX") + "; no se permiten ventas en corto.");
    }

    var bruto = cant * precioUnit;
    var comision = bruto * p.operacion.comision;
    var detalle = { tipo: op.tipo, lado: op.lado || op.tipo, emisora: v.emisora, divisa: v.divisa, cantidad: cant, precio: v.precio, precioUnit: precioUnit, bruto: bruto, comision: comision, tc: env.tc };

    if (comprador) {
      var total = bruto + comision;
      var req = {}; req[v.divisa] = total;
      var plan = planPago(comprador.caja, req, env.tc, p.operacion.diferencialCambiario);
      if (!plan.ok) return err((comprador === emp ? "La caja no alcanza" : "La caja de " + comprador.nombre + " no alcanza") + " (necesita " + r2(total).toLocaleString("es-MX") + " " + v.divisa + ").");
      detalle.comprador = { clave: comprador.clave, total: total, conversiones: plan.conversiones, tenenciaFinal: posicion(comprador, v.emisora).cantidad + cant };
    }
    if (vendedor) {
      var pos = posicion(vendedor, v.emisora);
      var costoProm = pos.cantidad ? pos.costo / pos.cantidad : 0;
      var comisionV = conPublico ? comision : bruto * p.operacion.comision;
      var ganancia = bruto - comisionV - costoProm * cant;
      var impuesto = ganancia > 0 ? ganancia * p.operacion.impuestoGanancias : 0;
      detalle.vendedor = { clave: vendedor.clave, comision: comisionV, costo: costoProm * cant, ganancia: ganancia, impuesto: impuesto, neto: bruto - comisionV - impuesto, tenenciaFinal: pos.cantidad - cant };
    }
    return { ok: true, detalle: detalle };
  }

  function maximoOperable(juego, op) {
    var p = juego.parametros;
    var env = entornoActual(juego);
    var emp = empresa(juego, op.empresa), v = valor(juego, op.emisora);
    if (!emp || !v) return null;
    var otraEmp = op.tipo === "cruce" ? empresa(juego, op.contraparte) : null;
    var vendeEmp = op.tipo === "venta" || (op.tipo === "cruce" && op.lado === "venta");
    var comprador = op.tipo === "compra" || (op.tipo === "cruce" && !vendeEmp) ? emp : (op.tipo === "cruce" ? otraEmp : null);
    var vendedor = vendeEmp ? emp : (op.tipo === "cruce" ? otraEmp : null);
    var res = { publico: v.publico, tenencia: posicion(emp, v.emisora).cantidad, contraparte: otraEmp ? posicion(otraEmp, v.emisora).cantidad : null };
    var topes = [{ n: Math.max(1, Math.floor(v.total * p.limites.porOperacion)), limite: "máximo por operación" }];
    var precioUnit = op.tipo === "compra" ? v.precio * (1 + p.operacion.diferencialPublico)
      : op.tipo === "venta" ? v.precio * (1 - p.operacion.diferencialPublico) : op.precio;
    if (op.tipo === "compra") topes.push({ n: v.publico, limite: "público" });
    if (vendedor) topes.push({ n: posicion(vendedor, v.emisora).cantidad, limite: vendedor === emp ? "tus títulos" : "títulos de la contraparte" });
    if (comprador) {
      topes.push({ n: Math.floor(v.total * p.limites.tenenciaMax) - posicion(comprador, v.emisora).cantidad, limite: "tenencia máxima" });
      var d = v.divisa, o = otra(d);
      var poder = Math.max(0, comprador.caja[d]) + convertir(Math.max(0, comprador.caja[o]), o, d, env.tc, p.operacion.diferencialCambiario);
      if (precioUnit > 0) topes.push({ n: Math.floor(poder / (precioUnit * (1 + p.operacion.comision)) + 1e-9), limite: "caja" });
    }
    var menor = topes.reduce(function (a, b) { return b.n < a.n ? b : a; });
    var cabe = function (n) { return vistaPrevia(juego, Object.assign({}, op, { cantidad: n })).ok; };
    var bajo = 0, alto = Math.max(0, menor.n);
    if (alto > 0 && !cabe(alto)) {
      while (alto - bajo > 1) { var medio = Math.floor((bajo + alto) / 2); if (cabe(medio)) bajo = medio; else alto = medio; }
      alto = bajo;
    }
    res.maximo = alto;
    res.limite = menor.limite;
    return res;
  }

  function pagosRonda(juego, emp) {
    var meses = E.mesesPorRonda(juego.parametros.partida.periodo);
    var deuda = Math.min(emp.deuda.saldo * (1 + emp.deuda.tasaAnual), emp.deuda.pago * Math.min(meses, emp.deuda.plazoRestante));
    (emp.creditos || []).forEach(function (c) { deuda += Math.min(c.saldo * (1 + c.tasa), c.pago * Math.min(meses, c.plazoRestante)); });
    var bonos = 0;
    var v = valor(juego, emp.clave);
    if (v && v.tipo === "bonos" && v.colocado && !v.vencido && !v.liquidado) {
      for (var k = 1; k <= meses && k <= v.mesesRestantes; k++) {
        if ((v.plazoMeses - v.mesesRestantes + k) % (12 / v.periodicidad) === 0) bonos += NOMINAL_BONO * v.cupon / v.periodicidad * v.total;
        if (v.mesesRestantes - k === 0) bonos += NOMINAL_BONO * v.total;
      }
    }
    var dividendo = 0, pol = emp.dividendos;
    if (pol) {
      for (var m = 1; m <= meses; m++) {
        if ((juego.t + m) % (12 / pol.periodicidad) === 0) {
          var mensual = emp.ultimoMes ? emp.ultimoMes.utilidadNeta : utilidadBaseAnual(emp.base) / 12;
          dividendo = pol.porcentaje * Math.max(0, (emp.utilidadDesdeDividendo || 0) + mensual * m);
          break;
        }
      }
    }
    return { meses: meses, deuda: deuda, bonos: bonos, dividendo: dividendo, total: deuda + bonos + dividendo };
  }

  function carteraDe(juego, clave) {
    var emp = empresa(juego, clave);
    if (!emp) return null;
    var tc = entornoActual(juego).tc;
    var d = emp.divisa, o = otra(d);
    var movs = (juego.movimientos || []).filter(function (m) { return m.empresa === clave; });
    var ingresos = {};
    movs.forEach(function (m) { if (m.tipo === "cupon" || m.tipo === "dividendo") ingresos[m.emisora] = (ingresos[m.emisora] || 0) + m.monto; });

    var posiciones = Object.keys(emp.cartera).filter(function (k) { return emp.cartera[k].cantidad > 0; }).map(function (k) {
      var v = valor(juego, k), pos = emp.cartera[k], e = empresa(juego, k);
      var enMercado = pos.cantidad * v.precio;
      return {
        emisora: k, nombre: e.nombre, tipo: v.tipo, divisa: v.divisa, calificacion: e.calificacion,
        cantidad: pos.cantidad, participacion: pos.cantidad / v.total,
        costo: pos.costo, costoPromedio: pos.costo / pos.cantidad, precio: v.precio,
        valor: enMercado, plusvalia: enMercado - pos.costo, rendimiento: pos.costo > 0 ? enMercado / pos.costo - 1 : 0,
        ingresos: ingresos[k] || 0,
        serie: [{ ronda: 0, mes: juego.entorno[0].mes, precio: v.precioInicial }].concat(juego.historial.map(function (h) {
          return { ronda: h.ronda, mes: h.mes, precio: h.precios[k] };
        }))
      };
    }).sort(function (a, b) { return b.valor - a.valor || a.nombre.localeCompare(b.nombre, "es"); });

    var aSuDivisa = function (monto, divisa) { return convertir(monto, divisa, d, tc, 0); };
    var cajaTotal = emp.caja[d] + convertir(emp.caja[o], o, d, tc, 0);
    var enCartera = valorCartera(juego, emp, tc);
    var costo = 0, ingresosTotal = 0;
    posiciones.forEach(function (p) { costo += aSuDivisa(p.costo, p.divisa); });
    Object.keys(ingresos).forEach(function (k) { ingresosTotal += aSuDivisa(ingresos[k], valor(juego, k).divisa); });

    var lugar = null;
    if (juego.fase !== "colocacion") {
      var ranking = juego.fase === "terminada" ? juego.final.ranking : rankingActual(juego);
      ranking.forEach(function (r) { if (r.clave === clave) lugar = { posicion: r.posicion, de: ranking.length, puntaje: r.puntaje }; });
    }

    return {
      clave: clave, nombre: emp.nombre, mercado: emp.mercado, divisa: d, calificacion: emp.calificacion,
      quebrada: emp.quebrada, alertas: emp.alertas.slice(), tc: tc, ronda: juego.ronda, fase: juego.fase, mes: entornoActual(juego).mes,
      resumen: {
        caja: { MXN: emp.caja.MXN, USD: emp.caja.USD }, cajaTotal: cajaTotal, valorCartera: enCartera, total: cajaTotal + enCartera,
        costoCartera: costo, plusvalia: enCartera - costo, ingresos: ingresosTotal, deudaBancaria: deudaBancaria(emp), lugar: lugar
      },
      posiciones: posiciones,
      evolucion: juego.historial.filter(function (h) { return h.carteras && h.carteras[clave]; }).map(function (h) {
        var c = h.carteras[clave];
        return { ronda: h.ronda, mes: h.mes, valorCartera: c.valorCartera, total: c.total };
      }),
      movimientos: movs.slice().reverse()
    };
  }

  function operar(juego, op) {
    var prev = vistaPrevia(juego, op);
    if (!prev.ok) return prev;
    var p = juego.parametros, d = prev.detalle, v = valor(juego, op.emisora);
    var env = entornoActual(juego);
    var emp = empresa(juego, op.empresa);

    if (d.comprador) {
      var c = empresa(juego, d.comprador.clave);
      aplicarPago(c, v.divisa, d.comprador.total, env.tc, p.operacion.diferencialCambiario);
      var pc = posicion(c, v.emisora);
      c.cartera[v.emisora] = { cantidad: pc.cantidad + d.cantidad, costo: pc.costo + d.comprador.total };
    }
    if (d.vendedor) {
      var s = empresa(juego, d.vendedor.clave);
      s.caja[v.divisa] = r2(s.caja[v.divisa] + d.vendedor.neto);
      var ps = posicion(s, v.emisora);
      var restante = ps.cantidad - d.cantidad;
      if (restante > 0) s.cartera[v.emisora] = { cantidad: restante, costo: ps.costo - d.vendedor.costo };
      else delete s.cartera[v.emisora];
      var neta = d.vendedor.ganancia - d.vendedor.impuesto;
      s.gananciasPendientes += convertir(neta, v.divisa, s.divisa, env.tc, 0);
    }
    if (d.tipo === "compra") v.publico -= d.cantidad;
    if (d.tipo === "venta") v.publico += d.cantidad;

    var signo = d.tipo === "compra" ? 1 : d.tipo === "venta" ? -1 : Math.sign(d.precioUnit - d.precio);
    juego.presion[v.emisora] = (juego.presion[v.emisora] || 0) + signo * d.cantidad;

    var emisora = empresa(juego, v.emisora);
    var unidad = v.tipo === "bonos" ? "títulos" : "acciones";
    var texto;
    if (d.tipo === "cruce") {
      var comp = empresa(juego, d.comprador.clave), vend = empresa(juego, d.vendedor.clave);
      texto = "Cruce: " + comp.nombre + " compra a " + vend.nombre + " " + d.cantidad.toLocaleString("es-MX") + " " + unidad + " de " + emisora.nombre + " a " + r2(d.precioUnit) + " " + v.divisa + ".";
    } else {
      texto = emp.nombre + (d.tipo === "compra" ? " compra " : " vende ") + d.cantidad.toLocaleString("es-MX") + " " + unidad + " de " + emisora.nombre + " a " + r2(d.precioUnit) + " " + v.divisa + ".";
    }
    if (d.comprador && d.comprador.conversiones.length) {
      texto += " Convirtió " + d.comprador.conversiones.map(function (cv) { return r2(cv.entrega).toLocaleString("es-MX") + " " + cv.de; }).join(" y ") + ".";
    }
    if (d.vendedor && d.vendedor.impuesto > 0) texto += " Impuesto a la ganancia: " + r2(d.vendedor.impuesto).toLocaleString("es-MX") + " " + v.divisa + ".";
    var registro = { n: juego.operaciones.length + 1, empresa: emp.clave, detalle: d };
    juego.operaciones.push(registro);
    var cruce = d.tipo === "cruce";
    if (d.comprador) movimiento(juego, { tipo: cruce ? "cruce" : "compra", lado: "compra", empresa: d.comprador.clave, contraparte: cruce ? d.vendedor.clave : null,
      emisora: v.emisora, cantidad: d.cantidad, precio: d.precioUnit, monto: d.comprador.total, divisa: v.divisa });
    if (d.vendedor) movimiento(juego, { tipo: cruce ? "cruce" : "venta", lado: "venta", empresa: d.vendedor.clave, contraparte: cruce ? d.comprador.clave : null,
      emisora: v.emisora, cantidad: d.cantidad, precio: d.precioUnit, monto: d.vendedor.neto, impuesto: d.vendedor.impuesto, divisa: v.divisa });
    anotar(juego, "operacion", texto);
    contarOperacion(juego, emp);
    return { ok: true, detalle: d, registro: registro };
  }

  function sobretasaDe(juego, nota) {
    var c = juego.parametros.credito;
    return { AAA: c.AAA, AA: c.AA, A: c.A, BBB: c.BBB }[nota];
  }

  function vistaPreviaCredito(juego, o) {
    var p = juego.parametros, c = p.credito;
    var emp = empresa(juego, o.empresa);
    var err = function (t) { return { ok: false, error: t }; };
    var et = errorTurno(juego, emp);
    if (et) return err(et);
    var b = balance(juego, emp);
    var limite = c.maxActivos * b.activoTotal;
    var disponible = Math.max(0, limite - deudaBancaria(emp));
    var sobretasa = sobretasaDe(juego, emp.calificacion);
    var base = { calificacion: emp.calificacion, disponible: disponible, limite: limite, deuda: deudaBancaria(emp) };
    if (sobretasa === undefined) return { ok: false, error: "Crédito negado: la calificación " + emp.calificacion + " está por debajo de BBB.", detalle: base };
    if (!(o.plazo >= c.plazoMin && o.plazo <= c.plazoMax) || Math.round(o.plazo) !== o.plazo) {
      return { ok: false, error: "El plazo debe ser de " + c.plazoMin + " a " + c.plazoMax + " meses.", detalle: base };
    }
    if (!(o.monto > 0)) return { ok: false, error: "Escribe el monto del crédito.", detalle: base };
    if (o.monto > disponible + 1e-6) {
      return { ok: false, error: "Excede el límite: la deuda bancaria no puede pasar del " + r2(c.maxActivos * 100) + " % de los activos (disponible " + r2(disponible).toLocaleString("es-MX") + " " + emp.divisa + ").", detalle: base };
    }
    var tasa = entornoActual(juego).tiie + sobretasa;
    var pago = pagoFrances(o.monto, tasa / 12, o.plazo);
    var comision = o.monto * c.comisionApertura;
    return {
      ok: true,
      detalle: {
        tipo: "credito", empresa: emp.clave, divisa: emp.divisa, monto: o.monto, plazo: o.plazo,
        calificacion: emp.calificacion, sobretasa: sobretasa, tasa: tasa, pago: pago, comision: comision,
        recibe: o.monto - comision, intereses: pago * o.plazo - o.monto, disponible: disponible, limite: limite, deuda: deudaBancaria(emp)
      }
    };
  }

  function solicitarCredito(juego, o) {
    var prev = vistaPreviaCredito(juego, o);
    if (!prev.ok) return prev;
    var d = prev.detalle, emp = empresa(juego, o.empresa);
    juego.contadorCreditos = (juego.contadorCreditos || 0) + 1;
    var credito = {
      id: "c" + juego.contadorCreditos, monto: d.monto, saldo: d.monto, plazo: d.plazo, plazoRestante: d.plazo,
      sobretasa: d.sobretasa, tasa: d.tasa, pago: d.pago, contratado: { ronda: juego.ronda, t: juego.t }
    };
    emp.creditos.push(credito);
    emp.caja[emp.divisa] = r2(emp.caja[emp.divisa] + d.recibe);
    movimiento(juego, { tipo: "credito", empresa: emp.clave, monto: d.recibe, plazo: d.plazo, tasa: d.tasa, divisa: emp.divisa });
    d.credito = credito.id;
    var registro = { n: juego.operaciones.length + 1, empresa: emp.clave, detalle: d };
    juego.operaciones.push(registro);
    anotar(juego, "credito", emp.nombre + " obtuvo un crédito de " + r2(d.monto).toLocaleString("es-MX") + " " + emp.divisa + " a " + d.plazo + " meses, tasa " +
      (d.tasa * 100).toFixed(2) + " % (TIIE + " + (d.sobretasa * 100).toFixed(2) + "). Comisión " + r2(d.comision).toLocaleString("es-MX") + "; mensualidad estimada " + r2(d.pago).toLocaleString("es-MX") + ".");
    contarOperacion(juego, emp);
    return { ok: true, detalle: d, registro: registro };
  }

  function vistaPreviaPago(juego, o) {
    var p = juego.parametros;
    var emp = empresa(juego, o.empresa);
    var err = function (t) { return { ok: false, error: t }; };
    var et = errorTurno(juego, emp);
    if (et) return err(et);
    var c = (emp.creditos || []).filter(function (x) { return x.id === o.credito; })[0];
    if (!c) return err("Selecciona el crédito.");
    if (!(o.monto > 0)) return err("Escribe el monto a pagar.");
    if (o.monto > c.saldo + 1e-6) return err("El saldo del crédito es " + r2(c.saldo).toLocaleString("es-MX") + " " + emp.divisa + ".");
    var monto = Math.min(o.monto, c.saldo);
    var req = {}; req[emp.divisa] = monto;
    var plan = planPago(emp.caja, req, entornoActual(juego).tc, p.operacion.diferencialCambiario);
    if (!plan.ok) return err("La caja no alcanza para ese pago.");
    var saldo = c.saldo - monto;
    return {
      ok: true,
      detalle: {
        tipo: "pago", empresa: emp.clave, divisa: emp.divisa, credito: c.id, monto: monto, saldoAntes: c.saldo, saldo: saldo,
        pagoAntes: c.pago, pago: saldo > 0.005 ? pagoFrances(saldo, c.tasa / 12, c.plazoRestante) : 0, conversiones: plan.conversiones
      }
    };
  }

  function pagarCredito(juego, o) {
    var prev = vistaPreviaPago(juego, o);
    if (!prev.ok) return prev;
    var d = prev.detalle, emp = empresa(juego, o.empresa), p = juego.parametros;
    aplicarPago(emp, emp.divisa, d.monto, entornoActual(juego).tc, p.operacion.diferencialCambiario);
    var c = emp.creditos.filter(function (x) { return x.id === d.credito; })[0];
    c.saldo = r2(d.saldo);
    c.pago = d.pago;
    movimiento(juego, { tipo: "pagoCredito", empresa: emp.clave, monto: d.monto, saldo: c.saldo, divisa: emp.divisa });
    if (c.saldo <= 0.005) emp.creditos = emp.creditos.filter(function (x) { return x !== c; });
    var registro = { n: juego.operaciones.length + 1, empresa: emp.clave, detalle: d };
    juego.operaciones.push(registro);
    anotar(juego, "credito", emp.nombre + (d.saldo <= 0.005 ? " liquidó su crédito con un pago de " : " pagó anticipadamente ") + r2(d.monto).toLocaleString("es-MX") + " " + emp.divisa +
      (d.saldo > 0.005 ? "; saldo " + r2(d.saldo).toLocaleString("es-MX") + ", nueva mensualidad " + r2(d.pago).toLocaleString("es-MX") + "." : "."));
    contarOperacion(juego, emp);
    return { ok: true, detalle: d, registro: registro };
  }

  function resultadosMes(juego, emp, env, t) {
    var b = emp.base;
    var inflacionAcum = env.inpc / juego.entorno[0].inpc;
    var ventas = b.ventasAnio1 / 12 * Math.pow(1 + b.crecimiento, (t - 1) / 12);
    var reg = regulacion(juego, emp, t);
    var costo = b.costoVentas / 12 * inflacionAcum * reg;
    var gastos = b.gastos / 12 * inflacionAcum * reg;
    var dep = b.depreciacion / 12;

    var interes = 0, capital = 0;
    if (emp.deuda.saldo > 0 && emp.deuda.plazoRestante > 0) {
      interes = emp.deuda.saldo * emp.deuda.tasaAnual / 12;
      capital = Math.min(emp.deuda.saldo, emp.deuda.pago - interes);
      if (emp.deuda.plazoRestante === 1) capital = emp.deuda.saldo;
      emp.deuda.saldo = r2(emp.deuda.saldo - capital);
      emp.deuda.plazoRestante--;
    }
    emp.creditos = (emp.creditos || []).filter(function (c) {
      c.tasa = env.tiie + c.sobretasa;
      var i = c.saldo * c.tasa / 12;
      var pago = pagoFrances(c.saldo, c.tasa / 12, c.plazoRestante);
      var cap = c.plazoRestante <= 1 ? c.saldo : Math.min(c.saldo, pago - i);
      interes += i;
      capital += cap;
      c.saldo = r2(c.saldo - cap);
      c.plazoRestante--;
      c.pago = c.saldo > 0.005 && c.plazoRestante > 0 ? pagoFrances(c.saldo, (env.tiie + c.sobretasa) / 12, c.plazoRestante) : 0;
      return c.saldo > 0.005 && c.plazoRestante > 0;
    });
    var cuponDevengado = bonosEmitidos(juego, emp) * (valor(juego, emp.clave) ? valor(juego, emp.clave).cupon || 0 : 0) / 12;
    var ingresosFin = emp.cobradosMes || 0;
    var extra = emp.extraordinarios || 0;
    emp.extraordinarios = 0;
    var uai = ventas - costo - gastos - dep - interes - cuponDevengado + ingresosFin - extra;
    var isr = uai > 0 ? uai * ISR : 0;
    var ptu = uai > 0 ? uai * PTU : 0;
    var otros = emp.gananciasPendientes;
    var neta = uai - isr - ptu + otros;

    emp.caja[emp.divisa] = r2(emp.caja[emp.divisa] + ventas - costo - gastos - interes - capital - isr - ptu);

    emp.gananciasPendientes = 0;
    emp.cobradosMes = 0;
    emp.utilidades.push(neta);
    if (emp.utilidades.length > 12) emp.utilidades.shift();
    emp.utilidadAcumulada += neta;
    emp.utilidadDesdeDividendo = (emp.utilidadDesdeDividendo || 0) + neta;
    emp.ultimoMes = { mes: env.mes, ventas: ventas, costo: costo, gastos: gastos, depreciacion: dep, intereses: interes + cuponDevengado, ingresosFinancieros: ingresosFin, extraordinarios: extra, uai: uai, isr: isr, ptu: ptu, otros: otros, utilidadNeta: neta };
  }

  function pagosBonos(juego, env) {
    var dif = juego.parametros.operacion.diferencialCambiario;
    juego.valores.forEach(function (v) {
      if (v.tipo !== "bonos" || !v.colocado || v.vencido || v.liquidado) return;
      var emisora = empresa(juego, v.emisora);
      v.mesesRestantes--;
      var transcurrido = v.plazoMeses - v.mesesRestantes;
      var tocaCupon = transcurrido % (12 / v.periodicidad) === 0;
      var porTitulo = (tocaCupon ? NOMINAL_BONO * v.cupon / v.periodicidad : 0) + (v.mesesRestantes === 0 ? NOMINAL_BONO : 0);
      if (!porTitulo) return;
      var total = porTitulo * v.total;
      aplicarPago(emisora, v.divisa, total, env.tc, dif);
      juego.empresas.forEach(function (h) {
        var pos = h.cartera[v.emisora];
        if (!pos || !pos.cantidad) return;
        h.caja[v.divisa] = r2(h.caja[v.divisa] + porTitulo * pos.cantidad);
        if (tocaCupon) movimiento(juego, { tipo: "cupon", empresa: h.clave, emisora: v.emisora, cantidad: pos.cantidad, monto: NOMINAL_BONO * v.cupon / v.periodicidad * pos.cantidad, divisa: v.divisa });
        if (v.mesesRestantes === 0) movimiento(juego, { tipo: "vencimiento", empresa: h.clave, emisora: v.emisora, cantidad: pos.cantidad, monto: NOMINAL_BONO * pos.cantidad, divisa: v.divisa });
        if (tocaCupon) h.cobradosMes = (h.cobradosMes || 0) + convertir(NOMINAL_BONO * v.cupon / v.periodicidad * pos.cantidad, v.divisa, h.divisa, env.tc, 0);
        if (v.mesesRestantes === 0) {
          var ganancia = NOMINAL_BONO * pos.cantidad - pos.costo;
          h.gananciasPendientes += convertir(ganancia, v.divisa, h.divisa, env.tc, 0);
          delete h.cartera[v.emisora];
        }
      });
      if (v.mesesRestantes === 0) {
        v.vencido = true;
        v.precio = NOMINAL_BONO;
        anotar(juego, "bonos", "Vencieron los bonos de " + emisora.nombre + ": pagó " + r2(total).toLocaleString("es-MX") + " " + v.divisa + " (principal y último cupón).");
      } else if (tocaCupon) {
        anotar(juego, "bonos", emisora.nombre + " pagó cupón: " + r2(total).toLocaleString("es-MX") + " " + v.divisa + ".");
      }
    });
  }

  function pagarDividendos(juego, env) {
    var p = juego.parametros;
    var dif = p.operacion.diferencialCambiario;
    activas(juego).forEach(function (emp) {
      var pol = emp.dividendos;
      if (!pol) return;
      var cada = 12 / pol.periodicidad;
      if (juego.t % cada !== 0) return;
      var v = valor(juego, emp.clave);
      var utilidad = emp.utilidadDesdeDividendo || 0;
      emp.utilidadDesdeDividendo = 0;
      if (!v || v.liquidado || utilidad <= 0) {
        anotar(juego, "dividendo", emp.nombre + ": sin dividendo; la utilidad del periodo no fue positiva.");
        return;
      }
      var monto = pol.porcentaje * utilidad;
      var req = {}; req[v.divisa] = monto;
      if (!planPago(emp.caja, req, env.tc, dif).ok) {
        v.precio *= 1 - p.precio.castigoDividendo;
        anotar(juego, "dividendo", emp.nombre + " omitió su dividendo de " + r2(monto).toLocaleString("es-MX") + " " + v.divisa + " por falta de caja; su acción baja " + r2(p.precio.castigoDividendo * 100) + " %.");
        return;
      }
      aplicarPago(emp, v.divisa, monto, env.tc, dif);
      var porAccion = monto / v.total;
      juego.empresas.forEach(function (h) {
        var pos = h.cartera[v.emisora];
        if (!pos || !pos.cantidad || h.quebrada) return;
        var neto = porAccion * pos.cantidad * (1 - p.operacion.retencionDividendos);
        h.caja[v.divisa] = r2(h.caja[v.divisa] + neto);
        movimiento(juego, { tipo: "dividendo", empresa: h.clave, emisora: v.emisora, cantidad: pos.cantidad, monto: neto, divisa: v.divisa });
        h.cobradosMes = (h.cobradosMes || 0) + convertir(neto, v.divisa, h.divisa, env.tc, 0);
      });
      emp.dividendosPagados = (emp.dividendosPagados || 0) + monto;
      anotar(juego, "dividendo", emp.nombre + " pagó dividendo: " + r2(monto).toLocaleString("es-MX") + " " + v.divisa + " (" + porAccion.toFixed(4) + " por acción, retención " +
        r2(p.operacion.retencionDividendos * 100) + " %).");
    });
  }

  function revisarLiquidez(juego, emp, env) {
    var p = juego.parametros;
    var dif = p.operacion.diferencialCambiario;
    var principal = emp.divisa, otraD = otra(principal);
    if (emp.caja[principal] < 0 && emp.caja[otraD] > 0) {
      var falta = -emp.caja[principal];
      var entrega = Math.min(emp.caja[otraD], costoConversion(falta, principal, env.tc, dif));
      emp.caja[otraD] = r2(emp.caja[otraD] - entrega);
      emp.caja[principal] = r2(emp.caja[principal] + convertir(entrega, otraD, principal, env.tc, dif));
    }
    if (emp.caja[otraD] < 0 && emp.caja[principal] > 0) {
      var falta2 = -emp.caja[otraD];
      var entrega2 = Math.min(emp.caja[principal], costoConversion(falta2, otraD, env.tc, dif));
      emp.caja[principal] = r2(emp.caja[principal] - entrega2);
      emp.caja[otraD] = r2(emp.caja[otraD] + convertir(entrega2, principal, otraD, env.tc, dif));
    }
    var gracia = p.credito.mesesGracia;
    var negativa = emp.caja.MXN < 0 || emp.caja.USD < 0;
    emp.alertas = emp.alertas.filter(function (a) { return a.indexOf("En impago") !== 0 && a !== "Sin liquidez"; });
    if (negativa) {
      emp.mesesImpago = (emp.mesesImpago || 0) + 1;
      if (emp.mesesImpago > gracia) return true;
      emp.alertas.push("En impago (" + emp.mesesImpago + " de " + gracia + ")");
      anotar(juego, "impago", emp.nombre + " no pudo cubrir sus obligaciones: en impago, mes " + emp.mesesImpago + " de " + gracia + ".");
    } else if (emp.mesesImpago) {
      emp.mesesImpago = 0;
      anotar(juego, "impago", emp.nombre + " regularizó sus pagos.");
    }
    return false;
  }

  function liquidar(juego, emp, env) {
    var p = juego.parametros;
    var dif = p.operacion.diferencialCambiario;
    var tc = env.tc;
    var d = emp.divisa;
    var fondo = emp.caja[d] + convertir(emp.caja[otra(d)], otra(d), d, tc, emp.caja[otra(d)] > 0 ? dif : 0);
    Object.keys(emp.cartera).forEach(function (k) {
      var pos = emp.cartera[k], v = valor(juego, k);
      if (!v || !pos.cantidad) return;
      fondo += convertir(pos.cantidad * v.precio * (1 - p.operacion.diferencialPublico), v.divisa, d, tc, 0);
      v.publico += pos.cantidad;
    });
    emp.cartera = {};
    var b = emp.base;
    fondo += b.clientes * 0.8 + b.inventarios * 0.5 - b.proveedores - b.acreedores;
    var resto = fondo;

    var deuda = deudaBancaria(emp);
    var aBancos = Math.max(0, Math.min(deuda, resto));
    resto -= aBancos;

    var v = valor(juego, emp.clave);
    var recuperacion = 0;
    if (v && v.tipo === "bonos" && v.colocado && !v.vencido) {
      recuperacion = v.total > 0 ? Math.max(0, Math.min(NOMINAL_BONO, resto / v.total)) : 0;
      resto -= recuperacion * v.total;
    }
    var residual = 0;
    if (v && v.tipo === "acciones" && v.colocado) residual = Math.max(0, resto) / v.total;
    var porTitulo = v && v.tipo === "bonos" ? recuperacion : residual;

    if (v && v.colocado && !v.vencido) {
      juego.empresas.forEach(function (h) {
        var pos = h.cartera[v.emisora];
        if (!pos || !pos.cantidad) return;
        var cobro = porTitulo * pos.cantidad;
        h.caja[v.divisa] = r2(h.caja[v.divisa] + cobro);
        movimiento(juego, { tipo: "liquidacion", empresa: h.clave, emisora: v.emisora, cantidad: pos.cantidad, monto: cobro, divisa: v.divisa });
        h.gananciasPendientes += convertir(cobro - pos.costo, v.divisa, h.divisa, tc, 0);
        delete h.cartera[v.emisora];
      });
      v.publico = v.total;
      v.liquidado = true;
      v.precio = porTitulo;
    }

    emp.quebrada = true;
    emp.quiebra = { ronda: juego.ronda, mes: env.mes, fondo: fondo, aBancos: aBancos, deuda: deuda, porTitulo: porTitulo };
    emp.caja = { MXN: 0, USD: 0 };
    emp.creditos = [];
    emp.deuda.saldo = 0;
    emp.alertas = ["Quebrada"];
    emp.estadoTurno = "terminado";
    juego.ordenBase = juego.ordenBase.filter(function (k) { return k !== emp.clave; });
    juego.ordenRonda = juego.ordenRonda.filter(function (k) { return k !== emp.clave; });
    anotar(juego, "quiebra", emp.nombre + " quebró y sale del juego. Fondo de liquidación " + r2(fondo).toLocaleString("es-MX") + " " + d +
      "; bancos cobraron " + r2(aBancos).toLocaleString("es-MX") + " de " + r2(deuda).toLocaleString("es-MX") +
      (v && v.tipo === "bonos" ? "; los bonos recuperan " + r2(recuperacion) + " por título de 100." : "; cada acción recibe " + r2(residual) + " " + d + "."));
  }

  function moverPrecios(juego, env, previo, conPresion) {
    var gen = E.azar(juego.parametros.partida.semilla * 31 + juego.t * 7919);
    var movimientos = [];
    juego.valores.forEach(function (v) {
      var eps = gen.normal();
      if (!v.colocado || v.vencido || v.liquidado) return;
      var emisora = empresa(juego, v.emisora);
      var presion = conPresion ? (juego.presion[v.emisora] || 0) / v.total : 0;
      var chisme = juego.efectos && juego.efectos.chismes[v.emisora];
      if (chisme && chisme.rondas > 0 && !chisme.desmentido && presion > 0) presion *= 0.5;
      var antes = v.precio;
      if (v.tipo === "acciones") {
        var vj = M.valorJustoAccion(utilidad12m(emisora), v.total, balance(juego, emisora).capital, juego.parametros.precio.multiploUtilidad);
        var r = M.nuevoPrecioAccion({ precio: v.precio, valorJusto: vj, presion: presion, deltaTiie: env.tiie - previo.tiie, sigma: M.volatilidad(emisora.tipoEmpresa), epsilon: eps });
        v.precio = r.precio;
        v.valorJusto = vj;
        movimientos.push({ emisora: v.emisora, antes: antes, despues: v.precio, partes: r.partes });
      } else {
        var rb = M.nuevoPrecioBono({
          cupon: v.cupon, n: v.periodicidad, mesesRestantes: v.mesesRestantes, y0: v.y0, tiie0: v.tiie0, tiie: env.tiie,
          diferencial0: v.diferencial0, diferencial: M.DIFERENCIAL[emisora.calificacion], premio: v.premio, presion: presion
        });
        v.precio = rb.precio;
        v.premio = rb.premio;
        v.rendimiento = rb.rendimiento;
        movimientos.push({ emisora: v.emisora, antes: antes, despues: v.precio, rendimiento: rb.rendimiento });
      }
    });
    return movimientos;
  }

  function pct(x) { return (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + " %"; }

  function cerrarPeriodo(juego) {
    if (juego.fase === "terminada") return { ok: false, error: "La partida ya terminó." };
    if (juego.fase !== "turnos") return { ok: false, error: "Primero cierra la colocación." };
    var meses = E.mesesPorRonda(juego.parametros.partida.periodo);
    if (juego.t + meses >= juego.entorno.length) return { ok: false, error: "Se alcanzó el horizonte del entorno simulado." };
    var precioInicio = {};
    juego.valores.forEach(function (v) { precioInicio[v.emisora] = v.precioCierre !== undefined ? v.precioCierre : v.precio; });
    var partesAcum = {};
    juego.valores.forEach(function (v) {
      if (v.choque) { partesAcum[v.emisora] = { valorJusto: 0, demanda: 0, economia: 0, azar: 0, riesgo: v.choque }; delete v.choque; }
    });
    cerrando = true;
    try {
      cierreMeses(juego, meses, precioInicio, partesAcum);
    } finally {
      cerrando = false;
    }
    juego.ronda++;
    iniciarRonda(juego);
    return { ok: true };
  }

  function partes(partesAcum, k) {
    return partesAcum[k] || (partesAcum[k] = { valorJusto: 0, demanda: 0, economia: 0, azar: 0, riesgo: 0 });
  }

  function recuperarChismes(juego, partesAcum) {
    var chismes = juego.efectos.chismes;
    Object.keys(chismes).forEach(function (k) {
      var c = chismes[k], v = valor(juego, k);
      if (!c.recuperar) return;
      if (v && !v.liquidado) {
        var antes = v.precio;
        v.precio += c.caida / 2;
        partes(partesAcum, k).riesgo += Math.log(v.precio / antes);
        anotar(juego, "riesgo", empresa(juego, k).nombre + ": el desmentido recupera la mitad de la caída por el chisme.");
      }
      delete chismes[k];
    });
  }

  function cierreMeses(juego, meses, precioInicio, partesAcum) {
    for (var m = 0; m < meses; m++) {
      var previo = entornoActual(juego);
      juego.t++;
      var env = entornoActual(juego);
      if (m === 0) recuperarChismes(juego, partesAcum);
      pagosBonos(juego, env);
      activas(juego).forEach(function (emp) { resultadosMes(juego, emp, env, juego.t); });
      pagarDividendos(juego, env);
      var cupo = juego.parametros.riesgos.maxPorPeriodo - (juego.riesgosRonda || 0);
      R.sortearMes({
        semilla: juego.parametros.partida.semilla, t: juego.t, probabilidades: juego.parametros.riesgos, cupo: cupo,
        empresas: activas(juego).map(function (e) {
          var bal = balance(juego, e);
          return { clave: e.clave, mercado: e.mercado, tipoEmpresa: e.tipoEmpresa, endeudamiento: bal.capital > 0 ? bal.pasivoTotal / bal.capital : Infinity };
        })
      }).forEach(function (ev) {
        juego.riesgosRonda = (juego.riesgosRonda || 0) + 1;
        aplicarEvento(juego, ev, false).choques.forEach(function (ch) { partes(partesAcum, ch.emisora).riesgo += ch.log; });
      });
      activas(juego).filter(function (emp) { return revisarLiquidez(juego, emp, env); })
        .forEach(function (emp) { liquidar(juego, emp, env); });
      activas(juego).forEach(function (emp) { actualizarCalificacion(juego, emp); });
      moverPrecios(juego, env, previo, m === 0).forEach(function (mv) {
        var a = partes(partesAcum, mv.emisora);
        if (mv.partes) ["valorJusto", "demanda", "economia", "azar"].forEach(function (k) { a[k] += mv.partes[k]; });
      });
    }

    var env2 = entornoActual(juego);
    anotar(juego, "cierre", "Cierre de la ronda " + juego.ronda + " (" + E.nombreMes(env2.mes) + "): inflación anual " + (env2.inflacionAnual * 100).toFixed(2) +
      " %, TIIE " + (env2.tiie * 100).toFixed(2) + " %, TC " + env2.tc.toFixed(2) + ".");
    var precios = {};
    juego.valores.forEach(function (v) {
      precios[v.emisora] = v.precio;
      if (!v.colocado || v.vencido || v.liquidado) return;
      var emisora = empresa(juego, v.emisora);
      var cambio = v.precio / precioInicio[v.emisora] - 1;
      var texto = emisora.nombre + " (" + (v.tipo === "bonos" ? "bonos" : "acción") + "): " + pct(cambio);
      var a = partesAcum[v.emisora];
      if (v.tipo === "acciones" && a) {
        texto += " — valor justo " + pct(Math.exp(a.valorJusto) - 1) + ", demanda " + pct(Math.exp(a.demanda) - 1) + ", economía " + pct(Math.exp(a.economia) - 1) + ", azar " + pct(Math.exp(a.azar) - 1) +
          (a.riesgo ? ", riesgos " + pct(Math.exp(a.riesgo) - 1) : "") + ".";
      } else if (v.tipo === "bonos") {
        texto += " — rendimiento " + ((v.rendimiento || 0) * 100).toFixed(2) + " %, " + v.mesesRestantes + " meses al vencimiento.";
      }
      anotar(juego, "precio", texto, { cambio: cambio, partes: a || null });
    });

    var ranking = puntajeActual(juego).map(function (r, i) { return { clave: r.clave, puntaje: r.puntaje, posicion: i + 1 }; });
    var carteras = {};
    juego.empresas.forEach(function (e) {
      var cajaTotal = e.caja[e.divisa] + convertir(e.caja[otra(e.divisa)], otra(e.divisa), e.divisa, env2.tc, 0);
      var enCartera = valorCartera(juego, e, env2.tc);
      carteras[e.clave] = { caja: { MXN: e.caja.MXN, USD: e.caja.USD }, valorCartera: enCartera, total: cajaTotal + enCartera };
    });
    juego.historial.push({ ronda: juego.ronda, mes: env2.mes, t: juego.t, tiie: env2.tiie, inflacionAnual: env2.inflacionAnual, tc: env2.tc, precios: precios, ranking: ranking, carteras: carteras });
    juego.valores.forEach(function (v) { v.precioRondaAnterior = precioInicio[v.emisora]; v.precioCierre = v.precio; });
  }

  function regulacion(juego, emp, t) {
    var f = 1;
    ((juego.efectos && juego.efectos.regulatorios) || []).forEach(function (r) {
      if (r.giro === emp.tipoEmpresa && t > r.desde && t <= r.hasta) f *= 1 + r.factor;
    });
    return f;
  }

  function baseOperativa(emp) {
    var u = emp.ultimoMes;
    var ventas = u ? u.ventas : emp.base.ventasAnio1 / 12;
    var operativa = u ? u.ventas - u.costo - u.gastos - u.depreciacion : (emp.base.ventasAnio1 - emp.base.costoVentas - emp.base.gastos - emp.base.depreciacion) / 12;
    return operativa > 0 ? operativa : 0.01 * ventas;
  }

  function cobrar(juego, emp, monto) {
    emp.caja[emp.divisa] = r2(emp.caja[emp.divisa] - monto);
    emp.extraordinarios = (emp.extraordinarios || 0) + monto;
  }

  function fmt(n) { return r2(n).toLocaleString("es-MX"); }

  function aplicarEvento(juego, ev, manual) {
    var r = R.buscar(ev.id);
    var m = ev.magnitud;
    var choques = [];
    var texto = r.nombre + ": ";
    var emp = ev.objetivo ? empresa(juego, ev.objetivo) : null;
    function bajar(v, fraccion) {
      var antes = v.precio;
      v.precio *= 1 - fraccion;
      choques.push({ emisora: v.emisora, log: Math.log(v.precio / antes) });
    }
    var accionesVivas = juego.valores.filter(function (v) { return v.tipo === "acciones" && v.colocado && !v.liquidado; });

    switch (ev.id) {
      case "mercado":
        accionesVivas.forEach(function (v) { bajar(v, m); });
        texto += "todas las acciones bajan " + (m * 100).toFixed(1) + " %.";
        break;
      case "giro":
        accionesVivas.filter(function (v) { return empresa(juego, v.emisora).tipoEmpresa === ev.objetivo; }).forEach(function (v) { bajar(v, m); });
        texto += "las acciones de " + ev.objetivo + " bajan " + (m * 100).toFixed(1) + " %.";
        break;
      case "incumplimiento":
        var perdida = m * emp.base.clientes;
        cobrar(juego, emp, perdida);
        texto += "los clientes de " + emp.nombre + " no le pagan " + fmt(perdida) + " " + emp.divisa + " (" + (m * 100).toFixed(0) + " % de su saldo de clientes).";
        break;
      case "personas":
      case "procesos":
      case "sistemas":
        var costo = m * baseOperativa(emp);
        cobrar(juego, emp, costo);
        texto += emp.nombre + " tiene un costo de " + fmt(costo) + " " + emp.divisa + ".";
        if (ev.id === "sistemas") { emp.sancion = Math.max(emp.sancion || 0, 1); texto += " Pierde su siguiente turno."; }
        break;
      case "legal":
        var multa = m * balance(juego, emp).activoTotal;
        cobrar(juego, emp, multa);
        emp.sancion = Math.max(emp.sancion || 0, 1);
        texto += emp.nombre + " paga una multa de " + fmt(multa) + " " + emp.divisa + " y no opera la siguiente ronda.";
        break;
      case "tasas":
        for (var k = juego.t + 1; k < juego.entorno.length; k++) {
          var extra = m - 0.0025 * (k - juego.t - 1);
          if (extra <= 1e-9) break;
          juego.entorno[k].tiie += extra;
        }
        texto += "la TIIE sube " + Math.round(m * 10000) + " pb a partir del siguiente mes y regresará 25 pb por mes.";
        break;
      case "tipoCambio":
        for (var q = juego.t + 1; q < juego.entorno.length; q++) juego.entorno[q].tc *= 1 + m;
        texto += "el dólar " + (m > 0 ? "sube " : "baja ") + Math.abs(m * 100).toFixed(1) + " % a partir del siguiente mes.";
        break;
      case "regulatorio":
        juego.efectos.regulatorios.push({ giro: ev.objetivo, factor: m, desde: juego.t, hasta: juego.t + 6 });
        texto += "los costos de " + ev.objetivo + " suben " + (m * 100).toFixed(0) + " % durante 6 meses.";
        break;
      case "chisme":
        var v = valor(juego, emp.clave);
        if (!v || v.tipo !== "acciones" || v.liquidado) return { choques: choques };
        var antes = v.precio;
        bajar(v, m);
        juego.efectos.chismes[emp.clave] = { rondas: 2, caida: antes - v.precio, desmentido: false, recuperar: false };
        texto += "un rumor sobre " + emp.nombre + " baja su acción " + (m * 100).toFixed(1) + " % y reduce su demanda a la mitad durante 2 rondas.";
        break;
    }
    if (manual) texto += " (Activado por el operador.)";
    juego.eventos.push({ n: juego.eventos.length + 1, ronda: juego.ronda, t: juego.t, id: ev.id, objetivo: ev.objetivo || null, magnitud: m, manual: !!manual });
    anotar(juego, "riesgo", texto, { id: ev.id, objetivo: ev.objetivo || null, magnitud: m, manual: !!manual });
    return { choques: choques };
  }

  function activarRiesgo(juego, id, objetivo) {
    var r = R.buscar(id);
    if (!r) return { ok: false, error: "Riesgo desconocido." };
    if (juego.fase !== "turnos") return { ok: false, error: "Los riesgos se activan durante las rondas." };
    var necesita = r.alcance === "empresa" || r.alcance === "capitales" || r.alcance === "propio" || r.alcance === "giro";
    if (necesita && !objetivo) return { ok: false, error: "Elige a quién afecta." };
    if (r.alcance !== "giro" && necesita) {
      var emp = empresa(juego, objetivo);
      if (!emp || emp.quebrada) return { ok: false, error: "Esa empresa no participa." };
      if (r.alcance === "capitales" && emp.mercado !== "Capitales") return { ok: false, error: "El chisme afecta a empresas de Capitales." };
    }
    var gen = E.azar(juego.parametros.partida.semilla * 53 + juego.t * 17 + juego.eventos.length * 7 + 3);
    var res = aplicarEvento(juego, { id: id, objetivo: objetivo || null, magnitud: R.magnitud(id, gen) }, true);
    res.choques.forEach(function (ch) { var v = valor(juego, ch.emisora); v.choque = (v.choque || 0) + ch.log; });
    return { ok: true };
  }

  function desmentir(juego, clave) {
    var c = juego.efectos.chismes[clave];
    if (!c || c.desmentido) return { ok: false, error: "No hay un chisme vigente sobre esa empresa." };
    c.desmentido = true;
    c.recuperar = true;
    c.rondas = 0;
    anotar(juego, "riesgo", empresa(juego, clave).nombre + " desmiente el chisme: termina el castigo a su demanda y recuperará la mitad de la caída al cierre.");
    return { ok: true };
  }

  function rankingActual(juego) {
    var previo = juego.historial.length > 1 ? juego.historial[juego.historial.length - 2].ranking : null;
    var posPrev = {};
    (previo || []).forEach(function (r) { posPrev[r.clave] = r.posicion; });
    return puntajeActual(juego).map(function (r, i) {
      var e = empresa(juego, r.clave);
      return {
        posicion: i + 1, clave: r.clave, nombre: e.nombre, mercado: e.mercado, divisa: e.divisa, puntaje: r.puntaje,
        componentes: r.componentes, rendimiento: r.rendimiento, utilidadAcumulada: e.utilidadAcumulada,
        valorMXN: valorEmpresa(juego, e), calificacion: e.calificacion, anterior: posPrev[r.clave] || null
      };
    });
  }

  function terminarPartida(juego, fecha) {
    if (juego.fase === "terminada") return { ok: false, error: "La partida ya terminó." };
    if (juego.fase !== "turnos") return { ok: false, error: "Primero cierra la colocación." };
    juego.final = { fecha: fecha || new Date().toISOString(), ronda: juego.ronda, mes: entornoActual(juego).mes, ranking: rankingActual(juego) };
    juego.fase = "terminada";
    juego.turno = null;
    var gan = juego.final.ranking[0];
    anotar(juego, "fin", "Partida terminada en la ronda " + juego.ronda + ". Primer lugar: " + (gan ? gan.nombre + " con " + gan.puntaje.toFixed(1) + " puntos" : "—") + ".");
    return { ok: true, final: juego.final };
  }

  function validarPartida(o) {
    if (!o || typeof o !== "object") return "El archivo no contiene una partida.";
    if (o.formato !== "simulador-bmv/juego") return "El archivo no es una partida del Simulador BMV.";
    if (o.version !== 1) return "Versión de partida no compatible.";
    if (!Array.isArray(o.empresas) || !o.empresas.length || !Array.isArray(o.valores) || !Array.isArray(o.entorno) || o.entorno.length < 2 || !o.parametros) {
      return "La partida está incompleta.";
    }
    return null;
  }

  function normalizar(juego) {
    var p = juego.parametros;
    if (p.credito.mesesGracia === undefined) p.credito.mesesGracia = 2;
    if (p.precio.castigoDividendo === undefined) p.precio.castigoDividendo = 0.05;
    if (p.limites.bandaCruce === undefined) p.limites.bandaCruce = 0.05;
    juego.empresas.forEach(function (e) {
      if (!e.creditos) e.creditos = [];
      if (e.dividendos === undefined) e.dividendos = null;
      if (e.utilidadDesdeDividendo === undefined) e.utilidadDesdeDividendo = 0;
      if (e.mesesImpago === undefined) e.mesesImpago = 0;
      if (e.sancion === undefined) e.sancion = 0;
      if (e.extraordinarios === undefined) e.extraordinarios = 0;
    });
    if (!juego.eventos) juego.eventos = [];
    if (!juego.movimientos) juego.movimientos = [];
    if (!juego.efectos) juego.efectos = { regulatorios: [], chismes: {} };
    if (juego.riesgosRonda === undefined) juego.riesgosRonda = 0;
    return juego;
  }

  function puntajeActual(juego) {
    var items = activas(juego).map(function (emp) {
      return { clave: emp.clave, orden: emp.orden, valorInicial: emp.valorInicial || 1, valorActual: emp.valorInicial ? valorEmpresa(juego, emp) : 1, utilidad: emp.utilidades.length ? emp.utilidadAcumulada : utilidadBaseAnual(emp.base), activosIniciales: emp.activosIniciales, puntosCalificacion: emp.puntosCalificacion };
    });
    return M.puntajes(items, juego.parametros.puntaje);
  }

  var api = {
    NOMINAL_BONO: NOMINAL_BONO,
    empresa: empresa,
    valor: valor,
    entornoActual: entornoActual,
    convertir: convertir,
    planPago: planPago,
    pagoFrances: pagoFrances,
    balance: balance,
    valorCartera: valorCartera,
    valorEmpresa: valorEmpresa,
    utilidad12m: utilidad12m,
    crearJuego: crearJuego,
    validarOrdenColocacion: validarOrdenColocacion,
    ordenColocacion: ordenColocacion,
    compromisos: compromisos,
    prorrata: prorrata,
    cerrarColocacion: cerrarColocacion,
    ordenSerpentina: ordenSerpentina,
    pendientes: pendientes,
    seleccionarTurno: seleccionarTurno,
    terminarTurno: terminarTurno,
    vistaPrevia: vistaPrevia,
    maximoOperable: maximoOperable,
    carteraDe: carteraDe,
    pagosRonda: pagosRonda,
    operar: operar,
    deudaBancaria: deudaBancaria,
    normalizar: normalizar,
    aplicarEvento: aplicarEvento,
    activarRiesgo: activarRiesgo,
    desmentir: desmentir,
    rankingActual: rankingActual,
    terminarPartida: terminarPartida,
    validarPartida: validarPartida,
    vistaPreviaCredito: vistaPreviaCredito,
    solicitarCredito: solicitarCredito,
    vistaPreviaPago: vistaPreviaPago,
    pagarCredito: pagarCredito,
    liquidar: liquidar,
    activas: activas,
    cerrarPeriodo: cerrarPeriodo,
    puntajeActual: puntajeActual
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.Motor = api;
})(typeof window !== "undefined" ? window : this);
