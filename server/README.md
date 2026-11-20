# Processador pessoal do Compasso

Recebe um link do YouTube ou MP3/WAV, executa **ADTOF → detecção de pulsação/compassos → MIDI alinhado** e devolve a partitura ao aplicativo. Funciona em um servidor separado do GitHub Pages, mesmo com o computador do usuário desligado. Não é um serviço já contratado ou ativado.

O projeto `compasso-b1121` também tem uma opção de [Cloud Run sob demanda](../cloud/google/README.md), preparada mas ainda não ativada.

## Ativar na nuvem

O arquivo [`render.yaml`](../render.yaml) prepara a implantação no Render com Docker, um processo de IA por vez e disco persistente. **O plano `standard` e o disco são pagos.** Confira os valores apresentados pelo Render antes de confirmar a criação. Não há uma conta ou cobrança criada por este repositório.

1. Abra [Deploy to Render](https://render.com/deploy?repo=https://github.com/Gabriel20gvn/Meu-app), entre na sua conta e autorize o acesso ao repositório `Gabriel20gvn/Meu-app`.
2. Revise o Blueprint, o plano e o disco. Crie o serviço somente após concordar com o custo. O primeiro build instala os modelos e pode levar vários minutos.
3. Quando o serviço estiver ativo, copie seu endereço HTTPS, como `https://compasso-ia-xxxx.onrender.com`. A rota `/api/health` deve responder `{"status":"ok"}`.
4. No painel **Environment** do serviço, copie o valor gerado de `COMPASSO_API_TOKEN`. Guarde-o privadamente; não coloque a chave no GitHub, no link nem no chat.
5. Abra o [Compasso](https://gabriel20gvn.github.io/Meu-app/), cole um link e toque em **Gerar partitura**. Na primeira vez, informe **Endereço do processador** e **Chave de acesso**. Também pode abrir uma música e usar **⋮ → Configurar processador**.

O endereço fica salvo no navegador. Por segurança, a chave fica em `sessionStorage`: recarregar a aba a preserva, mas uma nova sessão do navegador pode pedir a chave novamente. Para trocar de hospedagem, altere o endereço nesse mesmo menu. Não é necessário alterar o código da página.

O Blueprint restringe as chamadas do navegador a `https://gabriel20gvn.github.io`. Para outro domínio, ajuste `COMPASSO_ALLOWED_ORIGINS` (origens sem caminhos, separadas por vírgula). A autenticação continua obrigatória. A imagem também serve a interface em `/`, caso queira usar o endereço do próprio processador.

## Como usar

**Nova música → link → Gerar partitura**. O padrão estima BPM e início dos compassos. Em **Ajustes opcionais**, um BPM conhecido entre 40 e 240 restringe a busca ao redor desse valor (±10%); não redefine artificialmente os tempos das notas. Não é necessário escolher colcheia ou semicolcheia: a grade admite subdivisões até semicolcheias e mantém figuras maiores.

O progresso mostra fila, preparação do áudio, identificação da bateria e organização dos compassos. Fechar a janela não cancela o trabalho; abra novamente a música e toque em **Gerar partitura** (ou **⋮ → Gerar novamente** se já houver uma partitura) para retomar. **Cancelar análise** interrompe o processo no servidor. Uma análise concluída é salva no navegador ao retomar.

Se o YouTube não disponibilizar o áudio ao servidor, a tela oferece **Enviar áudio e gerar**. Use MP3/WAV da mesma gravação, com o mesmo início. O vídeo continua sendo reproduzido pelo player oficial; o servidor usa o áudio temporariamente apenas para análise. Restrições do YouTube podem impedir o caminho pelo link mesmo com yt-dlp atualizado; não se promete acesso a todos os vídeos.

Limites desta versão:

- Áudio de 5 segundos a 15 minutos, até 80 MB; três pedidos ativos/na fila, um processamento por vez.
- Compasso 4/4; grade até semicolcheias; máximo de 500 compassos e 20 mil notas. Tercinas e outros compassos ainda não são representados corretamente.
- ADTOF agrupa as peças em cinco famílias. Precisão de notas, andamento e início do compasso depende da gravação; não há garantia de acerto automático em toda música.
- A introdução é preservada no MIDI, incluindo compassos antes do primeiro golpe. O marcador de alinhamento é aplicado automaticamente pelo app.
- As gravações temporárias são removidas após conclusão, falha ou cancelamento. MIDI e resumo ficam disponíveis por cerca de 24 horas (limpeza periódica); a cópia já salva no navegador permanece.
- Reiniciar/atualizar o servidor interrompe trabalhos ativos e pede nova tentativa. O disco mantém os resultados concluídos. Use **um único worker e uma única instância**, pois a fila pessoal é local a esse processo.

ADTOF é usado aqui para testes pessoais conforme sua licença [CC BY-NC-SA 4.0](https://github.com/MZehren/ADTOF). A letra e a identificação de seções não são geradas nesta etapa.

## Executar com Docker

No Windows, o [iniciador incluido no projeto](../README.md) automatiza os comandos abaixo e abre o app no navegador.

```sh
docker build -f server/Dockerfile -t compasso-ia .
```

Crie um arquivo `.env` local (ignorado pelo Git):

```dotenv
COMPASSO_API_TOKEN=SUBSTITUA_POR_UMA_CHAVE_ALEATORIA_DE_PELO_MENOS_24_CARACTERES
COMPASSO_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Gere a chave, por exemplo, com `python -c "import secrets; print(secrets.token_urlsafe(32))"`. Depois:

```sh
docker run --rm --name compasso-ia --env-file .env -p 8000:8000 -v compasso-data:/data compasso-ia
```

No aplicativo local, configure `http://localhost:8000`. Um celular precisa de um endpoint HTTPS acessível a ele; `localhost` no celular aponta para o próprio celular. Para uso com o PC desligado, use a implantação na nuvem.

Python 3.10, TensorFlow/Keras 2.15 e NumPy 1.23 estão fixados para compatibilidade com ADTOF/madmom. Deno, FFmpeg e os modelos são instalados na imagem. Não substitua por Python 3.13/Keras 3 sem adaptar e testar o pipeline. Se a hospedagem interromper o processo por falta de memória, reduza a duração da gravação ou revise a memória do plano.

## API e verificação

Todas as rotas `/api/`, exceto `/api/health`, exigem `Authorization: Bearer <chave>`.

| Rota | Uso |
| --- | --- |
| `GET /api/connection` | Verificar chave e conexão |
| `POST /api/jobs` | JSON `{ "video_id": "ID_DE_11_CAR", "bpm": null }` |
| `POST /api/jobs/upload` | Multipart: `video_id`, `bpm` opcional e `audio` |
| `GET /api/jobs/{id}` | Estado, erro legível e resumo quando concluído |
| `GET /api/jobs/{id}/result` | MIDI final |
| `DELETE /api/jobs/{id}` | Cancelar |

O servidor aceita somente IDs do YouTube validados, sem URL arbitrária de download. Limites de tamanho e chave são verificados antes de aceitar o corpo. A fila limita concorrência e mata o subprocesso de inferência ao cancelar ou ultrapassar 30 minutos.

Testes leves da API/fila, sem executar o modelo (instale também `httpx` para o TestClient):

```sh
python -m unittest discover -s server -p 'test_*.py'
python -m unittest discover -s colab -p 'test_*.py'
```

`e2e/generation.spec.js` verifica geração, erro, upload, autenticação, cancelamento, retomada e preservação da partitura anterior com respostas de servidor simuladas. A validação real do pipeline requer executar a imagem com um áudio conhecido; testes de interface não comprovam precisão musical nem acesso real ao YouTube.
