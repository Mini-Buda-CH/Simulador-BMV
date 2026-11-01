(function (raiz) {
  "use strict";

  var FORMATO = "simulador-bmv/empresa";
  var VERSION = 1;
  var MAX_EMPRESAS = 40;
  var MIN_EMPRESAS = 2;
  var MERCADOS = ["Capitales", "Deuda"];
  var DIVISAS = ["MXN", "USD"];
  var PERIODICIDADES = { 12: "Mensual", 6: "Bimestral", 4: "Trimestral", 3: "Cuatrimestral", 2: "Semestral", 1: "Anual" };
  var PERIODOS_DIVIDENDO = { 4: "Trimestral", 2: "Semestral", 1: "Anual" };

  function esObjeto(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function esNumero(v) { return typeof v === "number" && isFinite(v); }
  function esTexto(v) { return typeof v === "string" && v.trim() !== ""; }

  function leerTexto(texto) {
    try {
      return { ok: true, objeto: JSON.parse(String(texto).replace(/^﻿/, "")) };
    } catch (e) {
      return { ok: false, error: "El archivo no es un JSON válido." };
    }
  }

  function normalizar(texto) {
    return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function clave(datos) {
    if (!esObjeto(datos)) return "";
    if (esTexto(datos.id)) return "id:" + datos.id.trim();
    var e = esObjeto(datos.empresa) ? datos.empresa : {};
    return "nombre:" + normalizar(e.nombre) + "|" + (e.mercado || "") + "|" + (e.divisa || "");
  }

  function validarEmpresa(datos) {
    var errores = [];
    var avisos = [];
    var err = function (t) { errores.push(t); };

    if (!esObjeto(datos)) {
      return { ok: false, errores: ["El archivo no contiene los datos de una empresa."], avisos: [], datos: null, clave: "" };
    }
    if (datos.formato !== FORMATO) {
      return { ok: false, errores: ["El archivo no fue exportado desde Simulador de cálculos (formato desconocido)."], avisos: [], datos: null, clave: "" };
    }
    if (datos.version !== VERSION) err("Versión de archivo no compatible (se espera la versión " + VERSION + ").");

    function num(obj, campo, nombre, opciones) {
      opciones = opciones || {};
      var v = esObjeto(obj) ? obj[campo] : undefined;
      if (!esNumero(v)) { err(nombre + ": falta el dato o no es un número."); return null; }
      if (opciones.positivo && v <= 0) { err(nombre + ": debe ser mayor que cero."); return null; }
      if (!opciones.negativos && !opciones.positivo && v < 0) { err(nombre + ": no puede ser negativo."); return null; }
      if (opciones.entero && Math.round(v) !== v) { err(nombre + ": debe ser un número entero."); return null; }
      return v;
    }

    var emp = datos.empresa;
    var mercado = null, divisa = null;
    if (!esObjeto(emp)) {
      err("Faltan los datos generales de la empresa.");
    } else {
      if (!esTexto(emp.nombre)) err("Falta el nombre de la empresa.");
      if (MERCADOS.indexOf(emp.mercado) === -1) err("Tipo de mercado no válido (Capitales o Deuda).");
      else mercado = emp.mercado;
      if (DIVISAS.indexOf(emp.divisa) === -1) err("Divisa no válida (MXN o USD).");
      else divisa = emp.divisa;
      if (!esTexto(emp.carrera) || !esTexto(emp.tipoEmpresa)) avisos.push("No trae carrera o tipo de empresa.");
    }
    if (!esTexto(datos.id)) avisos.push("No trae identificador; los duplicados se detectan por nombre, mercado y divisa.");

    var emi = datos.emision;
    if (!esObjeto(emi)) {
      err("Faltan los datos de la emisión.");
    } else {
      num(emi, "monto", "Monto de la emisión", { positivo: true });
      var precio = num(emi, "precio", "Precio de emisión", { positivo: true });
      if (precio !== null && precio > 1) avisos.push("El precio de emisión es mayor al 100 % del valor nominal.");
      num(emi, "tipoCambio", "Tipo de cambio", { positivo: true });
      if (mercado === "Capitales") {
        if (emi.tipo !== "acciones") err("Una empresa de Capitales debe emitir acciones.");
        num(emi, "acciones", "Cantidad de acciones", { positivo: true, entero: true });
      } else if (mercado === "Deuda") {
        if (emi.tipo !== "bonos") err("Una empresa de Deuda debe emitir bonos.");
        num(emi, "plazoAnios", "Plazo de los bonos", { positivo: true });
        num(emi, "cupon", "Cupón", {});
        var per = num(emi, "periodicidad", "Periodicidad del cupón", { positivo: true });
        if (per !== null && !PERIODICIDADES[per]) err("Periodicidad del cupón no válida.");
      }
    }

    var er = datos.estadoResultados;
    if (!esObjeto(er)) {
      err("Falta el estado de resultados.");
    } else {
      num(er, "ventasAnio1", "Ventas del año 1", {});
      num(er, "costoVentas", "Costo de ventas", {});
      num(er, "gastos", "Gastos de operación", {});
      num(er, "depreciacion", "Depreciación", {});
    }

    var bg = datos.balanceGeneral;
    if (!esObjeto(bg)) {
      err("Falta el balance general.");
    } else {
      var activo = 0, pasivo = 0, completo = true;
      ["bancos", "clientes", "inventarios"].forEach(function (c, i) {
        var v = num(bg, c, ["Bancos", "Clientes", "Inventarios"][i], {});
        if (v === null) completo = false; else activo += v;
      });
      ["proveedores", "acreedores"].forEach(function (c, i) {
        var v = num(bg, c, ["Proveedores", "Acreedores"][i], {});
        if (v === null) completo = false; else pasivo += v;
      });
      if (completo && activo - pasivo <= 0) avisos.push("El capital contable es cero o negativo.");
    }

    var bmv = datos.datosBMV;
    if (!esObjeto(bmv)) {
      err("Faltan los datos para el Simulador BMV.");
    } else {
      var crec = num(bmv, "crecimientoAnual", "Crecimiento anual de ventas", { negativos: true });
      if (crec !== null && crec <= -1) err("Crecimiento anual de ventas: no puede ser de −100 % o menos.");

      var caja = bmv.cajaOtraDivisa;
      if (!esObjeto(caja)) err("Falta la caja en la otra divisa.");
      else {
        num(caja, "monto", "Caja en la otra divisa", {});
        if (divisa && caja.divisa !== (divisa === "MXN" ? "USD" : "MXN")) err("La caja en la otra divisa no corresponde a la divisa de la empresa.");
      }

      var deuda = bmv.deudaInicial;
      if (!esObjeto(deuda)) err("Falta la deuda bancaria inicial.");
      else {
        var md = num(deuda, "monto", "Deuda bancaria inicial", {});
        if (md !== null && md > 0) {
          num(deuda, "tasaAnual", "Tasa de la deuda inicial", { positivo: true });
          num(deuda, "plazoMeses", "Plazo de la deuda inicial", { positivo: true, entero: true });
        }
      }

      if (!esTexto(bmv.objetivoEmision)) err("Falta el objetivo de la emisión.");

      if (mercado === "Capitales") {
        var div = bmv.dividendos;
        if (!esObjeto(div)) err("Faltan los dividendos (empresas de Capitales).");
        else {
          var pct = num(div, "porcentajeUtilidad", "Dividendos (% de la utilidad)", {});
          if (pct !== null && pct > 1) err("Dividendos (% de la utilidad): no puede ser mayor al 100 %.");
          var pd = num(div, "periodicidad", "Periodicidad de los dividendos", { positivo: true });
          if (pd !== null && !PERIODOS_DIVIDENDO[pd]) err("Periodicidad de los dividendos no válida.");
        }
      }
    }

    return { ok: errores.length === 0, errores: errores, avisos: avisos, datos: datos, clave: clave(datos) };
  }

  function resultado(obj, campo) {
    return esObjeto(obj) && esObjeto(obj.resultados) && esNumero(obj.resultados[campo]) ? obj.resultados[campo] : null;
  }

  function resumenEmpresa(datos) {
    var emp = (datos && datos.empresa) || {};
    var emi = (datos && datos.emision) || {};
    var er = (datos && datos.estadoResultados) || {};
    var bg = (datos && datos.balanceGeneral) || {};
    var bmv = (datos && datos.datosBMV) || {};
    var deuda = bmv.deudaInicial || {};
    var div = bmv.dividendos || null;
    var esDeuda = emp.mercado === "Deuda";
    var precioUnitario = !esDeuda && esNumero(emi.monto) && esNumero(emi.acciones) && emi.acciones > 0
      ? emi.monto / emi.acciones : null;

    return {
      nombre: emp.nombre || "Sin nombre",
      mercado: emp.mercado || null,
      divisa: emp.divisa || null,
      otraDivisa: emp.divisa === "USD" ? "MXN" : "USD",
      carrera: emp.carrera || null,
      tipoEmpresa: emp.tipoEmpresa || null,
      emision: {
        tipo: esDeuda ? "bonos" : "acciones",
        monto: esNumero(emi.monto) ? emi.monto : null,
        precio: esNumero(emi.precio) ? emi.precio : null,
        acciones: esNumero(emi.acciones) ? emi.acciones : null,
        valorPorAccion: precioUnitario,
        plazoAnios: esNumero(emi.plazoAnios) ? emi.plazoAnios : null,
        cupon: esNumero(emi.cupon) ? emi.cupon : null,
        periodicidad: PERIODICIDADES[emi.periodicidad] || null,
        tipoCambio: esNumero(emi.tipoCambio) ? emi.tipoCambio : null
      },
      ventas: esNumero(er.ventasAnio1) ? er.ventasAnio1 : null,
      utilidadNeta: resultado(er, "utilidadNeta"),
      crecimiento: esNumero(bmv.crecimientoAnual) ? bmv.crecimientoAnual : null,
      caja: esNumero(bg.bancos) ? bg.bancos : null,
      cajaOtra: bmv.cajaOtraDivisa && esNumero(bmv.cajaOtraDivisa.monto) ? bmv.cajaOtraDivisa.monto : null,
      capital: resultado(bg, "capitalContable"),
      deuda: {
        monto: esNumero(deuda.monto) ? deuda.monto : null,
        tasaAnual: esNumero(deuda.tasaAnual) ? deuda.tasaAnual : null,
        plazoMeses: esNumero(deuda.plazoMeses) ? deuda.plazoMeses : null
      },
      objetivo: bmv.objetivoEmision || null,
      dividendos: div ? {
        porcentaje: esNumero(div.porcentajeUtilidad) ? div.porcentajeUtilidad : null,
        periodicidad: PERIODOS_DIVIDENDO[div.periodicidad] || null
      } : null
    };
  }

  function buscar(lista, k) {
    for (var i = 0; i < lista.length; i++) if (lista[i].clave === k) return i;
    return -1;
  }

  function agregarALista(lista, registro) {
    var copia = lista.slice();
    var i = buscar(copia, registro.clave);
    if (i !== -1) {
      copia[i] = registro;
      return { lista: copia, accion: "reemplazada" };
    }
    if (copia.length >= MAX_EMPRESAS) return { lista: lista, accion: "llena" };
    copia.push(registro);
    return { lista: copia, accion: "agregada" };
  }

  function quitarDeLista(lista, k) {
    return lista.filter(function (r) { return r.clave !== k; });
  }

  function conteos(lista) {
    var c = { total: lista.length, Capitales: 0, Deuda: 0, MXN: 0, USD: 0 };
    lista.forEach(function (r) {
      var e = (r.datos && r.datos.empresa) || {};
      if (c[e.mercado] !== undefined) c[e.mercado]++;
      if (c[e.divisa] !== undefined) c[e.divisa]++;
    });
    return c;
  }

  var api = {
    FORMATO: FORMATO,
    VERSION: VERSION,
    MAX_EMPRESAS: MAX_EMPRESAS,
    MIN_EMPRESAS: MIN_EMPRESAS,
    leerTexto: leerTexto,
    clave: clave,
    validarEmpresa: validarEmpresa,
    resumenEmpresa: resumenEmpresa,
    buscar: buscar,
    agregarALista: agregarALista,
    quitarDeLista: quitarDeLista,
    conteos: conteos
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.Importar = api;
})(typeof window !== "undefined" ? window : this);
