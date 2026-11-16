# Entrega da frente B

- Repositório publicado em [AdsonHr179/earth-detective](https://github.com/AdsonHr179/earth-detective). O endereço de JoaoBMC redireciona para esse repositório.
- Base comum `09b49c31242f2c8c6cb732cb58cf05ff564749d4`. Branch `delivery/backend-20261115`.
- Primeiro incremento V1 `8b995ac2b01d929509d6aadbe7b89d221c2bdcef`.
- HEAD verificado do código, dados e testes `b87f0fa67c693235251d3e93a40cfc72655e56c3`. O commit seguinte contém este recibo. Confira o HEAD da referência publicada com `git ls-remote origin refs/heads/delivery/backend-20261115`.
- [Contrato V1](../../contracts/api-contract.md), [validação das tarefas](FINALIZACAO-B.md) e [método científico](SCIENCE_METHOD.md).

## Arquivos

`backend/app/` contém configuração, API, esquema, ajuste e conectores. `backend/requirements.txt`
e `backend/.env.example` registram dependências e variáveis. `contracts/` contém o contrato,
schema e exemplos. `pipelines/export_analysis_schema.py` atualiza o schema e
`pipelines/seed_nasa_demo.py` importa os snapshots de `data/demo/nasa-power/`. Os testes novos e
alterados estão em `tests/test_*.py`. A documentação de transferência reside em `docs/backend/`.

## Executar

Python 3.12 foi verificado no Windows. A partir da raiz, em PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -m pytest tests -q
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

O sandbox precisou de `--basetemp` em um diretório gravável para o pytest.
Com Python 3.12.10 e as dependências do arquivo, a base somou **30 testes aprovados**
e o código B somou **62**. Um aviso de depreciação do Starlette/AnyIO apareceu nas
duas execuções. `pip check` aprovou as dependências instaladas.

Use `/api/v1` no proxy da mesma origem ou configure `ALLOWED_ORIGINS` com as
origens HTTP(S) públicas explícitas, separadas por vírgula. O teste local obteve 200
no preflight da origem registrada e 400 na outra origem. Cross-origin usa
`GET`/`POST` e dispensa credenciais de browser.

Use `ANALYSIS_DB_PATH` para apontar ao arquivo SQLite em um volume persistente e
gravável. O padrão local é `data/earth_detective.sqlite3`. A tabela e o índice são
criados conforme necessário. Ficheiros SQLite antigos continuam legíveis sem migração.
Os resultados legados preservam o método, os campos e o ID gravados. Identifique-os
na interface pela ausência de `trend.inference_status` e `trend.inference_reason`.
A rota `GET /api/v1/analyses/{id}/export` lê a mesma análise salva exibida via GET.
As oito primeiras colunas do CSV permanecem na ordem original. O JSON do resultado
guarda o período, os parâmetros, a série de análise e a proveniência completa.

A rota pública POWER dispensa variáveis de credenciais. Os conectores experimentais
exigem `ENABLE_UNVERIFIED_PROVIDERS` com ativação explícita mais
`METEOMATICS_USERNAME`, `METEOMATICS_PASSWORD` e, opcionalmente, `METEOMATICS_MODEL`
para Meteomatics, ou `EARTHDATA_TOKEN` para arquivos NASA autenticados. A entrega
deixa esses conectores desabilitados por padrão. A configuração de um conector
permite tentar a consulta. O acesso e a cobertura dependem da resposta do provedor.

## Exemplos JSON completos

- Teste sintético [descritivo](../../contracts/fixtures/descriptive.json),
  [insuficiente](../../contracts/fixtures/insufficient_data.json) e
  [sem suporte](../../contracts/fixtures/unsupported.json). Os três foram
  reproduzidos por HTTP e aprovados no schema Draft 2020‑12.
- Snapshots reais do [período principal](../../data/demo/nasa-power/ceara-2020-2023.analysis.json)
  e do [período alternativo](../../data/demo/nasa-power/ceara-2021-2023.analysis.json).
  Use `retrieved_at` na apresentação de um snapshot. `validated` permanece reservado.
  Os dois caminhos do backend expõem inclinação descritiva com p, IC e significância
  nulos enquanto sazonalidade e dependência serial não forem validadas.

## Caso real e reabertura

NASA POWER, endpoint mensal público, `T2M` do produto MERRA‑2, comunidade `AG`,
API `v2.10.0`, tempo local solar `LST`, unidade °C. Ponto WGS84
`[-39.5, -5.2]` no Ceará. Os parâmetros completos da chamada constam de
`quality.provider_metadata.query_url`. As chaves anuais são excluídas. Nas duas
janelas, todas as médias mensais analisadas foram finitas e diferentes da
sentinela `-999`. O cadastro da NASA POWER permite acesso e reutilização dos dados
com atribuição. [Documentação do produto NASA](https://power.larc.nasa.gov/docs/services/api/temporal/monthly/)
e [registro de dados abertos NASA POWER](https://registry.opendata.aws/nasa-power/).

| Janela e aquisição do backend, UTC | Meses válidos | Taxa descritiva, °C por década | ID para reabrir |
| --- | --- | --- | --- |
| 2020–2023, 2026-11-15 20:16:08.974885 | 48/48 | +1,869107719344 | `31c0e2ce-6ab8-45f9-94b0-134ce988b0c4` |
| 2021–2023, 2026-11-15 20:16:10.801469 | 36/36 | +2,948014894135 | `e51f2199-bd14-4cb7-8917-4d64a9e222d7` |

As respostas originais de consultas diretas foram adquiridas em 20:16:07.591486 UTC
e 20:16:10.287811 UTC respectivamente. Seus hashes SHA-256 brutos são
`1bdba1acfe56c6223e011b1b088807874b85ca3a9859097e230d462cc5e619c2` e
`9730edde347a6a0a7ae012200cd6fb59d84e49739476ce9259afa6b96827021c`. O hash canônico em
`quality.provider_metadata.response_sha256` exclui `times`, campo de duração da consulta.
O teste verifica a equivalência do conteúdo das duas aquisições e calcula a taxa
independentemente via covariância e variância de dias ordinais.

Para reproduzir a consulta pública, envie o pedido do [contrato](../../contracts/api-contract.md)
a `POST /api/v1/analyses`. A versão B foi exercitada via `curl.exe` e TestClient,
incluindo disponibilidade, criação, JSON por ID e CSV por ID. Depois de reiniciar
o processo sobre o mesmo arquivo SQLite, os dois IDs responderam 200.
A consulta de 1994–2023 retornou 360/360 meses e CSV de 360 linhas no servidor local.
Esse limite maior vale apenas para POWER. Earthdata continua com 120 meses.

Para reabrir os dois snapshots em outro ambiente sem consulta externa, configure o banco
destino em `ANALYSIS_DB_PATH` e execute na raiz. A importação é explícita e idempotente.

```powershell
$env:PYTHONPATH = 'backend'
.\.venv\Scripts\python.exe -m pipelines.seed_nasa_demo --database $env:ANALYSIS_DB_PATH
```

Os IDs podem ser abertos pelo histórico, `GET /api/v1/analyses`, ou diretamente por
`GET /api/v1/analyses/{id}`.

## Integração com A

O enunciado público do desafio menciona MERRA‑2. A relação direta da via POWER com
a aba Resources precisa da conferência final de A. A tentativa de abrir essa aba
retornou erro de acesso no navegador automatizado de pesquisa e de confiança de
certificado na consulta por linha de comando. A fonte de dados e seus metadados
foram verificados no endpoint POWER. [Enunciado do desafio](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/).

A deve confirmar origem pública, armazenamento persistente, prazo efetivo e
congelamento. Para relatar uma falha de integração, encaminhe o SHA integrado,
a rota, os parâmetros e a diferença entre esperado e observado.
