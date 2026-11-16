# Passagem manual Codex → Claude

REGRA VIGENTE: Adson revogou a parada automatica das 17h20. Codex continua A; passagem ao Claude somente quando Adson decidir manualmente. O prompt abaixo preserva a versao original, cujos cortes por horario estao substituidos por esta correcao.

## Checkpoint atual — antes da integracao B

HEAD de A: `a2fa80e39b9468eeb5d7b7db2cb859db1ca86a98`; branch `delivery/adson-20261115`. Frontend salvo nesse commit; operacao, README e evidencias ainda serao salvos no proximo commit. Ver `docs/entrega/A/verificacao-a-pre-integracao.json` para 184 testes, lint/build e 4 E2E aprovados, alem de 30 testes backend base e 33 do incremento B isolado. NASA real baseline local passou com metodo legado; imagem Docker intermediaria compilou.

Adson informou que nao ha host persistente e autorizou preparar snapshot NASA real identificado. Nao ha deploy publico ou submissao. CLI Vercel existente lista projetos em `adson-monteiros-projects`; MCP retorna403. Nao alterar projetos preexistentes. Incremento B encontrado/recebido por fetch: `8b995ac2b01d929509d6aadbe7b89d221c2bdcef`, base e propriedade conferidas, 33 testes isolados; ainda sem ENTREGA-B e sem aceite final. Proximo passo: salvar A e integrar esse SHA por merge identificavel (nao misturar cherry-pick), depois testar API+front e gerar snapshot real v2.

Dois especialistas locais encerrados, sem escritores ativos. Integrador continua Codex por correcao expressa do usuario; troca manual quando Adson decidir. Processo local de baseline: Python PID25784, porta8910, banco publico de teste em `docs/entrega/A/nasa-local.sqlite3` (ignorado). Docker Desktop iniciado por A; nenhuma instancia de app em container iniciada ate este bloco. Logs/relatorios E2E locais ignorados precisam acompanhar pacote se forem usados fora da maquina.

## Estado inicial verificavel

Raiz ativa: `C:\Users\adson\.codex\worktrees\earth-delivery-a\earth-detective`. Raiz original preservada: `C:/Users/adson/Downloads/ADSON/PROJETOS/earth-detective`. Base remota `09b49c31242f2c8c6cb732cb58cf05ff564749d4`; branch `delivery/adson-20261115`. HEAD inicial = base. Alteracoes e HEAD final devem ser conferidos no Git antes de assumir.

Frontend baseline: 163 testes em 19 arquivos, lint/build exit 0 na arvore equivalente `00f5089`. Node v24.18.0/npm 11.16.0/Python sistema 3.14.5. npm ci do checkout isolado exit 0. Sem servidores iniciados pelo integrador neste checkpoint. Especialista retry finalizou; QA E2E em andamento. Nao assumir escritores parados ate atualizar este bloco.

Nenhum material B recebido; nenhum commit B integrado. Prazo observado no portal: 15/11/2026 23h59 no fuso do evento Fortaleza; possivel corte local em verificacao. Conta autenticada permite Edit em Project da Equipe Caos. Sem submissao; campos incompletos. Team Owner Teodoro Alexandre de Araujo Fernandes; 6 membros cadastrados, divergindo do planejamento humano de cinco.

## Proximos comandos

```powershell
git status --short --branch
git log -8 --oneline
cd frontend
npm ci
npm test
npm run lint
npm run build
```

Leia `../FINALIZACAO.md` para todos os 35 IDs e `../entrega/A/` para evidencias. Antes de qualquer integracao B, conferir base, SHAs, caminhos da propriedade exclusiva, testes, migracoes e caso NASA real; nao aceitar entrega por descricao apenas. Nao publicar/provisionar/submeter sem autoridade aplicavel. Nao acessar segredos para documentar.

## Contrato, propriedade e recebimento de B (incorporados)




# Protocolo comum das duas frentes — Earth Detective

