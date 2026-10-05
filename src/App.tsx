import styles from "./App.module.css";
import { formatVersion, type BuildInfo } from "./build-info";

interface AppProps {
  build: BuildInfo;
}

export function App({ build }: AppProps) {
  const version = formatVersion(build);

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>GREEN-API WhatsApp Chat</h1>
      <p className={styles.note}>
        This is an early skeleton of the project. The chat is not available yet.
      </p>
      <p className={styles.version}>
        Version{" "}
        {build.builtAt === null ? (
          <span>{version}</span>
        ) : (
          <time dateTime={build.builtAt}>{version}</time>
        )}
      </p>
    </main>
  );
}
