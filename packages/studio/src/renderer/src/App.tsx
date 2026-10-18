import { useEffect } from "react";
import { IntlProvider } from "react-intl";
import { Welcome } from "./components/Welcome";
import { Workspace } from "./components/Workspace";
import { MESSAGES, intlLocale } from "./i18n";
import { useStudio } from "./store";
import { useTheme } from "./theme";

export function App() {
  const settings = useStudio((s) => s.settings);
  const root = useStudio((s) => s.root);
  useTheme();

  useEffect(() => {
    void useStudio.getState().init();
  }, []);

  const lang = settings?.language ?? "en";
  useEffect(() => {
    document.documentElement.lang = intlLocale(lang);
  }, [lang]);

  if (!settings) return null;
  return (
    <IntlProvider
      locale={intlLocale(lang)}
      messages={MESSAGES[lang]}
      defaultLocale="en"
      onError={(e) => {
        // A missing message is a bug the i18n check should have caught; log it, keep running.
        console.warn(e.message);
      }}
    >
      {root ? <Workspace /> : <Welcome />}
    </IntlProvider>
  );
}