Este protocolo está incorporado nos dois prompts. Não é necessário enviar um terceiro arquivo para que funcionem.

## Base comum, branches e escopo

Projeto: `https://github.com/JoaoBMC/earth-detective`. BASE_SHA de referência: `09b49c31242f2c8c6cb732cb58cf05ff564749d4`. Verifique se esse commit existe no remoto. Ambas as frentes devem partir desse mesmo commit, em diretórios separados e branches próprias. Não escolher independentemente “a main mais recente”. Se houver uma entrega posterior indispensável, informar a divergência e combinar uma nova base com o outro humano antes de mudar este protocolo. Enquanto isso, tarefas de leitura/testes podem avançar.

- **A — Adson:** branch proposta `delivery/adson-20261115`; frontend, integração, operação, documentação, materiais e envio. Codex inicialmente; Claude somente quando Adson decidir e fizer a passagem manual.
- **B — amigo:** branch proposta `delivery/backend-20261115`; ciência, dados, API, persistência e exportação. Continua no Codex.
- Só A integra as duas frentes e promove o candidato final. B não faz merge na main nem altera deploy/produção.
- Cada frente pode ler o projeto inteiro quando necessário, mas só modifica seus próprios arquivos. Mudança de propriedade exige mensagem explícita aceita e registro. Nenhum executor envia mensagens externas por conta própria; prepare o texto para os humanos encaminharem.

### Arquivos de A

`frontend/**`; `.github/**`; `tests/e2e/**`; `docs/frente-a/**`; `docs/entrega/**`; demais `docs/**`, exceto `docs/backend/**`; `README.md`; arquivos de operação na raiz como `Dockerfile`, `.dockerignore` e manifestos de hospedagem, se necessários. A é dono exclusivo de `docs/FINALIZACAO.md` e da documentação geral.

### Arquivos de B

`backend/**`; `contracts/**`; `pipelines/**`; `data/**`, somente artefatos permitidos e não privados; `tests/test_*.py`, `tests/conftest.py`, outros testes de backend fora de `tests/e2e/**`; `docs/backend/**`.

**A não edita `backend/**`, `contracts/**`, `pipelines/**` ou testes Python de B. B não edita frontend, README geral, CI ou deploy.** Se A precisar de ajuste de CORS/API, encaminha a B; A pode configurar variáveis no runtime autorizado sem mudar os arquivos de B. Se B precisar alterar front, entrega a mudança de contrato, nunca edita esse front.

## Contrato de integração V1 — igual nos dois prompts

Preservar rotas e campos atuais, sem renomeação de campos existentes. Base `/api/v1`; backend health em `/health` ou rota de health já existente. Rotas relevantes: `GET /variables`, `GET /regions`, `GET /availability`, `POST /analyses`, `GET /analyses`, `GET /analyses/{id}`, `GET /analyses/{id}/export`. Respeitar as rotas completas reais ao verificar o código. A usa exportação por ID para não recalcular.

Manter o formato atual de pedido e resposta NASA/Meteomatics, incluindo `series`, `analysis_series`, `trend`, `quality`, `explanation`, proveniência e períodos solicitado/efetivo. A adapta o contrato do backend a seu modelo de tela, sem pedir a B uma resposta específica para cada componente.

**Extensão acordada:** acrescentar dentro de `trend`:

```json
{
  "inference_status": "descriptive",
  "inference_reason": "Seasonality and serial dependence have not been validated for inference.",
  "applicable": true,
  "slope_per_decade": 0.12,
  "slope_unit": "deg C per decade",
  "p_value": null,
  "confidence_interval": null,
  "significant": null
}
```

Esse fragmento é **fixture ilustrativa de contrato**, não resultado NASA nem definição de todos os campos obrigatórios. O número 0,12 não pode aparecer como descoberta real.

Regras vinculantes:

