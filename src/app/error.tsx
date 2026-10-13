"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone">
      <h1>Não foi possível carregar agora.</h1>
      <p>
        Confira sua conexão e tente novamente. Sua sacola continua salva neste
        navegador.
      </p>
      <button className="button button-primary" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  );
}
