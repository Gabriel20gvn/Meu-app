# Compasso

App experimental de partitura de bateria para celular e computador. A prioridade é acompanhar a gravação original, com partitura, seções e referências de letra.

## Estado atual — música real, sem transcrição automática

- Importa MP3/WAV/OGG e outros formatos de áudio aceitos pelo navegador (até 80 MB e 30 minutos).
- Importa MIDI de bateria correspondente à gravação: canal 10 General MIDI, 4/4, até 5 MB, 20 mil notas e aproximadamente 500 compassos.
- Desenha as notas importadas com VexFlow, incluindo peças de toms e pratos suportadas; não substitui a transcrição por uma levada pronta.
- Usa o áudio original como relógio de reprodução. Oferece play, pausa, busca, repetição, navegação por compasso, rolagem automática e ajuste de sincronização em segundos.
- Seletor de 1, 2 ou 4 compassos por linha, salvo por música neste navegador. Para 4 compassos no celular, prefira a orientação horizontal.
- Permite marcar seções e pequenos trechos da letra manualmente nos tempos da gravação.
- Salva áudio, MIDI interpretado e marcações localmente em IndexedDB. Não envia arquivos a terceiros. Os dados não sincronizam entre dispositivos e podem ser perdidos ao limpar os dados do navegador.
- Salva links do YouTube e oferece **Reproduzir vídeo** dentro do app, pelo player oficial, sem downloader ou chave de API. Links salvos em versões anteriores continuam funcionando.
- Mantém a demonstração sintetizada, os vídeos do YouTube e as músicas locais com MIDI em telas separadas.

**Não há backend nem serviço de IA conectado.** O player do YouTube permite ouvir o vídeo, e sincronizar a partitura de um MIDI importado; não extrai áudio nem transcreve a bateria automaticamente. O MIDI deve ser produzido por uma ferramenta externa e corresponder à gravação. Sem MIDI, o app permite escutar o áudio e marcar seções, mas não inventa uma partitura.

A notação importada usa grade de semicolcheias; informa quantos ataques foram arredondados. Tercinas, microvariações, outros compassos e edição de notas ainda não estão disponíveis. Mudanças de andamento do MIDI são preservadas na sincronização. Arquivos sem indicação de compasso assumem 4/4 e exibem aviso. A precisão musical depende do arquivo importado; testes automatizados não demonstram qualidade de uma IA.

## YouTube com partitura MIDI

Na versão publicada: **Nova música → cole o link → Salvar link → Reproduzir vídeo**. Os controles nativos do YouTube incluem play, pausa, busca, volume e tela cheia. A página mantém **Abrir no YouTube** como alternativa. Ao voltar à biblioteca, o iframe é removido e a reprodução para.

Após abrir o vídeo, toque em **Importar MIDI de bateria** e selecione o `.mid` ou `.midi` da mesma gravação. O botão dá lugar à partitura. O relógio do player oficial guia o destaque dos compassos, inclusive após buscar ou pausar pelo YouTube; tocar em um compasso busca esse momento no vídeo. A partitura tem rolagem própria para manter o vídeo visível.

O menu **⋮** reúne troca de MIDI, ajuste de sincronização em segundos, 1/2/4 compassos por linha e rolagem automática. O MIDI interpretado e esses ajustes ficam associados ao ID do vídeo em IndexedDB neste navegador, separados das gravações locais. Um deslocamento positivo atrasa a partitura; versões diferentes da música podem exigir outro MIDI. A tela do YouTube ainda não oferece marcações de seção/letra nem loop de trecho.

A sincronização usa a IFrame Player API oficial, com `enablejsapi=1` e `origin` do site. O app não adiciona controles de reprodução duplicados. Ao sair, destrói o player e interrompe a atualização do marcador. Se o YouTube ou sua API estiverem bloqueados, a partitura continua disponível, mas a sincronização depende da conexão com o player. Testes de integração usam uma API simulada; não comprovam streaming real do YouTube.

O vídeo é carregado somente ao tocar em Reproduzir vídeo. O navegador então se conecta ao YouTube e usa seu player oficial. Não há yt-dlp, Deno, download de arquivos ou processamento de IA nesse fluxo. Autoplay pode ser bloqueado pelo navegador; nesse caso, toque no Play do próprio player. Vídeos privados, removidos ou com restrição à incorporação podem não funcionar dentro do app.

Use o site HTTPS publicado ou um servidor HTTP local. Abrir um HTML por `file://` pode não fornecer o Referer exigido pelo YouTube (erro 153). O iframe envia `strict-origin-when-cross-origin`, preserva os controles oficiais e tem altura mínima de 200px. A escolha do vídeo aceita somente IDs validados; não incorpora HTML arbitrário.

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
- `src/session-store.js`: persistência local IndexedDB.
- `src/audio.js`, `src/music.js`: demonstração sintetizada.
- `test/`, `e2e/`: testes de regras e de navegador.
- `docs/avaliacao-ia.md`: comparação preliminar e plano de avaliação.

## Escolha da IA

Ainda não há provedor contratado. Veja [avaliação de IA](docs/avaliacao-ia.md). O Omnizart consultado gera apenas três peças na saída atual de bateria; não atende sozinho a viradas completas. A oferta atual de uma API especializada como a Klangio precisa ser confirmada. Não foram presumidos preços, rotas de API ou níveis de precisão.
