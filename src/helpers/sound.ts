/* Campanita de avisos (cocina y pagina del pedido), generada con WebAudio: no necesita archivos. */

let audioContext: AudioContext | null = null;

/** Crea o reanuda el audio. En iOS solo funciona dentro de un toque del usuario. */
export const unlockChimeSound = async () => {
    try {
        audioContext ??= new AudioContext();
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
        gain.gain.exponentialRampToValueAtTime(0.5, noteStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.45);
        oscillator.connect(gain).connect(audioContext!.destination);
        oscillator.start(noteStart);
        oscillator.stop(noteStart + 0.5);
    });
    return true;
};
