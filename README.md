# Compasso

App experimental de partitura de bateria para celular e computador. A prioridade é acompanhar a gravação original, com partitura, seções e referências de letra.

## Estado atual — transcrição de bateria com processador pessoal

- Importa MP3/WAV/OGG e outros formatos de áudio aceitos pelo navegador (até 80 MB e 30 minutos).
- Importa MIDI de bateria correspondente à gravação: canal 10 General MIDI, 4/4, até 5 MB, 20 mil notas e aproximadamente 500 compassos.
- Desenha as notas importadas com VexFlow, incluindo peças de toms e pratos suportadas; não substitui a transcrição por uma levada pronta.
- Usa o áudio original como relógio de reprodução. Oferece play, pausa, busca, repetição, navegação por compasso, rolagem automática e ajuste de sincronização em segundos.
- Visualização alternativa **Grade de bateria**, com fundo escuro, peças em linhas, golpes `x`/`o` e contagem de semicolcheias. A preferência fica salva por música; Partitura continua sendo o padrão.
- Seletor de 1, 2 ou 4 compassos por linha, salvo por música neste navegador. Para 4 compassos no celular, prefira a orientação horizontal.
- Permite marcar seções e pequenos trechos da letra manualmente nos tempos da gravação.
- Salva MIDI interpretado, ajustes e marcações localmente em IndexedDB. Gravações importadas para reprodução local ficam no navegador. Ao solicitar geração automática, o link ou o áudio escolhido é enviado ao processador configurado. Os dados locais não sincronizam entre dispositivos e podem ser perdidos ao limpar os dados do navegador.
- Salva links do YouTube e oferece **Reproduzir vídeo** dentro do app, pelo player oficial, sem precisar de chave da API do YouTube. Links salvos em versões anteriores continuam funcionando.
- Mantém a demonstração sintetizada, os vídeos do YouTube e as músicas locais com MIDI em telas separadas.

**A geração automática precisa de um processador na nuvem configurado.** O repositório inclui esse servidor: ADTOF identifica os golpes, madmom estima pulsação e início dos compassos, e o exportador mantém a introdução e o alinhamento no MIDI. O GitHub Pages hospeda a interface; sozinho não executa esses modelos. A hospedagem do processador não é criada automaticamente ao publicar o app. Veja [como ativar o processador](server/README.md).

Na interface: **Nova música → colar link → Gerar partitura**. Deixe BPM automático ou informe um valor conhecido em **Ajustes opcionais**. A tela acompanha as etapas reais, permite cancelar e retomar uma análise em andamento. Se o YouTube não liberar o áudio, oferece envio de MP3/WAV da mesma gravação. Ao concluir, salva e abre a partitura junto ao vídeo. Uma falha na geração preserva a partitura anterior. A chave de acesso é solicitada ao conectar o processador e fica apenas na sessão da aba, fora do código publicado.

A notação importada usa grade de semicolcheias; informa quantos ataques foram arredondados. Tercinas, microvariações, outros compassos e edição de notas ainda não estão disponíveis. Mudanças de andamento do MIDI são preservadas na sincronização. Arquivos sem indicação de compasso assumem 4/4 e exibem aviso. A precisão musical depende do arquivo importado; testes automatizados não demonstram qualidade de uma IA.

## YouTube com partitura MIDI

Na versão publicada: **Nova música → cole o link → Salvar link → Reproduzir vídeo**. Os controles nativos do YouTube incluem play, pausa, busca, volume e tela cheia. A página mantém **Abrir no YouTube** como alternativa. Ao voltar à biblioteca, o iframe é removido e a reprodução para.

Após abrir o vídeo, toque em **Importar MIDI de bateria** e selecione o `.mid` ou `.midi` da mesma gravação. O botão dá lugar à partitura. O relógio do player oficial guia o destaque dos compassos, inclusive após buscar ou pausar pelo YouTube; tocar em um compasso busca esse momento no vídeo. A partitura tem rolagem própria para manter o vídeo visível.

O menu **⋮ → Visualização** permite escolher **Partitura** ou **Grade de bateria**. Nas gravações locais, use o seletor **Visualização** ao lado de Compassos por linha. A troca preserva MIDI, andamento, offset e posição do áudio/vídeo.

