# Google Cloud para o projeto compasso-b1121

Configuração preparada para manter a tela no [GitHub Pages](https://gabriel20gvn.github.io/Meu-app/) e executar o ADTOF sob demanda no Google Cloud. O projeto Firebase e o projeto Google Cloud compartilham o ID `compasso-b1121`.

**Preparar os arquivos não ativa a hospedagem.** Esta implantação precisa de faturamento habilitado na sua conta. O ID do projeto não dá acesso à conta e não foi usado para contratar recursos.

## 1. Conferir, ainda sem criar recursos

Abra o [Google Cloud Shell neste projeto](https://shell.cloud.google.com/?project=compasso-b1121). É um terminal no navegador, diferente do PowerShell do Windows. Execute:

```sh
git clone https://github.com/Gabriel20gvn/Meu-app.git compasso-google
cd compasso-google
bash cloud/google/deploy.sh --check
```

Se já tiver essa pasta de uma tentativa anterior, entre nela e execute `git pull --ff-only` antes do último comando.

Esse comando mostra o plano e consulta projeto/faturamento. **Não habilita APIs, não cria servidor e não gera música.** É esperado informar faturamento desativado enquanto o projeto estiver no Spark; nesse caso retorna código 3. Para apenas ler o plano, sem consultar a conta, use `bash cloud/google/deploy.sh --plan`.

## 2. Revisar a configuração e os custos

| Recurso | Configuração inicial |
| --- | --- |
| API Cloud Run | 1 CPU, 512 MiB, mínimo zero e máximo uma instância; CPU durante as requisições |
| Análise em Cloud Run Jobs | 1 CPU, 2 GiB, uma tarefa por execução, limite de dez minutos, zero repetições automáticas |
| Limites no aplicativo | Uma análise por vez, três tentativas/dia, áudio de até cinco minutos e 25 MiB |
| Firestore | Banco Native `(default)`; estado dos pedidos e controle de uso; resultados expiram após 24 horas |
| Cloud Storage | Bucket privado para áudio temporário e MIDI; remoção por ciclo de vida após um dia |
| Artifact Registry | Imagens da API e do modelo; preserva a imagem mais recente de cada tipo |
| Cloud Build | Prepara as imagens quando você executa a implantação |
| Secret Manager | Uma chave privada para conectar o aplicativo à API |
| Região | `us-central1`, incluindo bucket e novo banco Firestore |

As três tentativas incluem falhas e cancelamentos. A renovação ocorre às 00h UTC (21h de Brasília). Consultar progresso e baixar um resultado não consome uma tentativa de análise. O limite é transacional: vale para todas as abas e instâncias da API, e não depende do armazenamento do navegador.

O limite de upload fica abaixo do limite de requisição HTTP do Cloud Run. Para músicas maiores em WAV, use MP3 ou um trecho menor neste piloto. Os limites atuais de escrita continuam 4/4 e semicolcheias.

**Franquias gratuitas não garantem custo zero.** CPU/memória, banco, operações de armazenamento, transferência, builds, logs e segredos podem ser cobrados conforme a utilização e a região. Imagens e segredos armazenados podem custar mesmo sem análises. O tamanho da imagem do ADTOF deve entrar na conta; não use “0 MB de contêineres” na calculadora como previsão do nosso app. Exclusões por ciclo de vida e TTL não são instantâneas.

Os limites acima reduzem o consumo do aplicativo, mas não fixam um teto financeiro da conta. Alertas de orçamento avisam sobre gasto; não interrompem automaticamente a cobrança. Antes de ativar, revise [Cloud Run](https://cloud.google.com/run/pricing), [Artifact Registry](https://cloud.google.com/artifact-registry/pricing), [Cloud Build](https://cloud.google.com/build/pricing) e [Firebase](https://firebase.google.com/pricing).

O script usa buckets exclusivos deste aplicativo e desativa a retenção por soft delete neles para evitar manter cópias de áudio apagadas. Não habilita objetos públicos. O navegador não acessa Firestore/Storage diretamente; as contas de serviço da API e do worker usam IAM. Se você já tiver outro aplicativo/banco/bucket nesse projeto, revise os nomes e a política de retenção antes de aplicar.

## 3. Ativar somente depois da revisão

Se optar pelo teste pago por consumo, vincule uma conta de faturamento ao projeto (por exemplo, selecionando Blaze no Firebase). A ativação ocorre na sua conta. O script não vincula faturamento por conta própria.

No mesmo Cloud Shell, o comando que **cria/atualiza recursos potencialmente cobrados** é:

```sh
bash cloud/google/deploy.sh --apply
```

Ele cria contas de serviço separadas, dá ao seu usuário permissão para usá-las, cria armazenamento privado, segredo, imagens, Job e API. Não cria chaves JSON de conta de serviço. Não analisa nenhuma música automaticamente. Builds e implantação podem levar vários minutos. Se uma etapa falhar, o comando para e pode deixar recursos já criados; leia a falha antes de tentar novamente, porque repetir a construção também pode gerar custo.

O script foi escrito para o Google Cloud Shell com `gcloud` atualizado. Só a execução autenticada no projeto poderá confirmar permissões, políticas da organização e disponibilidade dos serviços. Não altere permissões para públicas caso a organização rejeite a implantação; a API usa acesso HTTP público com chave própria, e o Job permanece privado.

## 4. Conectar ao Compasso

Ao concluir, o terminal mostra o endereço HTTPS da API. No app, abra uma música e use **⋮ → Configurar processador**:

- **Endereço:** URL mostrada pelo comando, sem `/api` no final.
- **Chave:** valor da versão mais recente de `compasso-access-token`, disponível no [Secret Manager do projeto](https://console.cloud.google.com/security/secret-manager?project=compasso-b1121).

Digite a chave diretamente no aplicativo; não a publique nem a envie no chat. O aplicativo guarda o endereço no navegador e a chave somente na sessão da aba.

Comece com um trecho conhecido de até um minuto. Confira a partitura, o tempo gasto e o consumo no painel de faturamento (os valores podem aparecer com atraso). Depois avalie uma música completa. O YouTube pode bloquear o acesso a partir do servidor; nesse caso use o upload do áudio da mesma gravação, preservando o início.

## Funcionamento e interrupções

A API apenas registra o pedido e solicita uma execução de Cloud Run Jobs. Ela pode desligar após responder. Um worker reivindica o pedido em uma transação do Firestore, executa o mesmo ADTOF/alinhamento do Colab, salva o MIDI privado no bucket e termina. Consultas usam o estado durável; não dependem do disco de uma instância do Cloud Run.

Cancelar muda o estado no Firestore. O worker verifica o cancelamento, encerra seu subprocesso e libera a vaga. A vaga permanece ocupada durante o encerramento para impedir duas inferências simultâneas. Em caso de queda abrupta ou resposta ambígua da API de execução, a reserva pode durar até vinte minutos; o próximo acesso reconhece sua expiração. Uma execução duplicada não reivindica um trabalho já iniciado.

O áudio temporário é removido após o processamento e também possui expiração no bucket para cobrir falhas abruptas. MIDI e estado ficam disponíveis por aproximadamente 24 horas. O app salva a partitura no navegador quando abre a análise concluída; isto ainda não é uma biblioteca com login e sincronização completa entre dispositivos.

## Suspender o teste

Para bloquear novas análises pela interface, remova a permissão de executar o Job da conta da API no IAM do Job `compasso-transcribe`, ou exclua o serviço `compasso-api` no console. Confira também se existe alguma execução em andamento e cancele-a. Parar análises não apaga imagens, objetos ou segredos armazenados: revise esses recursos no projeto para encerrar custos de armazenamento. Não exclua todo o projeto se ele contiver outros aplicativos.

## Testes locais

`server/test_cloud.py` verifica o fluxo API/worker com uma simulação transacional do Firestore, armazenamento e execução simulados. A rotina do modelo em `server/worker.py` também foi executada por meio do novo worker com áudio sintético, produzindo um MIDI de dez notas. O emulador do Firestore está configurado em `firebase-emulator.json`, mas o download dele foi bloqueado neste ambiente; integração com o Firestore real e implantação ainda dependem do teste autenticado na sua conta. Os testes locais não geraram cobrança.
