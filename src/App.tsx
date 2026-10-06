import { LoginScreen } from "./auth/LoginScreen";
import { useSession } from "./auth/session-store";
import type { BuildInfo } from "./build-info";
import { MainScreen } from "./chat/MainScreen";

interface AppProps {
  build: BuildInfo;
}

export function App({ build }: AppProps) {
  const screen = useSession((s) => s.screen);

  switch (screen) {
    case "checking":
      return (
        <main>
          <p>Проверяем инстанс…</p>
        </main>
      );
    case "signedIn":
      return <MainScreen />;
    case "signedOut":
      return <LoginScreen build={build} />;
  }
}
