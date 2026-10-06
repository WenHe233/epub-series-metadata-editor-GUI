import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { en, zh } from "./messages";
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { "zh-CN": { translation: zh }, "en-US": { translation: en } },
    supportedLngs: ["zh-CN", "en-US"],
    fallbackLng: "zh-CN",
    interpolation: { escapeValue: false },
  });
export default i18n;
