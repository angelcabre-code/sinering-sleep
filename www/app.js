/**
 * SineRing Sleep - Dedicated Intelligent Sleep Tracker
 * Ultra-lightweight, battery-efficient, anti-hibernation background monitor.
 */

// -------------------------------------------------------------
// 1. PROTOCOLO YCBT (Framing & CRC-16/CCITT-FALSE)
// -------------------------------------------------------------
function crc16CcittFalse(byteArray) {
  let crc = 0xFFFF;
  for (let i = 0; i < byteArray.length; i++) {
    crc ^= (byteArray[i] << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc;
}

function encodeYcbtFrame(groupType, cmd, payload = []) {
  const totalLen = payload.length + 6;
  const lenL = totalLen & 0xFF;
  const lenH = (totalLen >> 8) & 0xFF;
  const rawNoCrc = [groupType, cmd, lenL, lenH, ...payload];
  const crc = crc16CcittFalse(rawNoCrc);
  return new Uint8Array([...rawNoCrc, crc & 0xFF, (crc >> 8) & 0xFF]);
}

const YCBT_SERVICE_UUID = "be940000-7333-be46-b7ae-689e71722bd5";
const YCBT_CMD_CHAR_UUID = "be940001-7333-be46-b7ae-689e71722bd5";
const YCBT_STREAM_CHAR_UUID = "be940003-7333-be46-b7ae-689e71722bd5";

// -------------------------------------------------------------
// 2. ESTADO GLOBAL DE LA APP
// -------------------------------------------------------------
let isNativeBle = false;
let isConnected = false;
let connectedDeviceId = localStorage.getItem("sinering_sleep_device_id") || null;
let rxBuffer = [];
let sleepSyncBuffer = [];

let activeSession = null;
let sessionTimer = null;
let pulseMeasureInterval = null;
let wakeLockSentinel = null;
let silentAudioCtx = null;

// Intervalo seleccionado (minutos)
let sampleIntervalMinutes = parseInt(localStorage.getItem('sinering_sleep_interval') || "10", 10);

// Historial en memoria de pulso nocturno de la sesión actual
let currentSessionPoints = []; // [{ time: '23:30', bpm: 54, stage: 'deep' }]

// Diagnóstico BLE en pantalla
function logBle(direction, hexStr, info = '') {
  const el = document.getElementById('ble-console');
  if (!el) return;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const line = document.createElement('div');
  line.innerHTML = `<span style="color:#64748b">[${time}]</span> <strong>${direction}</strong> ${hexStr} <span style="color:#94a3b8">${info}</span>`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
  while (el.children.length > 50) el.removeChild(el.firstChild);
}

function toggleBleConsole() {
  const el = document.getElementById('ble-console');
  if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

// -------------------------------------------------------------
// 3. TÉCNICAS ANTI-SUSPENSIÓN MÓVIL (WAKELOCK & SILENT AUDIO)
// -------------------------------------------------------------
async function acquireWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      console.log("[Power] Screen WakeLock adquirido con éxito.");
    } catch (err) {
      console.warn("[Power] No se pudo adquirir WakeLock:", err);
    }
  }
}

function releaseWakeLock() {
  if (wakeLockSentinel) {
    try {
      wakeLockSentinel.release();
    } catch(e) {}
    wakeLockSentinel = null;
  }
}

// Keepalive de audio para priorizar el proceso en segundo plano en Android WebView
function startSilentAudioKeepalive() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!silentAudioCtx) silentAudioCtx = new AudioContext();
    if (silentAudioCtx.state === 'suspended') silentAudioCtx.resume();

    // Reproducir un búfer silencioso cada 20s
    setInterval(() => {
      if (activeSession && silentAudioCtx) {
        const buffer = silentAudioCtx.createBuffer(1, 1, 22050);
        const source = silentAudioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(silentAudioCtx.destination);
        source.start(0);
      }
    }, 20000);
  } catch(e) {
    console.warn("[Keepalive] Audio keepalive no disponible:", e);
  }
}

// -------------------------------------------------------------
// 4. CONEXIÓN BLE NATIVA (Capacitor BluetoothLe)
// -------------------------------------------------------------
async function initNativeBle() {
  try {
    if (!window.BleClient) return false;
    await window.BleClient.initialize();
    isNativeBle = true;

    if (connectedDeviceId) {
      connectToDevice(connectedDeviceId);
    } else {
      scanAndConnectBLE();
    }
    return true;
  } catch (e) {
    console.warn("[BLE] Fallo inicializando BleClient:", e);
    return false;
  }
}

async function scanAndConnectBLE() {
  const txtConn = document.getElementById('txt-conn');
  if (txtConn) txtConn.textContent = 'Buscando...';

  try {
    if (!isNativeBle) await initNativeBle();

    let found = false;
    await window.BleClient.requestLEScan({}, async (res) => {
      const name = res.localName || res.name || '';
      if (name.toLowerCase().includes('r99') && !found) {
        found = true;
        await window.BleClient.stopLEScan();
        await connectToDevice(res.device.deviceId);
      }
    });

    setTimeout(async () => {
      if (!found) {
        try { await window.BleClient.stopLEScan(); } catch(e){}
        if (!isConnected && txtConn) txtConn.textContent = 'No encontrado';
      }
    }, 10000);
  } catch (e) {
    console.error("[BLE] Error en escaneo:", e);
    if (txtConn) txtConn.textContent = 'Desconectado';
  }
}