1. `inference_status`: `validated`, `descriptive`, `insufficient_data` ou `unsupported`. `inference_reason`: texto em inglês ou `null` quando não houver motivo de restrição.
2. `applicable` continua indicando se a estimativa de tendência é aplicável. Pode ser `true` em modo descritivo; não significa significância validada.
3. Em `descriptive`, p, CI inferencial e significant são `null`; magnitude descritiva pode existir. Em `insufficient_data`/`unsupported`, não fabricar magnitude ou evidência; retornar nulos quando não aplicáveis e motivo explícito.
4. `validated` exige metodologia e pressupostos justificados, critérios de qualidade e testes independentes para o caso; não é homologação científica externa nem se aplica automaticamente a qualquer variável. Um cálculo de p sem validação ambiental não habilita esse estado.
5. `slope_per_decade` usa tempo real em anos multiplicado por dez. `slope_unit` descreve unidade física por década, derivada da fonte; o front evita acrescentar “por década” duas vezes. Não converter `null` em zero.
6. Preservar enums antigos de `direction` para compatibilidade. `stable` não pode significar apenas p acima de 0,05. Resultados legados sem os dois novos campos são tratados pelo front como inferência não validada, com aviso; não reclassificar silenciosamente análises salvas.
7. Incrementar versão do método quando seu significado mudar. Histórico e exportação refletem a análise salva, não uma nova consulta. CSV preserva colunas existentes; novas colunas são acrescentadas ou metadados vão a um JSON complementar documentado.
8. Coordenadas WGS84 em `[longitude, latitude]`. Datas ISO. Ausências como `null`. Ponto/célula não é média estadual. Período efetivo e aquisição precisam ser rastreáveis.
9. Preservar erros estruturados atuais e disponibilidade. Produto configurado ou token presente não comprova consulta real bem-sucedida. A tela deve mostrar o motivo de indisponibilidade ou falha.

B implementa e documenta V1 em `contracts/`; produz exemplos completos validados pelo schema em `contracts/fixtures/` para descritivo, insuficiente e unsupported, mais validated somente se justificável. A pode construir seus próprios mocks a partir destas regras desde o início, sem esperar o backend. São testes, não dados da demonstração.

**Caso inicial proposto:** NASA POWER, temperatura numa célula no Ceará, ponto longitude −39,5 / latitude −5,2, janeiro/2020 a dezembro/2023. Esse fluxo foi observado numa revisão anterior, não testado agora. Confirmar ID real no catálogo e cobertura; 48 meses não demonstram tendência climática estadual ou de longo prazo. A expansão temporal é opcional e não pode quebrar o caso inicial. Confirmar aderência da fonte aos Resources do desafio.

Mudanças incompatíveis de V1 precisam ser combinadas antes de implementar. Demais extensões são aditivas e toleráveis por clientes antigos. A não espera B para fazer front; B não espera A para validar cálculo/dados.

As dependências ED do plano original continuam como critérios de integração final. Para iniciar uma tarefa, uma dependência da outra frente pode ser atendida provisoriamente por este V1 e por fixture identificada; isso não conclui a tarefa nem substitui o teste real ao integrar. B pode começar com o caso inicial proposto e validação de entrada enquanto A confirma detalhes do evento. Não transformar uma aprovação de apresentação em bloqueio para corrigir matemática ou preparar o contrato.

## Troca de entregas entre computadores

Use acesso GitHub existente quando disponível. É permitido preparar commits e publicar apenas a branch própria para trocar o trabalho, respeitando permissões do ambiente; não fazer force-push, merge na main ou deploy automático por engano. Se uma branch disparar publicação, confira o efeito antes de publicá-la. Não assumir que o amigo tem acesso de colaborador.

Sem permissão de escrita, B prepara patch ou bundle Git portável e informa base, commits e instruções; os humanos transferem o arquivo. Nenhum caminho local da máquina de Adson é pré-requisito na casa do amigo. Não enviar `.env`, credenciais, banco local privado ou dependências instaladas.

Trocas mínimas:

