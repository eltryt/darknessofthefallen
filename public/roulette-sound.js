// Roulette sounds, synthesised with the Web Audio API: no audio files to download. The
// wheel rumbles, the ball whirs and ticks over the frets, bounces and drops into the
// pocket; the countdown beeps and the result plays a slot-machine jingle. Browsers only
// allow sound after a click on the page, so the context is unlocked on the first one.
const KEY = 'dotf-roulette-sound';

export function createSound() {
	let ctx = null,
		master = null,
		noise = null,
		enabled = true;
	try {
		enabled = localStorage.getItem(KEY) !== 'off';
	} catch {}

	const ready = () => {
		if (!ctx) {
			const Context = window.AudioContext || window.webkitAudioContext;
			if (!Context) return null;
			ctx = new Context();
			// One second of white noise, reused by every rumble, whir and click.
			noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
			const data = noise.getChannelData(0);
			for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
		}
		if (!master) {
			// Loud enough over game music, with a limiter so the fanfare never clips.
			const limiter = ctx.createDynamicsCompressor();
			limiter.threshold.value = -6;
			limiter.ratio.value = 12;
			limiter.connect(ctx.destination);
			master = ctx.createGain();
			master.gain.value = 4;
			master.connect(limiter);
		}
		return enabled && ctx.state === 'running' ? ctx : null;
	};
	const noiseSource = (loop = false) => {
		const s = ctx.createBufferSource();
		s.buffer = noise;
		s.loop = loop;
		return s;
	};
	// A short percussive click: filtered noise through a fast envelope.
	const click = (at, { gain = 0.08, freq = 3200, q = 1.2, length = 0.012 } = {}) => {
		const s = noiseSource(),
			f = ctx.createBiquadFilter(),
			g = ctx.createGain();
		f.type = 'bandpass';
		f.frequency.value = freq * (0.9 + Math.random() * 0.2);
		f.Q.value = q;
		g.gain.setValueAtTime(gain, at);
		g.gain.exponentialRampToValueAtTime(0.0001, at + length);
		s.connect(f).connect(g).connect(master);
		s.start(at, Math.random() * 0.9, length + 0.02);
	};
	const tone = (at, freq, length, { type = 'square', gain = 0.06, slide } = {}) => {
		const o = ctx.createOscillator(),
			g = ctx.createGain();
		o.type = type;
		o.frequency.setValueAtTime(freq, at);
		if (slide) o.frequency.exponentialRampToValueAtTime(slide, at + length);
		g.gain.setValueAtTime(0.0001, at);
		g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
		g.gain.exponentialRampToValueAtTime(0.0001, at + length);
		o.connect(g).connect(master);
		o.start(at);
		o.stop(at + length + 0.02);
	};

	return {
		get enabled() {
			return enabled;
		},
		// Called on any click in the roulette: browsers start audio only after a gesture.
		unlock() {
			ready();
			if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
		},
		setEnabled(on) {
			enabled = on;
			try {
				localStorage.setItem(KEY, on ? 'on' : 'off');
			} catch {}
			if (!on) this.stop();
			else this.unlock();
		},
		// Cuts whatever is playing (the "skip" button, or sound switched off).
		stop() {
			if (!master) return;
			const old = master,
				t = ctx.currentTime;
			old.gain.setValueAtTime(old.gain.value, t);
			old.gain.linearRampToValueAtTime(0, t + 0.08);
			setTimeout(() => old.disconnect(), 200);
			master = null;
		},
		countdown(n) {
			if (!ready()) return;
			const t = ctx.currentTime;
			tone(t, n > 1 ? 880 : 1320, n > 1 ? 0.09 : 0.18, { type: 'triangle', gain: 0.09 });
		},
		// One spin of `ms`: the timings follow the ball's keyframes in roulette.js
		// (it leaves the rim at 62 % and bounces at 74, 80, 88 and 93 %).
		spin(ms) {
			if (!ready()) return;
			const t = ctx.currentTime,
				d = ms / 1000,
				rim = d * 0.62;
			// The wheel: a low wooden rumble that slows down.
			const rumble = noiseSource(true),
				lp = ctx.createBiquadFilter(),
				rg = ctx.createGain();
			lp.type = 'bandpass';
			lp.frequency.value = 140;
			lp.Q.value = 0.8;
			rumble.playbackRate.setValueAtTime(1.3, t);
			rumble.playbackRate.exponentialRampToValueAtTime(0.5, t + d);
			rg.gain.setValueAtTime(0.0001, t);
			rg.gain.exponentialRampToValueAtTime(0.35, t + 0.25);
			rg.gain.exponentialRampToValueAtTime(0.0001, t + d);
			rumble.connect(lp).connect(rg).connect(master);
			rumble.start(t);
			rumble.stop(t + d + 0.05);
			// The ball running on the rim: a bright whir that fades as it slows.
			const whir = noiseSource(true),
				bp = ctx.createBiquadFilter(),
				wg = ctx.createGain();
			bp.type = 'bandpass';
			bp.frequency.setValueAtTime(2600, t);
			bp.frequency.exponentialRampToValueAtTime(1400, t + rim);
			bp.Q.value = 3;
			wg.gain.setValueAtTime(0.0001, t);
			wg.gain.exponentialRampToValueAtTime(0.08, t + 0.15);
			wg.gain.exponentialRampToValueAtTime(0.0001, t + rim);
			whir.connect(bp).connect(wg).connect(master);
			whir.start(t);
			whir.stop(t + rim + 0.05);
			// Ticks on the rim, further apart as the ball loses speed.
			for (let at = 0.05, gap = 0.035; at < rim; at += gap, gap *= 1.045)
				click(t + at, { gain: 0.12, freq: 4200 });
			// Bounces over the frets, then the drop into the pocket.
			[
				[0.74, 0.22],
				[0.8, 0.16],
				[0.88, 0.12],
				[0.93, 0.08],
			].forEach(([k, gain]) => {
				click(t + d * k, { gain, freq: 1900, q: 2, length: 0.04 });
				tone(t + d * k, 1700, 0.05, { type: 'triangle', gain: gain / 4, slide: 900 });
			});
			click(t + d - 0.02, { gain: 0.25, freq: 900, q: 1.5, length: 0.07 });
		},
		// The result: a slot-machine fanfare and a shower of coins.
		win() {
			if (!ready()) return;
			const t = ctx.currentTime + 0.05;
			[523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5].forEach((f, i) =>
				tone(t + i * 0.09, f, 0.12, { gain: 0.05 }),
			);
			for (let i = 0; i < 14; i++) {
				const at = t + 0.66 + i * 0.065 + Math.random() * 0.02;
				tone(at, 1900 + Math.random() * 900, 0.18, { type: 'sine', gain: 0.045 });
				tone(at, 3800 + Math.random() * 600, 0.1, { type: 'sine', gain: 0.02 });
			}
			[1046.5, 1318.5, 1568].forEach((f) =>
				tone(t + 1.65, f, 0.9, { type: 'triangle', gain: 0.05 }),
			);
		},
	};
}