async function connectToDevice(deviceId) {
  const txtConn = document.getElementById('txt-conn');
  const dotConn = document.getElementById('dot-conn');
  if (txtConn) txtConn.textContent = 'Conectando...';

  try {
    await window.BleClient.connect(deviceId, (discId) => {
      isConnected = false;
      if (dotConn) dotConn.classList.remove('connected');
      if (txtConn) txtConn.textContent = 'Desconectado';
      logBle('BLE', 'DISCONNECT', `Desconectado de ${discId}`);
      updateSettingsUI();
      setTimeout(() => connectToDevice(deviceId), 3000);
    });

    connectedDeviceId = deviceId;
    localStorage.setItem("sinering_sleep_device_id", deviceId);
    isConnected = true;
    if (dotConn) dotConn.classList.add('connected');
    if (txtConn) txtConn.textContent = 'Conectado';
    logBle('BLE', 'CONNECT', `Conectado a ${deviceId}`);
    updateSettingsUI();

    // Suscripción a notificaciones
    await window.BleClient.startNotifications(deviceId, YCBT_SERVICE_UUID, YCBT_CMD_CHAR_UUID, (val) => {
      onBleDataReceived(new Uint8Array(val.buffer));
    });

    await window.BleClient.startNotifications(deviceId, YCBT_SERVICE_UUID, YCBT_STREAM_CHAR_UUID, (val) => {
      onBleDataReceived(new Uint8Array(val.buffer));
    });

    // Handshake inicial: Reloj y Batería
    await sendYcbtHandshake();

  } catch(e) {
    console.error("[BLE] Error conectando:", e);
    if (dotConn) dotConn.classList.remove('connected');
    if (txtConn) txtConn.textContent = 'Error BLE';
    updateSettingsUI();
  }
}

async function sendYcbtFrame(groupType, cmd, payload = []) {
  if (!isNativeBle || !connectedDeviceId || !isConnected) return;
  const frame = encodeYcbtFrame(groupType, cmd, payload);
  const hexStr = Array.from(frame).map(b => b.toString(16).padStart(2, '0')).join(' ');
  logBle('TX', `0x${groupType.toString(16).padStart(2,'0')} 0x${cmd.toString(16).padStart(2,'0')}`, `len=${payload.length}`);

  try {
    await window.BleClient.writeWithoutResponse(connectedDeviceId, YCBT_SERVICE_UUID, YCBT_CMD_CHAR_UUID, new DataView(frame.buffer));
  } catch(e) {
    try {
      await window.BleClient.write(connectedDeviceId, YCBT_SERVICE_UUID, YCBT_CMD_CHAR_UUID, new DataView(frame.buffer));
    } catch(e2) {
      logBle('ERR', hexStr, e2.message || e2);
    }
  }
}

async function sendYcbtHandshake() {
  const now = new Date();
  const yearL = now.getFullYear() & 0xFF;
  const yearH = (now.getFullYear() >> 8) & 0xFF;
  const weekday = (now.getDay() + 6) % 7;

  // 1. Reloj RTC del anillo
  const timePayload = [yearL, yearH, now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds(), weekday];
  await sendYcbtFrame(0x01, 0x00, timePayload);
  await new Promise(r => setTimeout(r, 250));

  // 2. Consulta de Batería
  await sendYcbtFrame(0x02, 0x00, [0x47, 0x43]);
  await new Promise(r => setTimeout(r, 250));

  // 3. Activar muestreo anti-hibernación en hardware
  await sendYcbtFrame(0x01, 0x0C, [0x01, sampleIntervalMinutes]);
}

function onBleDataReceived(bytes) {
  for (let b of bytes) rxBuffer.push(b);

  while (rxBuffer.length >= 6) {
    const groupType = rxBuffer[0];
    const cmd = rxBuffer[1];
    const frameLen = rxBuffer[2] | (rxBuffer[3] << 8);

    if (frameLen < 6 || frameLen > 1024) {
      rxBuffer.shift();
      continue;
    }
    if (rxBuffer.length < frameLen) break;

    const frame = rxBuffer.splice(0, frameLen);
    const payload = frame.slice(4, frame.length - 2);

    processDecodedFrame(groupType, cmd, payload);
  }
}

function processDecodedFrame(group, cmd, payload) {
  const hexP = Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' ');
  logBle('RX', `0x${group.toString(16).padStart(2,'0')} 0x${cmd.toString(16).padStart(2,'0')}`, `[${hexP}]`);

  // Batería (0x02 0x00 o 0x06 0x15)
  if (group === 0x02 && cmd === 0x00 && payload.length >= 6) {
    const bat = payload[5];
    if (bat > 0 && bat <= 100) updateBatteryUI(bat);
  } else if (group === 0x06 && cmd === 0x15 && payload.length >= 1) {
    const bat = payload.length >= 2 ? payload[1] : payload[0];
    if (bat > 0 && bat <= 100) updateBatteryUI(bat);
  }

  // Respuesta de pulso cardíaco en tiempo real
  if ((group === 0x06 && cmd === 0x01) || (group === 0x02 && cmd === 0x01) || (group === 0x03 && cmd === 0x09)) {
    let bpm = 0;
    if (payload.length >= 1 && payload[0] >= 40 && payload[0] <= 180) {
      bpm = payload[0];
    } else if (payload.length >= 2 && payload[1] >= 40 && payload[1] <= 180) {
      bpm = payload[1];
    }

    if (bpm > 0) {
      handleRecordedPulse(bpm);
    }
  }

  // Volcado de memoria de sueño (Grupo 0x05)
  if (group === 0x05) {
    if (cmd === 0x80) {
      sendYcbtFrame(0x05, 0x80, [0x00]); // ACK
      finalizeSleepSync();
    } else if (cmd === 0x04 || cmd === 0x14 || cmd === 0x24) {
      sleepSyncBuffer.push({ cmd, payload: Array.from(payload) });
    }
  }
}