- **B → A, cedo:** base/SHA, confirmação V1, exemplos e disponibilidade real do caso. Texto curto que o humano possa encaminhar.
- **A → B, cedo:** confirmação da base, origem/rota pública desejada e eventuais dúvidas de contrato. Não exigir formato de UI no backend.
- **B → A, entrega:** branch/PR ou pacote, SHAs, caminhos alterados, testes, caso NASA real, variáveis de ambiente apenas por nome, limites, migrações e como executar. B escreve `docs/backend/ENTREGA-B.md`.
- **A → B, integração:** SHA integrado, comportamento que falhou e reprodução objetiva, se houver; B corrige na própria branch ou aceita explicitamente uma transferência de propriedade.

A integra commits de B uma única vez, com histórico identificável. Usar merge ou cherry-pick conforme o histórico; não misturar ambos para os mesmos commits. Antes de integrar, conferir a base e a lista de arquivos alterados contra a propriedade combinada. Mudança fora de escopo não é aceita silenciosamente. B entrega incrementos compatíveis; A não precisa esperar o último polimento para começar testes reais.

## Custos, agentes e segurança operacional

Cada executor é seu próprio coordenador local. Não recriar a equipe inteira de cinco agentes em cada computador. Preferir executar diretamente tarefas pequenas; iniciar no máximo dois especialistas locais quando houver ganho real e arquivos independentes. Começar por uma chamada curta para confirmar a capacidade; não criar subagentes em cascata. Se delegação não existir, seguir sequencialmente.

Usar somente modelos e assinatura já disponíveis. Modelo leve para extração/documentação/checklists delimitados; modelo competente para código e estatística; escalar para capacidade maior somente com motivo concreto. Não alterar o modelo atual sem ferramenta/necessidade comprovadas, não inventar aliases e não ativar API paga, créditos ou cobrança extra. Custo-benefício inclui retrabalho, conflitos e testes, não apenas preço de uma chamada.

Subagentes recebem apenas sua tarefa, base, propriedade e aceite. Não copiar todo o prompt, cofre ou pesquisa em cada chamada. Relatórios normais até cerca de 250 palavras, com logs completos em arquivo. Usar scripts para contagens/hashes/checagens mecânicas. Não duplicar pesquisa de concorrentes. Reservar capacidade operacional para testar e integrar; não fingir conhecer tokens restantes quando a ferramenta não os expõe. Usar checkpoints e compactação suportada sem perder o estado.

Nenhum agente ganha autoridade sobre a outra frente. Todos recebem: “Você não está sozinho no projeto; preserve o trabalho dos colegas; não altere arquivos fora da sua atribuição.” Respeitar instruções locais, controles e acessos. Não mandar mensagens a terceiros, contratar serviços, publicar produção ou submeter oficialmente sem autoridade aplicável. Preparar primeiro resultados verificáveis; pedir apenas acesso/decisão que realmente faltar.

## Qualidade mínima comum

Dados reais identificados; fixtures explicitamente restritas aos testes; datas, finitude, unidades e lacunas coerentes; sem significância ou causalidade indevida; sem segredos no Git, logs ou frontend; testes ligados ao SHA real. Métodos alternativos não entram só por nome. CI de inclinação não vira faixa de previsão.

Comandos base a confirmar no checkout: backend `python -m pytest tests -q` com ambiente/importações corretos; frontend, em `frontend/`, `npm ci`, `npm test`, `npm run lint`, `npm run build`. Não presumir `.venv` existente nem apagar dependências em uso. Repetir testes quando mudanças/falhas justificarem, e validar integração no candidato final.

O portal estudado indica encerramento em 15/11 às 23h59 locais; evento/Team Owner define fuso efetivo e pode haver exigência local anterior. A confirma isso e os guias. Os horários internos precisam ser recalculados ao iniciar. A meta é entregar antes do encerramento, com reserva. Não prometer resultado ou vitória.


## IDs de A pendentes e criterios de aceite originais

 — execução e critérios de aceite

