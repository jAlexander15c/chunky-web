/* Campanita de avisos (cocina y pagina del pedido), generada con WebAudio: no necesita archivos. */

let audioContext: AudioContext | null = null;
// Al volver de segundo plano iOS puede dejar el audio "running" pero mudo: se rehace en el siguiente toque
let isStale = false;

/**
 * En iPad el audio web respeta el interruptor de silencio: como "playback" suena igual que un video,
 * aunque la tablet este en silencio (Safari 17+). En otros navegadores no existe y no pasa nada.
 */
const setPlaybackAudioSession = () => {
    const audioSession = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (audioSession && audioSession.type !== "playback") audioSession.type = "playback";
};

/** iOS solo da el audio por desbloqueado si algo empieza a sonar dentro del toque: una muestra muda basta. */
const playSilence = (context: AudioContext) => {
    const source = context.createBufferSource();
    source.buffer = context.createBuffer(1, 1, 22050);
    source.connect(context.destination);
    source.start(0);
};

/** Crea o reanuda el audio. Solo funciona dentro de un toque (touchend, click o tecla), no en pointerdown. */
export const unlockChimeSound = async () => {
    try {
        setPlaybackAudioSession();
        if (audioContext && isStale) {
            audioContext.close().catch(() => null);
            audioContext = null;
        }
        isStale = false;
        audioContext ??= new AudioContext();
        playSilence(audioContext);
        if (audioContext.state !== "running") await audioContext.resume();
        return audioContext.state === "running";
    } catch {
        return false;
    }
};

/** Al volver a la pagina: reanuda sin crear nada (fuera de un toque iOS no deja) y rehace el audio en el siguiente toque. */
export const resumeChimeSound = async () => {
    try {
        if (!audioContext) return false;
        isStale = true;
        if (audioContext.state !== "running") await audioContext.resume();
        return audioContext.state === "running";
    } catch {
        return false;
    }
};

export const isChimeSoundOn = () => audioContext?.state === "running";

/** Tres notas ascendentes. Devuelve false si el audio no esta activo. */
export const playChime = () => {
    if (!audioContext || audioContext.state !== "running") return false;

    const start = audioContext.currentTime;
    [880, 1175, 1568].forEach((frequency, index) => {
        const oscillator = audioContext!.createOscillator();
        const gain = audioContext!.createGain();
        const noteStart = start + index * 0.18;

        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.9, noteStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.45);
        oscillator.connect(gain).connect(audioContext!.destination);
        oscillator.start(noteStart);
        oscillator.stop(noteStart + 0.5);
    });
    return true;
};