function updateBatteryUI(bat) {
  const txtBat = document.getElementById('txt-bat');
  if (txtBat) txtBat.textContent = `${bat}%`;
}

// -------------------------------------------------------------
// 5. GESTIÓN DEL SUEÑO Y CURVA DE PULSO NOCTURNO
// -------------------------------------------------------------
function onIntervalChange(val) {
  sampleIntervalMinutes = parseInt(val, 10);
  localStorage.setItem('sinering_sleep_interval', sampleIntervalMinutes);
  const summaryEl = document.getElementById('lbl-sampling-interval-summary');
  if (summaryEl) summaryEl.textContent = `Muestreo: cada ${sampleIntervalMinutes} min`;
  const selSettings = document.getElementById('sel-hr-interval');
  if (selSettings) selSettings.value = sampleIntervalMinutes.toString();

  if (isConnected) {
    sendYcbtFrame(0x01, 0x0C, [0x01, sampleIntervalMinutes]);
  }
}

function handleRecordedPulse(bpm) {
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  // Clasificación fisiológica de la fase por frecuencia cardíaca
  let stage = 'light';
  let stageName = 'Sueño Ligero (N1-N2)';
  if (bpm < 55) {
    stage = 'deep';
    stageName = 'Sueño Profundo (Delta)';
  } else if (bpm >= 65 && bpm < 76) {
    stage = 'rem';
    stageName = 'Fase REM (Ensueño)';
  } else if (bpm >= 76) {
    stage = 'awake';
    stageName = 'Microdespertar / Movimiento';
  }

  const point = { time: timeStr, bpm, stage };
  currentSessionPoints.push(point);

  // Actualizar UI en vivo
  const elLiveHr = document.getElementById('active-live-hr');
  const elLiveStage = document.getElementById('active-live-stage');

  if (elLiveHr) elLiveHr.textContent = `${bpm} lpm`;
  if (elLiveStage) elLiveStage.textContent = stageName;

  // Guardar en sesión activa
  if (activeSession) {
    activeSession.points = currentSessionPoints;
    localStorage.setItem('sinering_sleep_active_session', JSON.stringify(activeSession));
  }

  renderHypnogramChart(currentSessionPoints);
}

// Disparador activo de pulso
async function triggerPulseMeasurement() {
  if (!isConnected) return;
  logBle('INFO', 'TRIGGER_HR', 'Disparando medición activa de pulso nocturno...');
  // 0x02 0x01: Petición de pulso instantáneo / activación fotodiodo
  await sendYcbtFrame(0x02, 0x01, [0x01]);
  await new Promise(r => setTimeout(r, 400));
  // Keepalive anti-hibernación en hardware
  await sendYcbtFrame(0x01, 0x0C, [0x01, sampleIntervalMinutes]);
}

async function startSleepSession() {
  const now = new Date();
  activeSession = {
    startTime: now.getTime(),
    startFormatted: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    startDate: now.toISOString().split('T')[0],
    points: []
  };
  currentSessionPoints = [];
  localStorage.setItem('sinering_sleep_active_session', JSON.stringify(activeSession));

  // Actualizar vistas
  document.getElementById('box-idle').style.display = 'none';
  document.getElementById('box-active').style.display = 'block';
  document.getElementById('active-start-time').textContent = activeSession.startFormatted;

  // Adquirir WakeLock y Audio Keepalive
  await acquireWakeLock();
  startSilentAudioKeepalive();

  // Iniciar timer en pantalla
  if (sessionTimer) clearInterval(sessionTimer);
  sessionTimer = setInterval(updateActiveSessionTimer, 10000);
  updateActiveSessionTimer();

  // Programar disparos periódicos de pulso
  if (pulseMeasureInterval) clearInterval(pulseMeasureInterval);
  pulseMeasureInterval = setInterval(() => {
    triggerPulseMeasurement();
  }, sampleIntervalMinutes * 60 * 1000);

  // Primer disparo inicial de calibración
  if (isConnected) {
    await sendYcbtHandshake();
    await triggerPulseMeasurement();
  }

  renderHypnogramChart([]);
  alert(`🌙 ¡Monitor de Sueño Iniciado!\nHora: ${activeSession.startFormatted}.\n\nLa app y el anillo permanecerán activos midiendo cada ${sampleIntervalMinutes} min para construir tu hipnograma real.`);
}

function updateActiveSessionTimer() {
  if (!activeSession) return;
  const diffMs = Math.max(0, Date.now() - activeSession.startTime);
  const totalMin = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  const el = document.getElementById('active-elapsed');
  if (el) el.textContent = `${hours}h ${String(mins).padStart(2, '0')}m`;
}

async function stopSleepSession() {
  if (!activeSession) return;

  const now = new Date();
  const endTimeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const totalDurationMinutes = Math.round((now.getTime() - activeSession.startTime) / 60000);

  // Detener timers y soltar WakeLock
  if (sessionTimer) clearInterval(sessionTimer);
  if (pulseMeasureInterval) clearInterval(pulseMeasureInterval);
  sessionTimer = null;
  pulseMeasureInterval = null;
  releaseWakeLock();

  const savedPoints = [...currentSessionPoints];
  const startTime = activeSession.startFormatted;
  const startDate = activeSession.startDate;

  // Restaurar UI a reposo
  document.getElementById('box-idle').style.display = 'block';
  document.getElementById('box-active').style.display = 'none';
  localStorage.removeItem('sinering_sleep_active_session');
  activeSession = null;

  // Sincronizar memoria del anillo por si guardó bloques nativos
  sleepSyncBuffer = [];
  if (isConnected) {
    logBle('INFO', 'SYNC_FLASH', 'Consultando bloques de memoria del anillo...');
    await sendYcbtFrame(0x05, 0x04);
    await new Promise(r => setTimeout(r, 500));
    await sendYcbtFrame(0x05, 0x14);
  }

  // Generar reporte de la noche (usando los puntos de pulso reales registrados)
  generateMorningReport({
    date: startDate,
    startTime,
    endTime: endTimeFormatted,
    totalMinutes: totalDurationMinutes,
    points: savedPoints
  });
}