A grade agrupa as peças por família: Cr (crash/pratos), Rd (ride), Ch (chimbal), Cx (caixa/aro), Ta (tom agudo), Tm (tom médio/grave), Su (surdo) e Bu (bumbo). Pandeiro (Pd) e cowbell (Cb) aparecem quando presentes no MIDI. Golpes simultâneos ficam na mesma coluna; variações da mesma família compartilham o símbolo, com os nomes no tooltip e na descrição acessível. Para manter a leitura, compassos da grade têm largura mínima e rolagem lateral quando necessário. O marcador acompanha tanto na horizontal quanto na vertical. A grade usa a mesma quantização em semicolcheias da partitura e não corrige detecção, BPM ou compasso.

O menu **⋮** também reúne troca de MIDI, ajuste de sincronização em segundos, 1/2/4 compassos por linha e rolagem automática. O MIDI interpretado e esses ajustes ficam associados ao ID do vídeo em IndexedDB neste navegador, separados das gravações locais. Um deslocamento positivo atrasa a partitura; versões diferentes da música podem exigir outro MIDI. A tela do YouTube ainda não oferece marcações de seção/letra nem loop de trecho.

A sincronização usa a IFrame Player API oficial, com `enablejsapi=1` e `origin` do site. O app não adiciona controles de reprodução duplicados. Ao sair, destrói o player e interrompe a atualização do marcador. Se o YouTube ou sua API estiverem bloqueados, a partitura continua disponível, mas a sincronização depende da conexão com o player. Testes de integração usam uma API simulada; não comprovam streaming real do YouTube.

O vídeo é carregado ao abrir a tela de estudo (por Reproduzir vídeo ou após gerar a partitura). O navegador então se conecta ao YouTube e usa seu player oficial. A reprodução usa apenas o player oficial. Quando você solicita a geração, o servidor usa yt-dlp/Deno para obter temporariamente o áudio e executar a IA; isso pode falhar em vídeos ou redes com restrições. O navegador não precisa baixar a música manualmente. Autoplay pode ser bloqueado pelo navegador; nesse caso, toque no Play do próprio player. Vídeos privados, removidos ou com restrição à incorporação podem não funcionar dentro do app.

Use o site HTTPS publicado ou um servidor HTTP local. Abrir um HTML por `file://` pode não fornecer o Referer exigido pelo YouTube (erro 153). O iframe envia `strict-origin-when-cross-origin`, preserva os controles oficiais e tem altura mínima de 200px. A escolha do vídeo aceita somente IDs validados; não incorpora HTML arbitrário.

## Colab com alinhamento automático

