import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "../locales/en-US/translation.json";
import zh from "../locales/zh-CN/translation.json";

export const defaultNS = "translation";

export const resources = {
  "en-US": { translation: en },
  "zh-CN": { translation: zh },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "zh-CN",
    defaultNS,
    detection: {
      lookupLocalStorage: "app-language",
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false, // React 已默认做 XSS 转义
    },
    returnNull: false,
  });

// 同步 <html lang> 属性以支持 a11y（屏幕阅读器等辅助技术）
i18n.on("languageChanged", (lng) => {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
  }
});
// 初始化时设置
if (typeof document !== "undefined") {
  document.documentElement.lang = i18n.language;
}

export default i18n;