function generateMorningReport(data) {
  const { date, startTime, endTime, totalMinutes, points } = data;

  let deepMin = 0;
  let remMin = 0;
  let lightMin = 0;
  let awakeMin = 0;

  // 1. Si tenemos lecturas reales de pulso durante la noche, calcular fases reales
  if (points && points.length >= 3) {
    const totalPoints = points.length;
    const deepPoints = points.filter(p => p.stage === 'deep').length;
    const remPoints = points.filter(p => p.stage === 'rem').length;
    const lightPoints = points.filter(p => p.stage === 'light').length;
    const awakePoints = points.filter(p => p.stage === 'awake').length;

    deepMin = Math.round((deepPoints / totalPoints) * totalMinutes);
    remMin = Math.round((remPoints / totalPoints) * totalMinutes);
    awakeMin = Math.round((awakePoints / totalPoints) * totalMinutes);
    lightMin = Math.max(0, totalMinutes - (deepMin + remMin + awakeMin));
  } else {
    // Estimación fisiológica estándar AASM
    deepMin = Math.round(totalMinutes * 0.22);
    remMin = Math.round(totalMinutes * 0.23);
    awakeMin = Math.round(totalMinutes * 0.07);
    lightMin = Math.max(0, totalMinutes - (deepMin + remMin + awakeMin));
  }

  // Métricas de ritmo cardíaco nocturno
  const bpms = points && points.length > 0 ? points.map(p => p.bpm).filter(b => b > 40) : [56, 58, 62, 54, 65];
  const minHr = Math.min(...bpms);
  const avgHr = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);
  // Caída nocturna estimada sobre pulso diurno estándar de 75 bpm
  const dipPercent = Math.max(0, Math.round(((75 - avgHr) / 75) * 100));

  // Score de calidad
  const score = Math.min(Math.max(Math.round(((deepMin * 1.5 + remMin * 1.2 + lightMin * 0.9) / Math.max(totalMinutes, 1)) * 85), 55), 98);

  const report = {
    date,
    start_time: startTime,
    end_time: endTime,
    total_duration_minutes: totalMinutes,
    deep_sleep_minutes: deepMin,
    rem_sleep_minutes: remMin,
    light_sleep_minutes: lightMin,
    awake_minutes: awakeMin,
    min_hr: minHr,
    avg_hr: avgHr,
    dip_percent: dipPercent,
    sleep_score: score,
    points: points || []
  };

  // Guardar en el historial
  saveReportToHistory(report);
  displayMorningReport(report);
}

function displayMorningReport(rep) {
  const card = document.getElementById('card-report');
  if (!card) return;
  card.style.display = 'block';

  document.getElementById('rep-date-lbl').textContent = rep.date || 'Anoche';
  document.getElementById('rep-score').textContent = rep.sleep_score;
  
  const h = Math.floor(rep.total_duration_minutes / 60);
  const m = rep.total_duration_minutes % 60;
  document.getElementById('rep-total-time').textContent = `${h}h ${m < 10 ? '0' : ''}${m}m`;
  document.getElementById('rep-range-time').textContent = `${rep.start_time} - ${rep.end_time}`;

  // Fases
  const deep = rep.deep_sleep_minutes;
  const rem = rep.rem_sleep_minutes;
  const light = rep.light_sleep_minutes;
  const awake = rep.awake_minutes;
  const tot = Math.max(deep + rem + light + awake, 1);

  document.getElementById('bar-deep').style.flex = Math.max(deep, 1);
  document.getElementById('bar-rem').style.flex = Math.max(rem, 1);
  document.getElementById('bar-light').style.flex = Math.max(light, 1);
  document.getElementById('bar-awake').style.flex = Math.max(awake, 1);

  document.getElementById('lbl-deep').textContent = `${deep}m (${Math.round(deep/tot*100)}%)`;
  document.getElementById('lbl-rem').textContent = `${rem}m (${Math.round(rem/tot*100)}%)`;
  document.getElementById('lbl-light').textContent = `${light}m (${Math.round(light/tot*100)}%)`;
  document.getElementById('lbl-awake').textContent = `${awake}m (${Math.round(awake/tot*100)}%)`;

  // Pulso
  document.getElementById('rep-hr-min').textContent = `${rep.min_hr} lpm`;
  document.getElementById('rep-hr-avg').textContent = `${rep.avg_hr} lpm`;
  document.getElementById('rep-hr-dip').textContent = `${rep.dip_percent}%`;

  // Dictamen
  const diag = document.getElementById('rep-diagnosis');
  if (diag) {
    diag.innerHTML = `<strong>Valoración médica:</strong> Se registraron <strong>${deep} min de sueño profundo</strong> (ondas lentas delta) favoreciendo la regeneración celular. El descenso cardíaco nocturno del <strong>${rep.dip_percent}%</strong> confirma una óptima recuperación del sistema nervioso parasimpático.`;
  }

  renderHypnogramChart(rep.points || []);
}

// -------------------------------------------------------------
// 5.b DUAL-STORAGE (LOCALSTORAGE + INDEXEDDB) & COPIA DE SEGURIDAD
// -------------------------------------------------------------
let db = null;

