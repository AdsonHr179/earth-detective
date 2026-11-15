# Revisão independente do frontend — frente A

Base: `09b49c31242f2c8c6cb732cb58cf05ff564749d4`; branch `delivery/adson-20261115`, diff de trabalho observado em 15/11/2026. Revisão por agente, não por segunda pessoa humana. Skills: `equipe-code-review` e `equipe-verification`.

## Achado corrigido durante a revisão

**P2 — magnitude descritiva contraditória entre texto e gráfico.** `frontend/src/lib/sentences.ts:25` e `:61` suprimem a estimativa quando `direction === 'undetermined'`, enquanto `frontend/src/components/TrendChart.tsx:132` desenha qualquer inclinação aplicável não nula. O adaptador aceita a combinação. Reprodução com módulos TypeScript reais, transpilados em memória e executados em Node:

```ts
const payload = fixtureBackendAnalysis(); // TEST FIXTURE, não NASA
payload.trend = { ...payload.trend, inference_status: 'descriptive',
  inference_reason: 'Fixture restriction.', direction: 'undetermined' };
const analysis = adaptBackendAnalysis(payload);
```

Resultado antes da correção: `headlineNumber` anunciava “No trend estimate”; `trendSentence` anunciava evidência insuficiente; gráfico/descrição mostravam inclinação +0,50. O diff final agora preserva a magnitude descritiva no texto e gráfico, usa seu sinal numérico e mantém o enum bruto no adaptador. Caso incluído em `InferenceStates.test.tsx`; resultado do teste final a confirmar pelo integrador. O V1 não proíbe explicitamente essa combinação.

## Segundo achado corrigido

Indisponibilidade após mudança de filtros ocultava o motivo ao lado de resultado stale. O integrador moveu o aviso para `App.tsx:276`, fora do ramo idle, e acrescentou regressão em `App.case.test.tsx`. Teste final dessa correção cabe ao integrador.

## Limites

Inspeção cobriu normalização V1, null/legacy, unidades, texto/gráfico, disponibilidade, preset, cancelamento/retry e respostas atrasadas. Não houve alteração de fonte por este revisor, consulta NASA, revisão científica de B ou validação de publicação. Resultados ED19 anteriores: 23 testes e ESLint direcionado aprovados; evidência em `ed19-retry.txt`.

Conclusão da IA: nenhum achado permanece aberto nesta revisão delimitada após inspeção das duas correções; isso não substitui os testes do candidato integrado nem constitui revisão humana.
