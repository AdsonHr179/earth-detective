# Cronograma do projeto — Earth Detective

**Idioma deste documento:** português (Brasil)  
**Atualizado em:** 14/11/2026  
**Status:** planejamento do MVP; as estimativas dependem da validação dos dados e do acesso à API.

## 1. Objetivo do cronograma

Organizar o trabalho necessário para transformar a base atual do Earth Detective em um MVP demonstrável que use dados meteorológicos rastreáveis, apresente uma análise compreensível e permita reproduzir e exportar os resultados.

O cronograma é relativo: as semanas começam após a confirmação do acesso e da disponibilidade dos produtos necessários na Meteomatics. A previsão indicativa é de **6 a 8 semanas de trabalho**, considerando uma pessoa trabalhando em tempo integral e sem atrasos de acesso. Não é uma data de entrega garantida; validação científica e disponibilidade dos dados podem alterar o prazo.

## 2. Situação atual

### Já existe

- Repositório local organizado em `backend/`, `frontend/`, `data/`, `pipelines/`, `contracts/`, `tests/` e `docs/`.
- API FastAPI com endpoints iniciais para saúde, catálogo, regiões, disponibilidade, análise e exportação CSV.
- Interface React/TypeScript/Vite que inicia localmente e consulta o catálogo pela API.
- Estrutura inicial de análise de tendências e testes de API. Na validação realizada em 14/11/2026, os três testes existentes passaram.
- A Meteomatics Weather API foi escolhida como provedora planejada para a futura integração.
- Branches locais `prod`, `dev` e `test` foram criadas a partir de `main`.

### Ainda não está pronto

- A API ainda serve séries **sintéticas**; ela não consulta dados reais da Meteomatics.
- Os produtos, parâmetros, períodos históricos, resolução, licenciamento e cobertura para cada variável ainda precisam ser confirmados no plano da API.
- A disponibilidade de um parâmetro de umidade do solo ainda não foi confirmada.
- O mapa, o gráfico e os controles de período na interface ainda são placeholders; a jornada completa de análise não está implementada.
- O método estatístico atual é uma base inicial, não a metodologia validada descrita na especificação.
- A exportação e os metadados ainda precisam ser verificados contra o contrato final de dados reais.
- As branches `prod`, `dev` e `test` existem apenas localmente e ainda não têm funções ou conteúdos diferentes. Não foi possível publicá-las no GitHub por falta de autenticação no terminal.
- Em 14/11/2026, há alterações locais ainda não commitadas em `README.md`, `backend/app/main.py`, `backend/app/schemas.py`, `docs/EARTH_DETECTIVE.md` e `frontend/vite.config.ts`. Elas precisam ser revisadas e preservadas ao organizar as branches.

## 3. Linha do tempo proposta

| Fase | Prazo indicativo | Trabalho principal | Critério para concluir |
| --- | --- | --- | --- |
| 0. Fundação | Concluída parcialmente | Estrutura do repositório, API inicial, interface inicial e testes básicos | Aplicação inicia localmente e a API responde; limitações da base sintética estão explícitas |
| 1. Acesso e decisão de dados | Semana 1 | Confirmar acesso/termos do plano Meteomatics; verificar parâmetros, produtos e histórico; selecionar uma variável inicial e dois recortes regionais; obter e versionar geometrias | Existe uma ficha de fonte com IDs exatos, unidade, versão/modelo, cobertura, resolução, licença e limitações; nenhuma credencial está no Git |
| 2. Pipeline e catálogo reais | Semanas 2–3 | Implementar aquisição no servidor, validação, conversão e agregação temporal/espacial; produzir amostra rastreável e manifesto | Uma série real para uma variável e duas regiões pode ser reproduzida; lacunas, cobertura, proveniência e versão estão registradas |
| 3. Método científico e API | Semanas 3–4 | Definir requisitos mínimos e cobertura; validar agregação e inferência com autocorrelação; ajustar schemas e endpoints para dados versionados | Casos numéricos de referência passam; valores insuficientes ou dados incompletos não geram conclusões indevidas; API relata método, fonte e limitações |
| 4. Jornada da interface | Semanas 4–5 | Implementar seleção de variável, região e período, mapa, gráfico, estados de carregamento/erro e apresentação do resultado real | Uma pessoa completa a investigação de ponta a ponta no navegador, com fonte, unidade, qualidade e método visíveis |
| 5. Escopo restante do MVP | Semanas 5–6 | Integrar outras variáveis somente após validação; alinhar CSV; criar duas investigações guiadas e textos explicativos | Variáveis habilitadas têm fonte aprovada; CSV corresponde exatamente à análise mostrada; exemplos usam dados reais |
| 6. Qualidade e demonstração | Semanas 7–8 | Revisão de segurança, testes de integração e ponta a ponta, CI, documentação de execução e preparação da versão de demonstração | Build, testes e jornada no navegador passam na versão integrada; versão do código, dados e método é identificável; limitações estão documentadas |