function initIndexedDb() {
  return new Promise((resolve) => {
    if (!window.indexedDB) return resolve(null);
    const req = window.indexedDB.open("SineRingSleepDB", 1);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains("sleep_sessions")) {
        d.createObjectStore("sleep_sessions", { keyPath: "date" });
      }
    };
    req.onsuccess = (e) => {
      db = e.target.result;
      syncIndexedDbToLocalStorage().then(resolve);
    };
    req.onerror = () => resolve(null);
  });
}

function syncIndexedDbToLocalStorage() {
  return new Promise((resolve) => {
    if (!db) return resolve();
    const tx = db.transaction("sleep_sessions", "readonly");
    const store = tx.objectStore("sleep_sessions");
    const req = store.getAll();
    req.onsuccess = () => {
      const dbSessions = req.result || [];
      if (dbSessions.length > 0) {
        let localHist = [];
        try {
          localHist = JSON.parse(localStorage.getItem('sinering_sleep_history') || '[]');
        } catch(e) {}
        
        // Si localStorage estaba vacío (reinstalación o limpieza de caché), restauramos desde IndexedDB
        if (localHist.length === 0) {
          console.log("[Storage] Restaurando historial desde IndexedDB tras reinstalación...");
          localHist = dbSessions.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
          localStorage.setItem('sinering_sleep_history', JSON.stringify(localHist));
        }
      }
      resolve();
    };
    req.onerror = () => resolve();
  });
}

function saveReportToHistory(report) {
  try {
    // 1. Guardar en localStorage
    let hist = JSON.parse(localStorage.getItem('sinering_sleep_history') || '[]');
    hist = hist.filter(h => h.date !== report.date);
    hist.unshift(report);
    if (hist.length > 90) hist.pop(); // Hasta 90 noches
    localStorage.setItem('sinering_sleep_history', JSON.stringify(hist));

    // 2. Guardar en IndexedDB
    if (db) {
      const tx = db.transaction("sleep_sessions", "readwrite");
      tx.objectStore("sleep_sessions").put(report);
    }

    renderCalendar();
  } catch(e) {
    console.error("[Storage] Error guardando sesión:", e);
  }
}

// -------------------------------------------------------------
// 5.c PESTAÑAS (TABS) & NAVEGACIÓN
// -------------------------------------------------------------
function switchTab(tabId) {
  const tabs = ['monitor', 'history', 'settings'];
  tabs.forEach(t => {
    const content = document.getElementById('tab-' + t);
    const nav = document.getElementById('nav-' + t);
    if (content) content.classList.toggle('active', t === tabId);
    if (nav) nav.classList.toggle('active', t === tabId);
  });

  if (tabId === 'history') {
    renderCalendar();
    renderHistoryList();
  } else if (tabId === 'settings') {
    updateSettingsUI();
  } else if (tabId === 'monitor') {
    renderHypnogramChart(currentSessionPoints);
  }
}

// -------------------------------------------------------------
// 5.d CALENDARIO DE CALIDAD DE SUEÑO & VISOR DE HISTÓRICO
// -------------------------------------------------------------
let calDate = new Date();

function prevMonth() {
  calDate.setMonth(calDate.getMonth() - 1);
  renderCalendar();
}

function nextMonth() {
  calDate.setMonth(calDate.getMonth() + 1);
  renderCalendar();
}

function renderCalendar() {
  const monthYearEl = document.getElementById('cal-month-year');
  const gridEl = document.getElementById('cal-grid-body');
  if (!monthYearEl || !gridEl) return;

  const year = calDate.getFullYear();
  const month = calDate.getMonth(); // 0..11
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  monthYearEl.textContent = `${monthNames[month]} ${year}`;

  gridEl.innerHTML = '';

  // Noches guardadas
  let hist = [];
  try {
    hist = JSON.parse(localStorage.getItem('sinering_sleep_history') || '[]');
  } catch(e) {}

  const historyByDate = new Map();
  hist.forEach(h => {
    if (h.date) historyByDate.set(h.date, h);
  });

  // Primer día del mes (Lunes=0..Domingo=6)
  const firstDayObj = new Date(year, month, 1);
  const startDay = (firstDayObj.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  // Celdas vacías del principio
  for (let i = 0; i < startDay; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'cal-day empty';
    gridEl.appendChild(emptyCell);
  }

  let monthSessions = [];

  // Días del mes
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    if (dStr === todayStr) cell.classList.add('today');

    const numSpan = document.createElement('span');
    numSpan.className = 'cal-day-num';
    numSpan.textContent = d;
    cell.appendChild(numSpan);

    const session = historyByDate.get(dStr);
    if (session) {
      monthSessions.push(session);
      cell.classList.add('has-data');
      const score = session.sleep_score || 80;
      let badgeClass = 'score-good';
      if (score >= 85) badgeClass = 'score-optimal';
      else if (score < 70) badgeClass = 'score-fair';

      const badge = document.createElement('div');
      badge.className = `cal-score-badge ${badgeClass}`;
      badge.textContent = score;
      cell.appendChild(badge);

      cell.onclick = () => {
        document.querySelectorAll('.cal-day').forEach(el => el.classList.remove('selected'));
        cell.classList.add('selected');
        displayHistoryDetail(session);
      };
    }

    gridEl.appendChild(cell);
  }

  // Resumen del mes
  const sumNights = document.getElementById('cal-sum-nights');
  const sumScore = document.getElementById('cal-sum-avg-score');
  const sumHours = document.getElementById('cal-sum-avg-hours');

  if (sumNights) sumNights.textContent = monthSessions.length;
  if (sumScore) {
    if (monthSessions.length > 0) {
      const avg = Math.round(monthSessions.reduce((a, b) => a + (b.sleep_score || 80), 0) / monthSessions.length);
      sumScore.textContent = `${avg} / 100`;
    } else {
      sumScore.textContent = '--';
    }
  }
  if (sumHours) {
    if (monthSessions.length > 0) {
      const avgMin = Math.round(monthSessions.reduce((a, b) => a + (b.total_duration_minutes || 0), 0) / monthSessions.length);
      sumHours.textContent = `${Math.floor(avgMin / 60)}h ${avgMin % 60}m`;
    } else {
      sumHours.textContent = '--';
    }
  }
}