Abra [ADTOF automático no Colab](https://colab.research.google.com/github/Gabriel20gvn/Meu-app/blob/main/colab/ADTOF-automatico.ipynb) e salve uma cópia no Drive. Execute as quatro células: instalar, enviar MP3/WAV, transcrever bateria e analisar/exportar. A quarta célula usa o rastreador de batidas e inícios de compasso do madmom em 4/4. Não há campos obrigatórios de BPM, fator ou início do compasso. O ADTOF continua produzindo os golpes; o rastreador musical produz a grade temporal.

Os compassos da introdução são preservados mesmo antes da primeira nota de bateria. A origem da grade é escolhida próxima ao início da gravação, em vez de remover a introdução e transferi-la para um deslocamento grande. Notas antecipadas continuam preservadas.

O MIDI contém mudanças de andamento para preservar os tempos das batidas detectadas e o marcador `COMPASSO_SYNC_V1:<segundos>` no tick zero da primeira faixa. Ao importar ou substituir esse MIDI, o app aplica o alinhamento automaticamente em sessões de YouTube e áudio local. MIDI convencional sem esse marcador preserva o ajuste manual existente (zero em uma nova sessão). O menu continua permitindo correções quando necessárias.

Use a mesma gravação **com o mesmo início** do vídeo. O alinhamento do MIDI se refere ao áudio enviado ao Colab; ele não reconhece introduções diferentes entre arquivos. A detecção é uma estimativa em 4/4, pode interpretar pulsação/compasso de forma errada, e não garante correção para todos os gêneros. Notas fora do intervalo rastreado são mantidas mediante extrapolação dos primeiros/últimos intervalos. Notas não são deslocadas pelo exportador: sua posição temporal é preservada até a resolução do MIDI. A visualização no app continua quantizando para semicolcheias.

`colab/auto_rhythm.py` contém o rastreador/exportador embutido no notebook. Os testes Python (`python -m unittest discover -s colab -p 'test_*.py'`, no ambiente do notebook) verificam mudanças de andamento, notas anteriores à grade, offsets positivos/negativos e preservação dos tempos. Também foi executado um teste de rastreamento com áudio sintético; isso não comprova precisão em músicas reais.

## Testar sem instalar ferramentas

A entrega `compasso-musica-real.html` é gerada por `npm run build:standalone` (resultado em `dist-single/index.html`). Abra esse arquivo no Chrome/Edge e selecione **Importar áudio e MIDI**. O MIDI é opcional para testar áudio e marcações. Use arquivos próprios ou autorizados. Fontes visuais externas são opcionais; o app possui fallback.

O build único foi validado em Chromium servido por HTTP; a política do Chromium deste ambiente bloqueia navegação `file://`, portanto a abertura direta em Windows não foi verificada aqui.

Para GitHub Pages, publique o HTML único renomeado como `index.html`. Alternativamente publique o conteúdo de `dist/` após `npm run build`. A branch `gh-pages` recebe o HTML pronto para publicação; em Settings → Pages, use Deploy from a branch, `gh-pages`, `/ (root)`. A branch `main` contém o código-fonte.

## Desenvolver no Windows

Instale Node.js 22.12+ (testado com 24.22.1). Baixe e extraia o ZIP do projeto. Abra a pasta extraída que contém `package.json`; clique na barra de endereço do Explorador, digite `powershell` e pressione Enter. Execute:

```powershell
npm ci
npm run dev -- --port 5173
```

Depois abra `http://localhost:5173` no navegador do mesmo PC. O terminal deve ficar aberto. **Não use `/workspace/Meu-app` no seu Windows:** esse caminho só existe no ambiente da conversa. Ao clonar o GitHub, use a branch `main` para desenvolver.

## Ambiente desta conversa

```sh
cd /workspace/Meu-app
npm ci --cache /tmp/compasso-npm-cache
npm run dev -- --port 5173
```

Cada tarefa em nuvem já é isolada. Reutilize este checkout; não crie worktrees salvo solicitação explícita. Processos devem reiniciar a cada sessão.

## Testes e builds

```sh
npm test
npm run build
npm run build:standalone
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

Em outro ambiente: `npx playwright install chromium`, seguido de `npm run test:e2e` sem `CHROMIUM_PATH`. Testes verificam importação, rejeição de MIDI incompatível, tempo/offset, marcações, reprodução, persistência, interface móvel e regressão da demonstração. Os arquivos de teste são sintéticos, não saídas de um modelo de IA.

## Estrutura

- `src/main.js`: biblioteca, demonstração e tela do YouTube.
- `src/youtube.js`, `src/youtube-session.js` e `src/youtube.css`: player oficial, importação MIDI, sincronização e layout responsivo.
- `src/real-session.js`: importação de gravação, reprodução e marcações reais.
- `src/transcription.js`: interpretação de MIDI, tempo e validação.
- `src/score-renderer.js`: notação VexFlow e posição do marcador.
- `src/drum-grid.js`, `src/score-view.js` e `src/score-view.css`: grade por instrumento e alternância de visualização.
- `src/session-store.js`: persistência local IndexedDB.
- `src/generation.js`, `src/generation-api.js`: geração, conexão, progresso, retomada e alternativa de upload.
- `server/`: API autenticada, fila de um processamento por vez, ADTOF/madmom e imagem Docker.
- `render.yaml`: configuração revisável de implantação na nuvem; inclui plano pago e disco persistente.
- `src/audio.js`, `src/music.js`: demonstração sintetizada.
- `test/`, `e2e/`: testes de regras e de navegador.
- `docs/avaliacao-ia.md`: comparação preliminar e plano de avaliação.

## Escolha da IA

O processador usa ADTOF para estes testes pessoais. A licença do projeto é CC BY-NC-SA 4.0; o uso comercial futuro exigirá reavaliação. A saída do modelo agrupa golpes em cinco famílias (bumbo, caixa, chimbal, toms e pratos); não identifica cada peça e articulação como uma transcrição humana completa. O reconhecimento de letra e seções ainda não faz parte da análise automática. A [avaliação de alternativas](docs/avaliacao-ia.md) permanece como referência exploratória, anterior a esta integração.
