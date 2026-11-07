/* =========================================================
   CONECTA U - Lógica de la aplicación
   1) Registrar mi perfil y generar perfil.json
   2) Consultar con fetch() el perfil.json de otro compañero
   3) Mostrar sus datos (sea cual sea su estructura) y
      calcular la compatibilidad de gustos
   ========================================================= */

const $ = id => document.getElementById(id);
let miPerfil = null;                           // mi perfil, para comparar

/* ---------- Utilidades ---------- */

// Minúsculas y sin tildes, para que "Música" y "musica" coincidan
const norm = t => String(t).trim().toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Convierte cualquier valor (texto, número, lista, objeto) en una lista de textos
function aLista(valor) {
  if (valor === null || valor === undefined) return [];
  if (Array.isArray(valor)) return valor.flatMap(aLista);
  if (typeof valor === "object") return Object.values(valor).flatMap(aLista);
  return [String(valor).trim()].filter(Boolean);
}

// Busca el primer campo que exista entre varios nombres posibles
const buscar = (obj, nombres) => {
  const k = Object.keys(obj).find(k => nombres.includes(norm(k)));
  return k ? obj[k] : undefined;
};

/* ---------- Entender el JSON de cualquier compañero ---------- */
// Devuelve { nombre, descripcion, campos: [[etiqueta, [valores]]], valores: [todos] }
function interpretar(data) {
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("El JSON recibido no es un objeto con datos de perfil.");
  const clavesNombre = ["nombre", "name"];
  const clavesDesc = ["descripcion", "description", "bio", "acerca"];
  const nombre = aLista(buscar(data, clavesNombre))[0] || "Compañero sin nombre";
  const descripcion = aLista(buscar(data, clavesDesc))[0] || "";
  const campos = Object.entries(data)
    .filter(([k]) => ![...clavesNombre, ...clavesDesc].includes(norm(k)))
    .map(([k, v]) => [k, aLista(v)])
    .filter(([, v]) => v.length);
  if (!campos.length) throw new Error("El JSON no trae gustos ni intereses para mostrar.");
  return { nombre, descripcion, campos, valores: campos.flatMap(([, v]) => v) };
}

/* ---------- Mi perfil ---------- */
function leerFormulario() {
  const gustos = $("gustos").value.split(",").map(g => g.trim()).filter(Boolean);
  return { nombre: $("nombre").value.trim(), descripcion: $("descripcion").value.trim(), gustos };
}

$("btnGuardar").addEventListener("click", () => {
  const p = leerFormulario(), msg = $("msgPerfil");
  if (!p.nombre || !p.descripcion) { msg.textContent = "Escribe tu nombre y una descripción."; msg.className = "error"; return; }
  if (p.gustos.length < 5) { msg.textContent = `Agrega al menos 5 gustos (llevas ${p.gustos.length}).`; msg.className = "error"; return; }
  miPerfil = p;
  const texto = JSON.stringify(p, null, 2);
  $("vistaJson").textContent = texto; $("vistaJson").hidden = false;
  const a = $("btnDescargar");
  a.href = URL.createObjectURL(new Blob([texto], { type: "application/json" })); a.hidden = false;
  msg.textContent = "Listo. Descarga perfil.json y súbelo a tu hosting junto con la aplicación."; msg.className = "ok";
  try { localStorage.setItem("miPerfil", texto); } catch (e) {}
});

/* ---------- Compatibilidad ---------- */
// Gustos en común ÷ gustos distintos en total (índice de Jaccard)
function compatibilidad(misValores, susValores) {
  const A = new Set(misValores.map(norm)), B = new Set(susValores.map(norm));
  const comunes = new Set([...A].filter(x => B.has(x)));
  const total = new Set([...A, ...B]).size;
  return { porcentaje: total ? Math.round(comunes.size / total * 100) : 0, comunes };
}

