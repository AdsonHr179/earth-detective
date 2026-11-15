# Operacao e publicacao — candidato A

## Estado observado

Entrada `serve.py`: importa a API existente de B e monta `frontend/dist` por ultimo. `/`, `/health`, `/api/v1/variables`, `/api/v1/nasa/variables` e `/api/v1/regions` responderam 200 via TestClient. Nenhum arquivo de B foi alterado. A API e a UI compartilham origem, sem exigir alteracao de CORS.

`Dockerfile` prepara o build Vite e um runtime Python 3.12, usuario sem root, um worker, healthcheck e `ANALYSIS_DB_PATH=/var/lib/earth-detective/analyses.sqlite3`. `compose.yaml` liga o volume `analyses` nesse caminho e publica somente em 127.0.0.1. `docker compose config --quiet` passou. Isso valida o manifesto, nao o build do container nem TLS, exposicao externa ou durabilidade de um host.

O Docker CLI estava instalado, mas o engine nao respondia inicialmente. Tentativa de iniciar registrada na sessao; conferir estado antes de usar. Nenhum recurso de nuvem foi criado. Vercel MCP retornou 403 tanto para o escopo padrao quanto para `adson-monteiros-projects`; a conexao nao listou equipes. Acesso de navegador existente a outro projeto nao autoriza mudar esse projeto.

## Executar em host local autorizado

```powershell
docker compose build
docker compose up -d
docker compose ps
curl.exe http://127.0.0.1:8000/health
```

Use um proxy TLS ou porta gerenciada do host com dominio autorizado para acesso externo. Nao publicar o dev server Vite. Nao expor porta adicional de banco. Para fontes opcionais, injete segredos no runtime do host, nunca no Dockerfile, Git, bundle ou parametros de URL. Nao reutilizar banco privado. O banco publico de demonstracao deve conter apenas analises de dados publicos.

## Persistencia e recuperacao

Antes de promover: POST NASA real, registrar ID/JSON/CSV; GET salvo identico; reiniciar a mesma instancia com o mesmo volume e repetir GET/export. A URL externa deve funcionar sem sessao, em desktop e celular. Registrar SHA, origem, metodo, data de aquisicao, ID e hashes. O teste local nao substitui este aceite publico.

Pare o servico para copiar o SQLite e mantenha o volume. Retorno: reconstruir o SHA anterior validado e montar o mesmo volume somente depois de B confirmar compatibilidade do schema; caso contrario restaurar o backup correspondente. `docker compose down` preserva o volume por padrao; nao usar `down -v`. Nenhuma migracao foi aplicada por A.

## Bloqueios e alternativa

Faltam host publico autorizado com volume persistente, URL/TLS comprovados e entrega V1 de B. Nao ha candidato final congelado. Um front estatico Vercel com API ausente nao satisfaz o aceite. A [orientacao oficial Vercel sobre SQLite](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel) nao oferece persistencia local SQLite no modelo serverless. Nenhuma contratacao paga foi feita.

Se nao houver backend publico viavel, combinar com o humano e B a alternativa de snapshots NASA reais explicitamente identificados, sem promessa de consulta ao vivo. A alternativa ainda NAO foi implementada; nao declarar app publico funcionando. Antes de solicitar aprovacao de deploy, preparar SHA e configuracao alvo revisaveis.
