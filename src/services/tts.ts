type SpeakParams = {
  text: string;
  language: "fil-PH" | "ceb-PH";
};

/**
 * Optional TTS layer. If platform/runtime does not support it, fail soft.
 */
export async function speakAlert(params: SpeakParams): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return false;
    }

    const utterance = new SpeechSynthesisUtterance(params.text);
    utterance.lang = params.language;
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}