### ED01 — Confirmar prazo, conta e requisitos da entrega


- **Responsabilidade:** Frente A. **Depende de:** nada.
- Abrir a equipe no portal; conferir os cinco integrantes, evento, Team Owner, desafio, fuso, campos obrigatórios, formatos da demo e lista Resources. Conferir também entrega local, se houver.
- **Aceite:** horário limite e responsável por submeter registrados; conta consegue editar Project; requisitos têm fonte ou captura. NASA usada no caso deve ser conferida contra a lista aplicável.
- **Se bloqueado:** A prepara a questão para o humano responsável consultar o organizador; demais tarefas continuam. Não afirmar elegibilidade ou envio sem confirmação.


### ED02 — Inventariar e escolher a base de entrega


- **Responsabilidade:** Frente A. **Depende de:** nada.
- Conferir status, branches e diferenças entre main e integração local; preservar alterações recentes. Identificar responsáveis ainda editando e o ambiente de execução.
- **Aceite:** SHA inicial, branch candidata e diferenças úteis registrados; ninguém perde arquivos e a base inicia. Evidência anterior não é transferida automaticamente à nova revisão.


### ED03 — Fechar a pergunta e o escopo público


- **Responsabilidade:** Frente A. **Depende de:** ED01.
- Confirmar uma pergunta, público, ponto/célula, variável e período. Escolher um único percurso principal. Classificar outras fontes como disponíveis e testadas, indisponíveis ou fora desta entrega.
- **Aceite:** parágrafo com o que o usuário consegue investigar hoje; nenhuma célula é chamada de média do Ceará. O resultado não é decidido antes da análise.


### ED05 — Integrar a base útil e rodar verificações iniciais


- **Responsabilidade:** Frente A. **Depende de:** ED02.
- Preparar o candidato sem refazer o redesign; rodar testes existentes e build para separar falhas de partida das novas. A não faz merge cego de branches.
- **Aceite:** revisão candidata identificada, resultados iniciais registrados e falhas atribuídas; B–A trabalham sobre contrato/base compatíveis.


### ED18 — Apresentar corretamente o estado científico


- **Responsabilidade:** Frente A. **Depende de:** ED04; integrar com ED08.
- Atualizar tipos e adaptador para estados científicos. Mostrar direção, magnitude, método e limites; tratar `null` como indisponível, nunca zero. Remover selo de confiança/significância quando não aplicável.
- **Aceite:** fixtures dos três estados ED04 passam; mensagem e gráfico não contradizem a API. Inferência antiga salva deve ser identificada pela versão do método, sem ganhar status novo automaticamente.


### ED19 — Corrigir repetição de análise salva


- **Responsabilidade:** Frente A. **Depende de:** ED02.
- Corrigir `useAnalysis.ts`: o retry precisa distinguir abrir análise salva de executar nova consulta. Preservar cancelamento e proteção contra respostas atrasadas.
- **Aceite:** primeiro GET por ID falha, clicar em Try again repete o GET do mesmo ID e conclui; não dispara POST de análise nova. Incluir teste do comportamento.


### ED20 — Tornar o caso principal fácil de abrir e interpretar


- **Responsabilidade:** Frente A. **Depende de:** ED03 e ED16 para dados finais.
- Aproveitar controles e Saved existentes para um ponto de entrada simples ao caso. Mostrar ponto/célula, coordenadas e período efetivo; não prometer média regional. Evidenciar resultado desatualizado ao mudar filtros.
- **Aceite:** uma pessoa abre o caso e entende local, período e variável sem intervenção da equipe. Pré-seleção não contém conclusão inventada nem números hardcoded como se fossem novos cálculos.


### ED21 — Alinhar catálogo e erros com o backend real


- **Responsabilidade:** Frente A. **Depende de:** ED13 e ED17.
- Exibir indisponibilidade e motivo para fontes não liberadas. Conferir loading, cancelamento, erro, ausência de dados, recuperação e respostas fora de ordem.
- **Aceite:** nenhum item parece utilizável quando falta acesso; o erro da fonte não vira tela em branco ou dado de outra consulta.