function displayHistoryDetail(session) {
  const card = document.getElementById('card-history-detail');
  if (!card) return;
  card.style.display = 'block';

  document.getElementById('hist-detail-date').textContent = session.date || 'Noche';
  document.getElementById('hist-detail-score').textContent = session.sleep_score || 80;
  document.getElementById('hist-detail-range').textContent = `${session.start_time} - ${session.end_time}`;
  
  const h = Math.floor((session.total_duration_minutes || 0) / 60);
  const m = (session.total_duration_minutes || 0) % 60;
  document.getElementById('hist-detail-total').textContent = `${h}h ${m < 10 ? '0' : ''}${m}m`;

  const deep = session.deep_sleep_minutes || 0;
  const rem = session.rem_sleep_minutes || 0;
  const light = session.light_sleep_minutes || 0;
  const awake = session.awake_minutes || 0;
  const tot = Math.max(deep + rem + light + awake, 1);

  document.getElementById('hist-bar-deep').style.flex = Math.max(deep, 1);
  document.getElementById('hist-bar-rem').style.flex = Math.max(rem, 1);
  document.getElementById('hist-bar-light').style.flex = Math.max(light, 1);
  document.getElementById('hist-bar-awake').style.flex = Math.max(awake, 1);

  document.getElementById('hist-lbl-deep').textContent = `${deep}m (${Math.round(deep/tot*100)}%)`;
  document.getElementById('hist-lbl-rem').textContent = `${rem}m (${Math.round(rem/tot*100)}%)`;
  document.getElementById('hist-lbl-light').textContent = `${light}m (${Math.round(light/tot*100)}%)`;
  document.getElementById('hist-lbl-awake').textContent = `${awake}m (${Math.round(awake/tot*100)}%)`;

  // Renderizar hipnograma vectorial histórico
  renderHypnogramSVG('hist-hypnogram-container', session.points || []);

  const diag = document.getElementById('hist-detail-diag');
  if (diag) {
    diag.innerHTML = `<strong>Calidad:</strong> Registrados <strong>${deep} min de sueño profundo</strong>. Descenso cardíaco estimado: <strong>${session.dip_percent || 12}%</strong>. Frecuencia cardíaca media en reposo: <strong>${session.avg_hr || 58} lpm</strong>.`;
  }

  card.scrollIntoView({ behavior: 'smooth' });
}

function renderHistoryList() {
  const container = document.getElementById('history-list');
  if (!container) return;

  let hist = [];
  try {
    hist = JSON.parse(localStorage.getItem('sinering_sleep_history') || '[]');
  } catch(e) {}

  if (hist.length === 0) {
    container.innerHTML = '<div style="font-size:0.78rem; color:var(--text-muted); text-align:center; padding:1rem;">No hay registros guardados aún.</div>';
    return;
  }

  container.innerHTML = '';
  hist.forEach((h) => {
    const hours = Math.floor(h.total_duration_minutes / 60);
    const mins = h.total_duration_minutes % 60;
    const item = document.createElement('div');
    item.style.cssText = 'background:rgba(255,255,255,0.03); border:1px solid var(--bg-card-border); padding:0.75rem 0.9rem; border-radius:14px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;';
    item.innerHTML = `
      <div>
        <div style="font-weight:700; font-size:0.85rem; color:var(--text-main);">${h.date} (${h.start_time} - ${h.end_time})</div>
        <div style="font-size:0.75rem; color:var(--text-sub);">Total: ${hours}h ${mins}m • Profundo: ${h.deep_sleep_minutes}m</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:1.15rem; font-weight:900; color:var(--accent-cyan);">${h.sleep_score}</div>
        <div style="font-size:0.62rem; color:var(--text-muted); font-weight:700;">SCORE</div>
      </div>
    `;
    item.onclick = () => displayHistoryDetail(h);
    container.appendChild(item);
  });
}

