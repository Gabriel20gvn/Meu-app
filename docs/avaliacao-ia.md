# Avaliação da transcrição de bateria

## Decisão atual

Não contratar um serviço ainda. O objetivo é transcrever a gravação com viradas, toms e pratos, e não apenas uma levada simplificada. A aplicação agora consegue comparar resultados MIDI de diferentes ferramentas com o áudio original. Ainda não executa um modelo de IA e não extrai áudio do YouTube.

## Candidatos

| Caminho | Evidência disponível | Limites e pendências |
| --- | --- | --- |
| Serviço especializado, candidato Klangio/Drum2Notes | É a referência escolhida pelo usuário. | Confirmar oferta atual da API, suporte específico a bateria, peças reconhecidas, exportação, precisão, preço, limites de duração e condições de uso. A documentação de `api.klang.io` e `klang.io` não pôde ser consultada neste ambiente: o proxy respondeu 403. Não há chave configurada. Nenhum endpoint de transcrição foi presumido ou implementado. |
| Omnizart executado em servidor próprio | O README oficial documenta `omnizart drum transcribe` e modelos prontos. O código de inferência consultado exporta somente bumbo (35), caixa (38) e chimbal (42). | Não atende sozinho ao requisito de transcrição completa das viradas e peças. Serve como referência experimental para três classes. Exige instalar dependências, baixar modelos, medir desempenho e verificar licença dos pesos; não foi instalado nem executado nesta etapa. |
| MIDI produzido por outra ferramenta | Importação e sincronização implementadas no app, sem chave nem backend. | O arquivo já precisa existir; isto não é geração de partitura por IA. Canal 10 General MIDI, 4/4, grade visual de semicolcheias. |

## Fontes efetivamente consultadas

- [Omnizart — README oficial](https://github.com/Music-and-Culture-Technology-Lab/omnizart): transcrição de bateria, checkpoints e aviso sobre problemas no treinamento do modelo de bateria do zero.
- [Inferência de bateria](https://github.com/Music-and-Culture-Technology-Lab/omnizart/blob/master/omnizart/drum/inference.py): `get_3inst_ary` e saída MIDI de três peças. Não confundir a representação intermediária de 13 classes com as três classes exportadas.
- [Configuração do modelo](https://github.com/Music-and-Culture-Technology-Lab/omnizart/blob/master/omnizart/defaults/drum.yaml): limiares de bumbo, caixa e chimbal.
- [Licença do código](https://github.com/Music-and-Culture-Technology-Lab/omnizart/blob/master/LICENSE): MIT. Não estabelece por si só direitos sobre datasets, pesos ou músicas.

## Ensaio comparativo antes da contratação

Usar trechos autorizados de 30–60 segundos: bateria isolada, música completa com voz e baixo, viradas com toms, chimbal aberto/fechado, pratos simultâneos e mudança de andamento. Guardar uma anotação humana de referência.

Medir por peça a precisão/recall/F1 de ataques com tolerância temporal explícita (por exemplo ±50 ms, sem misturar notas de peças diferentes), erros de andamento/compasso, peças omitidas, minutos de correção manual, tempo de processamento e custo por minuto. Avaliar a partitura com um baterista, além das métricas. Não há medições ou preços confirmados nesta etapa.

## Arquitetura após a escolha

Áudio autorizado → backend com tarefa assíncrona → serviço/modelo selecionado → eventos originais + mapa de tempo/compassos → revisão e partitura → reprodução do áudio original.

Chaves ficam somente no servidor. Antes de enviar arquivos a um fornecedor, indicar essa transmissão na interface. Letras e identificação de seções exigem avaliação própria; nesta versão elas são marcadas manualmente. Uma API de transcrição de bateria não resolve automaticamente essas duas tarefas.

## Recomendação

Validar primeiro uma API especializada que cubra toms, pratos e viradas. O Omnizart consultado é um baseline limitado, não a escolha para cumprir a transcrição fiel. Não treinar do zero antes de comparar resultados existentes. A transcrição automática continua pendente da validação e escolha do provedor/modelo e de seu acesso.