### ED22 — Qualificar ou retirar a projeção da apresentação


- **Responsabilidade:** Frente A. **Depende de:** ED08.
- Se permanecer visível, chamar a curva de referência sazonal pela média histórica, distinguindo-a de valores observados e de previsão validada. MAE deve ter contagem e contexto.
- **Aceite:** legenda, gráfico e texto concordam; se não couber a revisão, retirar essa curva da jornada principal. Não esconder por CSS enquanto a narrativa continua prometendo previsão.


### ED23 — Verificar usabilidade e acessibilidade da jornada


- **Responsabilidade:** Frente A. **Depende de:** ED18–ED22.
- Conferir desktop e celular, teclado, foco, rótulos, contraste funcional, tabela de dados, números longos e áreas do gráfico. Preservar o redesign; corrigir bloqueadores observados.
- **Aceite:** a jornada principal funciona em 390 px e desktop, sem controle inacessível ou informação dependente só de cor; evidência de tela na revisão candidata.


### ED24 — Preparar verificações reproduzíveis e automação mínima


- **Responsabilidade:** Frente A. **Depende de:** ED05.
- Registrar versões de Python/Node e comandos de instalação/teste. Automatizar testes backend, front, lint e build em CI se o fluxo do repositório permitir. Separar testes determinísticos da consulta NASA real.
- **Aceite:** comandos são executáveis em ambiente limpo e resultados ficam ligados ao SHA. Se CI falhar por acesso, registrar e executar localmente no candidato; isso não pode ser comunicado como CI aprovado.


### ED25 — Publicar ambiente de teste cedo e confirmar persistência


- **Responsabilidade:** Frente A. **Depende de:** ED05 e acesso confirmado.
- Usar hospedagem acessível à equipe e adequada a FastAPI/React. A configuração Vercel existente cobre o front; verificar separadamente execução Python, rota `/api`, TLS, origens e armazenamento. SQLite precisa de local persistente e compatível com o modelo de execução.
- **Aceite:** navegador externo abre front e API; catálogo e uma análise real respondem; runtime não grava histórico apenas em disco temporário.
- **Decisão no marco inicial de publicação:** sem caminho viável para backend público, preparar com B/A uma demonstração pública limitada a snapshots NASA reais e identificados, se couber; declarar que não oferece consulta ao vivo. Não contratar serviço pago nem apresentar API inexistente. Um vídeo sozinho não comprova app público funcionando.


### ED26 — Executar a jornada completa no ambiente público


- **Responsabilidade:** Frente A. **Depende de:** ED10, ED15, ED17, ED23 e ED25.
- Testar abrir, consultar caso real, mudar período, cancelar/recuperar falha, reabrir salvo, exportar e recarregar. Reiniciar o serviço e verificar o mesmo ID. Conferir CSV/JSON contra tela e API.
- **Aceite:** checklist e evidências ligadas ao SHA/URL; a consulta real é identificada como real, falhas injetadas como testes e snapshots como snapshots. Documentar qualquer percurso excluído.


### ED27 — Revisar segurança e limites do ambiente público


- **Responsabilidade:** Frente A. **Depende de:** ED25.
- Conferir bundle e logs sem segredos, HTTPS sem conteúdo misto, origens esperadas, corpos/tamanho de consulta, erros sem detalhes internos e comportamento de concorrência. Histórico público não pode expor informação privada que a equipe tenha colocado nos registros.
- **Aceite:** verificações concretas registradas, sem auditoria de segurança total alegada. Vulnerabilidade impeditiva resulta em correção ou remoção da função exposta, nunca apenas aviso escondido.


### ED28 — Congelar candidato e preparar retorno à versão válida