/* ---------- Dibujar la tarjeta de un compañero ---------- */
function crearTarjeta(perfil, url, jsonCrudo) {
  const t = document.createElement("article"); t.className = "tarjeta";
  const h = document.createElement("h3"); h.textContent = perfil.nombre; t.appendChild(h);
  if (perfil.descripcion) {
    const d = document.createElement("p"); d.className = "desc"; d.textContent = perfil.descripcion; t.appendChild(d);
  }

  let comunes = new Set();
  if (miPerfil && miPerfil.gustos.length) {
    const c = compatibilidad(miPerfil.gustos, perfil.valores); comunes = c.comunes;
    const s = document.createElement("div"); s.className = "score"; s.textContent = c.porcentaje + "% compatible";
    const b = document.createElement("div"); b.className = "barra";
    const i = document.createElement("span"); i.style.width = c.porcentaje + "%"; b.appendChild(i);
    t.append(s, b);
  } else {
    const n = document.createElement("p"); n.className = "desc";
    n.textContent = "Genera tu perfil para ver la compatibilidad."; t.appendChild(n);
  }

  // Un bloque por cada campo del JSON (gustos, música, comida...)
  perfil.campos.forEach(([etiqueta, valores]) => {
    const e = document.createElement("p"); e.className = "campo-nombre"; e.textContent = etiqueta;
    const ul = document.createElement("ul"); ul.className = "chips";
    valores.forEach(v => {
      const li = document.createElement("li"); li.textContent = v;
      if (comunes.has(norm(v))) li.className = "comun";
      ul.appendChild(li);
    });
    t.append(e, ul);
  });

  // Prueba de que los datos llegaron por HTTP: URL, hora y JSON tal cual se recibió
  const det = document.createElement("details");
  const sm = document.createElement("summary");
  sm.textContent = "Ver datos recibidos de " + new URL(url).hostname;
  const pre = document.createElement("pre");
  pre.textContent = `Consultado: ${new Date().toLocaleString()}\nURL: ${url}\n\n` + JSON.stringify(jsonCrudo, null, 2);
  det.append(sm, pre); t.appendChild(det);
  return t;
}

/* ---------- Consultar el JSON de otro compañero (solicitud HTTP real) ---------- */
// Agrega ?i=1 (o &i=1) al final de la URL
const conI1 = u => u + (u.includes("?") ? "&" : "?") + "i=1";

// Formas de pedir la URL. Primero la directa; si el servidor es InfinityFree
// se prueba también con ?i=1 (puede que ese hosting siga bloqueando CORS).
function intentosPara(url) {
  return [
    { nombre: "Directa", destino: url },
    { nombre: "Directa con ?i=1", destino: conI1(url) }
  ];
}

// Hace la solicitud y devuelve el JSON (o lanza un error que explica qué pasó)
async function pedirJson(destino) {
  const r = await fetch(destino, { cache: "no-store" });
  if (!r.ok) throw new Error("el servidor respondió con error " + r.status);
  const texto = await r.text();
  try { return JSON.parse(texto); }
  catch {
    throw new Error(texto.trim().startsWith("<")
      ? "recibió una página HTML (probable verificación de seguridad del hosting), no un JSON"
      : "lo recibido no es un JSON válido");
  }
}

// Prueba cada forma hasta que una funcione; avisa el resultado de cada intento
async function consultar(url, mostrarLog) {
  for (const intento of intentosPara(url)) {
    try {
      const json = await pedirJson(intento.destino);
      mostrarLog(intento.nombre, true, "funcionó");
      return json;
    } catch (e) {
      // Un TypeError en fetch es CORS, URL incorrecta o sin conexión
      mostrarLog(intento.nombre, false, e instanceof TypeError ? "bloqueado por CORS o sin conexión" : e.message);
    }
  }
  throw new Error("Ninguna forma de consulta funcionó. Revisa el diagnóstico de abajo.");
}

$("btnConsultar").addEventListener("click", async () => {
  const url = $("url").value.trim(), msg = $("msgConsulta"), lista = $("diagnostico");
  lista.innerHTML = "";
  if (!/^https?:\/\//i.test(url)) { msg.textContent = "Escribe una URL completa que empiece por https://"; msg.className = "error"; return; }
  if (!miPerfil) { const p = leerFormulario(); if (p.gustos.length) miPerfil = p; }
  msg.textContent = "Consultando…"; msg.className = "";

  const mostrarLog = (nombre, ok, detalle) => {
    const li = document.createElement("li");
    li.className = ok ? "ok" : "error";
    li.textContent = `${ok ? "✔" : "✘"} ${nombre}: ${detalle}`;
    lista.appendChild(li);
  };

  try {
    const json = await consultar(url, mostrarLog);
    const perfil = interpretar(json);
    $("resultados").prepend(crearTarjeta(perfil, url, json));
    msg.textContent = `Perfil de ${perfil.nombre} cargado correctamente.`; msg.className = "ok";
  } catch (e) {
    msg.textContent = e.message; msg.className = "error";
  }
});

$("btnLimpiar").addEventListener("click", () => {
  $("resultados").innerHTML = ""; $("msgConsulta").textContent = ""; $("diagnostico").innerHTML = "";
});

/* ---------- Recuperar mi perfil guardado en este navegador ---------- */
try {
  const g = JSON.parse(localStorage.getItem("miPerfil") || "null");
  if (g && g.nombre && Array.isArray(g.gustos)) {
    miPerfil = g; $("nombre").value = g.nombre; $("descripcion").value = g.descripcion || ""; $("gustos").value = g.gustos.join(", ");
  }
} catch (e) {}