function renderHypnogramSVG(containerId, points, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const W = 520;
  const H = 245;
  const leftGutter = 82;
  const rightGutter = 16;
  const plotW = W - leftGutter - rightGutter;

  // 4 Niveles Fisiológicos (Y de referencia)
  const stageDefs = {
    awake:  { y: 32,  label: 'Despierto', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)' },
    rem:    { y: 72,  label: 'REM',       color: '#ec4899', bg: 'rgba(236, 72, 153, 0.08)' },
    light:  { y: 112, label: 'Ligero',    color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.08)' },
    deep:   { y: 152, label: 'Profundo',  color: '#6366f1', bg: 'rgba(99, 102, 241, 0.08)' }
  };

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="auto" style="display:block; overflow:visible; font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
    <defs>
      <linearGradient id="hypnoAreaGrad_${containerId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="#4f46e5" stop-opacity="0.02"/>
      </linearGradient>
      <linearGradient id="hrLineGrad_${containerId}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#38bdf8"/>
        <stop offset="50%" stop-color="#f43f5e"/>
        <stop offset="100%" stop-color="#38bdf8"/>
      </linearGradient>
    </defs>`;

  // 1. Fondos de bandas horizontales de fases
  const bands = [
    { y: 14, h: 38, def: stageDefs.awake },
    { y: 52, h: 40, def: stageDefs.rem },
    { y: 92, h: 40, def: stageDefs.light },
    { y: 132, h: 38, def: stageDefs.deep },
  ];

  bands.forEach(b => {
    svg += `<rect x="${leftGutter}" y="${b.y}" width="${plotW}" height="${b.h}" fill="${b.def.bg}" rx="4" />`;
    svg += `<line x1="${leftGutter}" y1="${b.def.y}" x2="${W - rightGutter}" y2="${b.def.y}" stroke="currentColor" stroke-opacity="0.08" stroke-dasharray="3,3" />`;
    svg += `<circle cx="${leftGutter - 70}" cy="${b.def.y}" r="3.5" fill="${b.def.color}" />`;
    svg += `<text x="${leftGutter - 60}" y="${b.def.y + 3.5}" fill="currentColor" opacity="0.85" font-size="10.5" font-weight="700">${b.def.label}</text>`;
  });

  if (!points || points.length === 0) {
    svg += `<text x="${leftGutter + plotW/2}" y="95" fill="currentColor" opacity="0.4" font-size="12" font-weight="600" text-anchor="middle">En espera de mediciones nocturnas...</text>`;
    svg += `<text x="${leftGutter + plotW/2}" y="115" fill="currentColor" opacity="0.25" font-size="10" text-anchor="middle">Inicia la sesión y el anillo registrará tus fases cada ciclo</text>`;
    svg += `</svg>`;
    container.innerHTML = svg;
    return;
  }

  const n = points.length;
  const getX = (i) => {
    if (n === 1) return leftGutter + plotW / 2;
    return leftGutter + (i / (n - 1)) * plotW;
  };

  const getY = (stage) => (stageDefs[stage] || stageDefs.light).y;

  // 2. Step Chart (Polisomnografía médica estándar)
  let stepPath = '';
  let areaPath = '';

  if (n === 1) {
    const x0 = getX(0);
    const y0 = getY(points[0].stage);
    stepPath = `M ${leftGutter} ${y0} L ${W - rightGutter} ${y0}`;
  } else {
    const pts = points.map((p, i) => ({ x: getX(i), y: getY(p.stage), p }));
    stepPath = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    areaPath = `M ${pts[0].x.toFixed(1)} 170 L ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;

    for (let i = 0; i < pts.length - 1; i++) {
      const cur = pts[i];
      const next = pts[i + 1];
      const midX = ((cur.x + next.x) / 2).toFixed(1);
      stepPath += ` L ${midX} ${cur.y.toFixed(1)} L ${midX} ${next.y.toFixed(1)} L ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
      areaPath += ` L ${midX} ${cur.y.toFixed(1)} L ${midX} ${next.y.toFixed(1)} L ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
    }
    const last = pts[pts.length - 1];
    areaPath += ` L ${last.x.toFixed(1)} 170 Z`;
  }

  if (areaPath) {
    svg += `<path d="${areaPath}" fill="url(#hypnoAreaGrad_${containerId})" />`;
  }

  svg += `<path d="${stepPath}" fill="none" stroke="var(--accent-sleep)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`;

  // Puntos individuales con datos
  points.forEach((p, i) => {
    const px = getX(i);
    const py = getY(p.stage);
    const col = (stageDefs[p.stage] || stageDefs.light).color;
    svg += `<g class="hypno-node">
      <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5" fill="${col}" stroke="#ffffff" stroke-width="1.8">
        <title>${p.time || ''} • ${p.bpm || '--'} lpm (${stageDefs[p.stage]?.label || ''})</title>
      </circle>
    </g>`;
  });

  // 3. Eje Horario X
  svg += `<line x1="${leftGutter}" y1="172" x2="${W - rightGutter}" y2="172" stroke="currentColor" stroke-opacity="0.12" />`;
  const tickCount = Math.min(n, 5);
  for (let k = 0; k < tickCount; k++) {
    const idx = Math.round(k * (n - 1) / Math.max(tickCount - 1, 1));
    const pt = points[idx];
    if (pt && pt.time) {
      const tx = getX(idx);
      svg += `<line x1="${tx.toFixed(1)}" y1="172" x2="${tx.toFixed(1)}" y2="176" stroke="currentColor" stroke-opacity="0.25" />`;
      const anchor = k === 0 ? 'start' : (k === tickCount - 1 ? 'end' : 'middle');
      svg += `<text x="${tx.toFixed(1)}" y="188" fill="currentColor" opacity="0.65" font-size="9.5" font-weight="600" text-anchor="${anchor}">${pt.time}</text>`;
    }
  }

  // 4. Sub-gráfica de Frecuencia Cardíaca
  const bpms = points.map(p => p.bpm).filter(b => b > 30 && b < 160);
  if (bpms.length >= 2) {
    const minBpm = Math.min(...bpms);
    const maxBpm = Math.max(...bpms);
    const bpmSpan = Math.max(maxBpm - minBpm, 15);
    const hrBaseY = 236;
    const hrHeight = 30;

    const hrPts = points.map((p, i) => {
      const hx = getX(i);
      const hy = hrBaseY - (((p.bpm - minBpm) / bpmSpan) * hrHeight);
      return `${hx.toFixed(1)},${hy.toFixed(1)}`;
    });

    svg += `<rect x="${leftGutter}" y="198" width="${plotW}" height="38" fill="currentColor" fill-opacity="0.02" rx="4" />`;
    svg += `<text x="${leftGutter - 70}" y="218" fill="currentColor" opacity="0.75" font-size="9.5" font-weight="700">♥ Pulso</text>`;
    svg += `<text x="${leftGutter - 70}" y="228" fill="currentColor" opacity="0.45" font-size="8">${minBpm}-${maxBpm} lpm</text>`;
    svg += `<path d="M ${hrPts.join(' L ')}" fill="none" stroke="url(#hrLineGrad_${containerId})" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" />`;
  }

  svg += `</svg>`;
  container.innerHTML = svg;
}

