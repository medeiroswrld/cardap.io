import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone">
      <h1>Esse cardápio ainda não está por aqui.</h1>
      <p>Confira o endereço ou conheça o restaurante de demonstração.</p>
      <Link className="button button-primary" href="/r/demo">
        Abrir demonstração
      </Link>
    </main>
  );
}