- **Responsabilidade:** Frente A. **Depende de:** ED26 e ED27.
- Fixar SHA, dados do caso, método, URL e lista de testes; manter versão anterior recuperável. Aceitar só correções de bloqueadores após este marco.
- **Aceite:** registro de release com instrução de retorno, pendências visíveis e decisão de publicar a versão validada por pessoa com acesso e autorização. Não atualizar dependências em massa na reta final.


### ED29 — Escrever a narrativa de contribuição


- **Responsabilidade:** Frente A.
- Explicar problema, público, uso efetivo da NASA, como a pessoa investiga e qual contribuição a equipe entregou. Evitar “primeiro”, “melhor”, “prevê clima” e causalidade sem evidência.
- **Aceite:** texto curto em inglês, demonstrável na aplicação; apresenta limitações e não confunde plano futuro com entrega atual.


### ED30 — Consolidar fontes, créditos, licença e uso de IA


- **Responsabilidade:** Frente A. **Depende de:** ED01 e ED03.
- Relacionar dados, mapas, bibliotecas, imagens, material reaproveitado e uso de IA; conferir licenças e exigências aplicáveis. Se usar código externo, registrar origem/licença; não copiar concorrente sem análise.
- **Aceite:** créditos públicos e declaração verdadeiros; arquivos e materiais não expõem credenciais. Licença escolhida pelo responsável do projeto com os direitos necessários.


### ED31 — Salvar a primeira entrega válida cedo


- **Responsabilidade:** Frente A. **Depende de:** ED01 e rascunho ED29.
- Preencher Project e salvar uma submissão válida com o que já existe, quando os campos obrigatórios e materiais estiverem prontos. Concluir uma versão simples da demo se for exigida; não inserir links vazios para obter status artificial.
- **Aceite:** plataforma confirma recebimento da versão inicial; A registra quais itens ainda serão atualizados. Se só houver rascunho, marcar como rascunho, não enviado.


### ED32 — Produzir a demonstração final


- **Responsabilidade:** Frente A. **Depende de:** ED01, ED11 e ED28 para versão final.
- Escolher um formato permitido e econômico: vídeo curto ou slides, conforme guia confirmado. Reaproveitar apresentação existente somente após corrigir números e promessas. Registrar o candidato congelado; links públicos.
- **Aceite:** limites de duração/páginas e idioma conferidos, leitura possível, dados da mesma versão, limitação científica incluída. Se formato vigente for 30 segundos ou sete slides, respeitar integralmente, inclusive capa.


### ED33 — Atualizar documentação e instruções de reprodução


- **Responsabilidade:** Frente A. **Depende de:** ED11, ED17 e ED28.
- Atualizar README, instruções de execução, fonte, método, limitações e link público. Marcar cronograma anterior como histórico; manter registro das mudanças. Incluir versões, comandos realmente usados e acesso necessário para fontes opcionais.
- **Aceite:** terceiro consegue entender o que foi entregue e reproduzir o caso permitido; documentação não diz “somente Meteomatics” nem declara tudo validado.


### ED34 — Conferir toda a entrega por duas pessoas


- **Responsabilidade:** Frente A. **Depende de:** ED28, ED30, ED32 e ED33.
- Abrir projeto, repositório e demo em sessão anônima e outro dispositivo; verificar links, permissões, versão, números e campos obrigatórios. Comparar texto e imagem com a aplicação publicada.
- **Aceite:** revisores identificados, horário e checklist registrados; agentes não contam como duas pessoas humanas; nenhum link pede login ou autorização e nenhuma promessa essencial está sem implementação demonstrável.


### ED35 — Enviar a versão final e guardar o comprovante


- **Responsabilidade:** Frente A. **Depende de:** ED34.
- Submeter a versão final no portal; reabrir a página e confirmar que os últimos links/textos foram salvos e o estado é enviado. Guardar URL, horário, identificador/captura e SHA associado.
- **Aceite:** confirmação observada na plataforma. Deploy, commit ou mensagem “terminamos” não substituem submissão. Após isso, monitorar só o necessário até encerrar o prazo; nenhuma expansão de escopo.