As fases podem se sobrepor: por exemplo, a interface pode ser desenvolvida com fixtures identificadas enquanto o pipeline é construído. Isso não conta como validação do MVP com dados reais.

## 4. Detalhamento das fases

### Fase 1 — Confirmar a fonte e o recorte

1. Verificar no plano Meteomatics se há acesso aos dados históricos necessários para tendências, não apenas previsões ou condições atuais.
2. Consultar a documentação oficial e identificar o parâmetro exato para temperatura do ar e precipitação; verificar se um produto apropriado de umidade do solo está disponível.
3. Confirmar unidade, intervalo temporal, resolução espacial, modelo/produto, histórico, versionamento, limitações de uso e atribuição exigida.
4. Escolher uma variável que possa ser validada primeiro e dois recortes geográficos (por exemplo, Ceará e Nordeste do Brasil), confirmando se a API e o produto selecionado suportam a consulta desejada.
5. Selecionar limites geográficos versionados e uma regra documentada para agregar células ou pontos sobre cada região.
6. Configurar credenciais somente no ambiente local/servidor, por variáveis de ambiente. Como uma credencial foi compartilhada na conversa do projeto, revogá-la e emitir outra antes de qualquer integração.

**Dependências:** acesso válido ao serviço, decisão dos recortes e confirmação do produto.  
**Bloqueio que impede iniciar a integração real:** indisponibilidade de histórico adequado, parâmetros necessários ou autorização de uso no plano.

### Fase 2 — Criar o pipeline reproduzível

1. Implementar aquisição no backend/pipeline; nunca chamar o serviço autenticado diretamente pelo navegador.
2. Validar formato, datas, coordenadas, unidades, valores ausentes e respostas de erro da API externa.
3. Manter ausências como ausências; não convertê-las em zero.
4. Aplicar conversões e agregações adequadas à grandeza física e registrar cada transformação.
5. Gerar séries mensais e indicadores de cobertura/qualidade; preservar observações originais relevantes.
6. Criar manifesto com origem, produto, parâmetro, versão, datas de obtenção, transformações, geometria, licença e checksums.
7. Publicar cada conjunto validado de forma versionada e atômica, sem substituir a última versão válida se a aquisição falhar.

**Dependência:** ficha de fonte aprovada na Fase 1.  
**Entrega:** uma amostra versionada que a equipe possa validar e reproduzir sem credenciais no cliente web.

### Fase 3 — Validar ciência e API

1. Definir o que será exibido como série mensal e o que será usado na inferência.
2. Determinar critérios de ano completo, cobertura mínima, quantidade mínima de observações e tratamento de lacunas.
3. Validar a análise de tendência e a inferência considerando autocorrelação e tamanho da série; não exibir significância se o método não for aplicável.
4. Testar séries conhecidas, constantes, curtas, incompletas e com ruído; comparar o resultado com cálculos independentes.
5. Atualizar o contrato OpenAPI/Pydantic e fornecer erros compreensíveis, versão do dataset e versão do método.
6. Garantir que unidade, período, filtros e dados exportados sejam os mesmos usados na análise.

**Dependência:** amostra real e metadados da Fase 2.  
**Entrega:** API documentada e resultados que podem ser explicados e reproduzidos.

