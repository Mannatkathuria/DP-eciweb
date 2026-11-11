// The interface languages, in one place for the header, the entry page and the selector.
// `voice` is the speech-synthesis language for Read aloud.

export const LANGUAGES = [
  { code: "en", label: "English", voice: "en-IN" },
  { code: "hi", label: "हिन्दी", voice: "hi-IN" },
  { code: "bn", label: "বাংলা", voice: "bn-IN" },
  { code: "mr", label: "मराठी", voice: "mr-IN" },
  { code: "te", label: "తెలుగు", voice: "te-IN" },
  { code: "ta", label: "தமிழ்", voice: "ta-IN" },
  { code: "gu", label: "ગુજરાતી", voice: "gu-IN" },
  { code: "kn", label: "ಕನ್ನಡ", voice: "kn-IN" },
  { code: "ml", label: "മലയാളം", voice: "ml-IN" },
  { code: "pa", label: "ਪੰਜਾਬੀ", voice: "pa-IN" },
  { code: "or", label: "ଓଡ଼ିଆ", voice: "or-IN" },
];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);
export const voiceFor = (code) => LANGUAGES.find((l) => l.code === code)?.voice ?? "en-IN";