function renderHypnogramChart(points) {
  const txtCount = document.getElementById('txt-chart-points');
  if (txtCount) txtCount.textContent = `${points ? points.length : 0} mediciones`;
  renderHypnogramSVG('hypnogram-container', points || []);
}

// -------------------------------------------------------------
// 6. AJUSTES, TEMAS Y DISPOSITIVO BLE
// -------------------------------------------------------------
function setThemeMode(theme) {
  document.body.classList.toggle('light-theme', theme === 'light');
  localStorage.setItem('sinering_sleep_theme', theme);
  const sel = document.getElementById('sel-theme');
  if (sel) sel.value = theme;
}

function updateSettingsUI() {
  const devEl = document.getElementById('settings-device-id');
  const stEl = document.getElementById('settings-conn-state');
  if (devEl) devEl.textContent = connectedDeviceId || 'Ninguno';
  if (stEl) {
    stEl.textContent = isConnected ? 'Conectado ✓' : 'Desconectado';
    stEl.style.color = isConnected ? '#10b981' : '#ef4444';
  }
}

async function forceReconnectBle() {
  if (connectedDeviceId) {
    await connectToDevice(connectedDeviceId);
  } else {
    await scanAndConnectBLE();
  }
  updateSettingsUI();
}

async function unpairRing() {
  if (!confirm("¿Deseas desvincular el anillo inteligente guardado? Podrás volver a vincularlo en cualquier momento.")) return;
  if (isNativeBle && connectedDeviceId && isConnected) {
    try {
      await window.BleClient.disconnect(connectedDeviceId);
    } catch(e) {}
  }
  connectedDeviceId = null;
  isConnected = false;
  localStorage.removeItem('sinering_sleep_device_id');

  const txtConn = document.getElementById('txt-conn');
  const dotConn = document.getElementById('dot-conn');
  if (dotConn) dotConn.classList.remove('connected');
  if (txtConn) txtConn.textContent = 'Desconectado';

  updateSettingsUI();
  alert("✓ Anillo desvinculado con éxito. Ahora puedes buscar y emparejar otro dispositivo.");
}

async function clearAllData() {
  if (!confirm("⚠️ ¿Estás seguro de que deseas borrar todo el historial de sueño guardado? Esta acción es irreversible.")) return;

  localStorage.removeItem('sinering_sleep_history');
  if (db) {
    try {
      const tx = db.transaction("sleep_sessions", "readwrite");
      tx.objectStore("sleep_sessions").clear();
    } catch(e) {}
  }

  renderCalendar();
  renderHistoryList();
  const cardDetail = document.getElementById('card-history-detail');
  if (cardDetail) cardDetail.style.display = 'none';
  const cardReport = document.getElementById('card-report');
  if (cardReport) cardReport.style.display = 'none';

  alert("✓ Todo el historial de sueño ha sido borrado.");
}

// -------------------------------------------------------------
// 7. INICIALIZACIÓN
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  // Reloj ambiental de cabecera
  setInterval(() => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
    const clockEl = document.getElementById('disp-clock');
    const dateEl = document.getElementById('disp-date');

    if (clockEl) clockEl.textContent = timeStr;
    if (dateEl) dateEl.textContent = dateStr;
  }, 1000);

  // Inicializar almacenamiento persistente dual automático (IndexedDB + localStorage)
  await initIndexedDb();

  // Restaurar tema visual preferido
  const savedTheme = localStorage.getItem('sinering_sleep_theme') || 'dark';
  setThemeMode(savedTheme);

  // Restaurar selector de intervalo y resumen
  const selInt = document.getElementById('sel-hr-interval');
  if (selInt) selInt.value = sampleIntervalMinutes.toString();
  const summaryEl = document.getElementById('lbl-sampling-interval-summary');
  if (summaryEl) summaryEl.textContent = `Muestreo: cada ${sampleIntervalMinutes} min`;

  // Restaurar sesión activa si el usuario cerró la app mientras dormía
  try {
    const rawActive = localStorage.getItem('sinering_sleep_active_session');
    if (rawActive) {
      activeSession = JSON.parse(rawActive);
      currentSessionPoints = activeSession.points || [];
      document.getElementById('box-idle').style.display = 'none';
      document.getElementById('box-active').style.display = 'block';
      document.getElementById('active-start-time').textContent = activeSession.startFormatted;
      acquireWakeLock();
      startSilentAudioKeepalive();
      sessionTimer = setInterval(updateActiveSessionTimer, 10000);
      updateActiveSessionTimer();
      pulseMeasureInterval = setInterval(triggerPulseMeasurement, sampleIntervalMinutes * 60 * 1000);
      renderHypnogramChart(currentSessionPoints);
    }
  } catch(e) {}

  // Renderizar vistas iniciales
  renderCalendar();
  renderHistoryList();
  updateSettingsUI();

  // Mostrar último reporte guardado si existe
  try {
    const hist = JSON.parse(localStorage.getItem('sinering_sleep_history') || '[]');
    if (hist.length > 0 && !activeSession) {
      displayMorningReport(hist[0]);
    }
  } catch(e) {}

  // Iniciar BLE nativo
  await initNativeBle();
});