### Fase 4 — Completar a interface

1. Substituir placeholders por controles reais para variável, região e período dentro da cobertura disponível.
2. Mostrar mapa com limites e atribuição da fonte cartográfica.
3. Renderizar série e tendência com unidades e lacunas claramente identificadas.
4. Mostrar fonte/produto, período efetivo, versão, cobertura, limitações e método.
5. Implementar estados de carregamento, falha recuperável, ausência de inferência e resposta desatualizada.
6. Conferir teclado, contraste, dispositivos móveis e uso de texto/símbolos além de cores.

**Dependências:** contrato estável, catálogo validado e endpoint real disponível.  
**Entrega:** jornada completa de seleção até resultado, sem depender de valores fictícios.

### Fase 5 — Completar escopo funcional

1. Habilitar precipitação e umidade do solo somente se cada fonte for validada separadamente.
2. Implementar e documentar o esquema CSV com observações, análise, resumo e proveniência.
3. Criar duas investigações guiadas com filtros e interpretação verificáveis.
4. Fazer com que cada texto de explicação derive dos resultados e exponha limitações; não afirmar causalidade.
5. Remover ou rotular explicitamente como fixture qualquer exemplo que ainda use dados sintéticos.

### Fase 6 — Segurança, testes e demonstração

1. Revisar segredos, logs, validação de entrada, limites de consulta e exposição de detalhes de erro.
2. Verificar conteúdo CSV contra injeção de fórmulas e validar tratamento de falhas externas.
3. Executar testes científicos, backend, frontend, integração e jornada ponta a ponta.
4. Automatizar no CI os testes apropriados a cada alteração e manter testes remotos/credenciais separados dos testes determinísticos.
5. Documentar como instalar, configurar variáveis de ambiente, iniciar e testar o sistema.
6. Fixar versões de dependências, dataset e método da demonstração; preparar uma execução reproduzível em ambiente limpo.

## 5. Organização sugerida das branches

- `prod`: somente versões integradas e aprovadas para demonstração/produção.
- `dev`: integração contínua das funcionalidades concluídas e revisadas.
- `test`: validação de candidatos a release, experimentos e execução de testes.
- Branches curtas por tarefa, como `feat/meteomatics-pipeline` ou `feat/analysis-chart`, devem partir de `dev` e voltar por revisão.

Antes de adotar esse fluxo:

1. Revisar e registrar as alterações locais ainda não commitadas.
2. Publicar as três branches no remoto quando a autenticação estiver disponível.
3. Alinhar a base das branches: hoje elas foram criadas a partir de `main` e não contêm automaticamente alterações não commitadas.
4. Definir proteções e regras de merge de acordo com o plano e a política do repositório.
5. Evitar commits diretos em `prod`; promover uma versão validada de `dev` para `test` e, após aprovação, para `prod`.

## 6. Decisões que precisam ser confirmadas

- Quais produtos/modelos Meteomatics serão usados e quais têm histórico adequado para análise climática?
- O plano permite os parâmetros, a cobertura temporal, os recortes espaciais e o volume de consultas pretendidos?
- Qual variável e quais duas regiões serão usadas na primeira demonstração?
- Qual fonte de limites geográficos e método de agregação regional serão adotados?
- Qual critério de cobertura anual e qual método estatístico serão aprovados?
- Onde a demonstração será hospedada e quem poderá acessar os dados?

## 7. Critério de conclusão do MVP

O MVP só deve ser considerado pronto quando:

- Uma pessoa consegue selecionar variável, região e período e concluir uma análise no navegador.
- A análise usa dados reais e identificáveis, com fonte, produto, versão e transformações rastreáveis.
- As unidades, os intervalos, as lacunas e os critérios científicos são apresentados corretamente.
- Inferência indisponível é explicada sem substituir ausência de evidência por uma afirmação de ausência de mudança.
- Exportação reproduz os dados, filtros, versões e resultados exibidos.
- Testes relevantes e a jornada ponta a ponta passam na versão integrada.
- Credenciais permanecem fora do frontend, do Git e dos logs.
- Procedimentos de execução e limitações conhecidas estão documentados.

