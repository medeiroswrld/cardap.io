import Link from "next/link";
export default function Page() {
  return (
    <main className="standalone prose">
      <Link href="/r/demo">← Voltar ao cardápio</Link>
      <h1>Seus dados, com clareza</h1>
      <p>
        Esta é uma demonstração. Nome, telefone, sacola, pedidos e preferências
        são armazenados somente no navegador deste dispositivo. Não informe
        dados pessoais reais para testar.
      </p>
      <h2>Identificação para atendimento</h2>
      <p>
        O nome, WhatsApp e mesa identificam o pedido. Informar um telefone não
        cria uma conta nem libera o histórico de outra pessoa.
      </p>
      <p>
        Em pedidos para entrega, o endereço informado (rua, número, complemento,
        referência e bairro) é usado apenas para entregar o pedido e fica visível
        somente para a equipe do restaurante e para você, neste navegador.
      </p>
      <h2>Novidades são uma escolha</h2>
      <p>
        A autorização para ofertas é opcional e vem desmarcada. Você pode pedir
        sem aceitá-la. Na demonstração, a revogação está disponível na área de
        gestão, em Contatos; nenhum envio de mensagem está implementado.
      </p>
      <h2>Apagar os dados de demonstração</h2>
      <p>
        Apague os dados deste site nas configurações do seu navegador. Isso
        remove pedidos, sacola, contatos e configurações locais.
      </p>
      <h2>Antes de uma operação real</h2>
      <p>
        O restaurante responsável precisa informar seu canal de privacidade,
        prazos de retenção e procedimentos de atendimento aos titulares. A
        integração conectada não está habilitada nesta demonstração.
      </p>
    </main>
  );
}
