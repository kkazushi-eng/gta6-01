// Synthesised sound: no audio files, everything is WebAudio oscillators and noise.
// Engine hum follows the player's speed, sirens wail while wanted, and a tiny bassline
// loops under the game. The first user gesture unlocks the audio context.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = 0;
  let musicStep = 0;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, lowpass) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass || 1200;
    const gain = ctx.createGain();
    gain.gain.value = vol || 0.3;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
  }

  // A slow minor-key bassline: A1, C2, E2, G1, one note a beat, 100 bpm.
  const BASS = [55, 65.41, 82.41, 49, 55, 65.41, 98, 82.41];
  function musicTick(dt) {
    if (!ctx || muted) return;
    musicTimer -= dt;
    if (musicTimer > 0) return;
    musicTimer += 0.6;
    const note = BASS[musicStep % BASS.length];
    musicStep += 1;
    blip(note, 0.5, 'triangle', 0.10);
    if (musicStep % 4 === 1) blip(note * 2, 0.25, 'sine', 0.05);
  }

  return {
    unlock,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    /** Called every frame with the driving state, so hum and siren track the game. */
    update(dt, speedRatio, wanted) {
      if (!ctx || muted) return;
      if (engineGain) {
        engineGain.gain.value = speedRatio > 0.02 ? 0.03 + speedRatio * 0.05 : 0;
        engineOsc.frequency.value = 55 + speedRatio * 130;
      }
      if (sirenGain) {
        const on = wanted > 0;
        sirenGain.gain.value = on ? 0.035 : 0;
        if (on) sirenOsc.frequency.value = 650 + Math.sin(performance.now() / 380) * 220;
      }
      musicTick(dt);
    },
    shoot() { noise(0.12, 0.35, 2500); blip(180, 0.08, 'square', 0.12, 60); },
    punch() { noise(0.08, 0.2, 800); },
    crash() { noise(0.25, 0.4, 600); },
    pickup() { blip(880, 0.12, 'sine', 0.18, 1320); },
    cash() { blip(660, 0.09, 'sine', 0.16); blip(990, 0.14, 'sine', 0.16); },
    mission() {
      blip(523, 0.14, 'triangle', 0.2);
      setTimeout(() => blip(659, 0.14, 'triangle', 0.2), 130);
      setTimeout(() => blip(784, 0.28, 'triangle', 0.22), 260);
    },
    fail() { blip(220, 0.3, 'sawtooth', 0.14, 110); },
    sirenBlip() { blip(950, 0.1, 'sine', 0.1, 700); },
    start() { if (started) return; unlock(); started = true; },
  };
}
