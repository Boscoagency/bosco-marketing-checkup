/* ═══════════════════════════════════════════════════════════════
   BOSCO · Atribución de leads (fuente, medio y campaña)
   Se carga en TODAS las páginas de boscoagency.com, desde el <head>
   del sitio en Webflow:
     <script src="https://boscoagency.github.io/bosco-marketing-checkup/atribucion.js" defer></script>

   1. Guarda de dónde llegó la visita: UTM, gclid/fbclid o el sitio que
      la refirió. Sobrevive a la navegación interna (llegan a
      /marketing-checkup y el diagnóstico está en /clarity-audit).
   2. Mete esos datos como campos ocultos en los formularios nativos de
      Webflow, para que lleguen a Odoo junto con el lead.
   3. Se los pasa al Marketing Checkup (iframe de GitHub Pages) cuando
      los pide, porque desde el iframe no se ve la URL del sitio.
   Si la persona rechazó cookies, no se guardan gclid ni fbclid.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var KEY = 'bosco_atribucion';
  var DIAS = 90;
  var CHECKUP_ORIGIN = 'https://boscoagency.github.io';
  var CHECKUP_SOURCE = 'bosco-marketing-checkup';
  var UTM = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
  var CLICK_IDS = ['gclid','gbraid','wbraid','fbclid'];

  function rechazado(){
    try { return localStorage.getItem('bosco_cookie_consent') === 'rejected'; }
    catch(e){ return false; }
  }
  function leer(){
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (v && v.ts && Date.now() - v.ts < DIAS * 864e5) return v;
    } catch(e){}
    return {};
  }
  function guardar(v){ try { localStorage.setItem(KEY, JSON.stringify(v)); } catch(e){} }
  function hostDe(url){
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch(e){ return ''; }
  }

  /* Sin UTM, deducimos fuente y medio con las mismas reglas que GA4 */
  var BUSCADORES = ['google','bing','yahoo','duckduckgo','ecosia','yandex','baidu'];
  var REDES = {
    'facebook.com':'facebook', 'instagram.com':'instagram', 'linkedin.com':'linkedin',
    'lnkd.in':'linkedin', 't.co':'x', 'x.com':'x', 'twitter.com':'x',
    'youtube.com':'youtube', 'tiktok.com':'tiktok', 'wa.me':'whatsapp', 'whatsapp.com':'whatsapp'
  };
  function terminaEn(h, dominio){ return h === dominio || h.slice(-dominio.length - 1) === '.' + dominio; }
  function deducir(t){
    if (t.utm_source) return t;
    if (t.gclid || t.gbraid || t.wbraid){ t.utm_source = 'google'; t.utm_medium = t.utm_medium || 'cpc'; return t; }
    if (t.fbclid){ t.utm_source = 'facebook'; t.utm_medium = t.utm_medium || 'social'; return t; }
    var h = t.referrer_host;
    if (!h) return t;
    for (var i = 0; i < BUSCADORES.length; i++){
      var b = BUSCADORES[i];
      if (h.indexOf(b + '.') === 0 || h.indexOf('.' + b + '.') > -1){
        t.utm_source = b; t.utm_medium = t.utm_medium || 'organic'; return t;
      }
    }
    for (var r in REDES){
      if (terminaEn(h, r)){ t.utm_source = REDES[r]; t.utm_medium = t.utm_medium || 'social'; return t; }
    }
    t.utm_source = h; t.utm_medium = t.utm_medium || 'referral';
    return t;
  }

  /* La visita actual solo cuenta si trae parámetros de campaña o viene de
     otro sitio. Navegar dentro de boscoagency.com no borra la atribución. */
  function visitaActual(){
    var q = new URLSearchParams(location.search);
    var t = {}, hay = false;
    UTM.forEach(function(k){ var v = q.get(k); if (v){ t[k] = v.slice(0, 150); hay = true; } });
    if (!rechazado()) CLICK_IDS.forEach(function(k){ var v = q.get(k); if (v){ t[k] = v.slice(0, 300); hay = true; } });
    var ref = hostDe(document.referrer);
    var interno = !ref || ref === location.hostname.replace(/^www\./, '') ||
                  terminaEn(ref, 'boscoagency.com') || terminaEn(ref, 'webflow.io');
    if (!hay && interno) return null;
    if (!interno) t.referrer_host = ref;
    t.landing_page = location.pathname;
    return deducir(t);
  }

  var guardado = leer();
  var nueva = visitaActual();
  if (nueva){
    guardado.ultima = nueva;
    if (!guardado.primera) guardado.primera = nueva;
    guardado.ts = Date.now();
    guardar(guardado);
  }

  /* Lo que viaja con el lead: la última visita con origen conocido, más un
     resumen del primer contacto si fue distinto. */
  function datos(){
    var u = guardado.ultima || {}, p = guardado.primera || {}, out = {};
    UTM.concat(CLICK_IDS, ['landing_page','referrer_host']).forEach(function(k){
      if (u[k]) out[k] = String(u[k]);
    });
    if (rechazado()) CLICK_IDS.forEach(function(k){ delete out[k]; });
    var primero = [p.utm_source, p.utm_medium, p.utm_campaign].filter(Boolean).join(' / ');
    var ultimo  = [u.utm_source, u.utm_medium, u.utm_campaign].filter(Boolean).join(' / ');
    if (primero && primero !== ultimo) out.primer_contacto = primero;
    out.pagina = location.pathname;
    return out;
  }
  window.boscoAtribucion = datos;

  /* Formularios nativos de Webflow: campos ocultos con name y data-name
     (Webflow usa data-name como nombre del campo en el envío). */
  function rellenarFormularios(){
    var d = datos();
    document.querySelectorAll('.w-form form').forEach(function(f){
      Object.keys(d).forEach(function(k){
        var i = f.querySelector('input[type="hidden"][name="' + k + '"]');
        if (!i){
          i = document.createElement('input');
          i.type = 'hidden';
          i.name = k;
          i.setAttribute('data-name', k);
          f.appendChild(i);
        }
        i.value = d[k];
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rellenarFormularios);
  else rellenarFormularios();

  /* Marketing Checkup: contesta cuando el iframe pide la atribución */
  window.addEventListener('message', function(e){
    if (e.origin !== CHECKUP_ORIGIN || !e.source || !e.data || typeof e.data !== 'object') return;
    if (e.data.source !== CHECKUP_SOURCE || e.data.type !== 'atribucion-pedido') return;
    e.source.postMessage({ source: 'bosco-sitio', type: 'atribucion', datos: datos() }, CHECKUP_ORIGIN);
  });
})();
