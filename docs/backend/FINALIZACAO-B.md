# Finalização da frente B

| Tarefa | Evidência de aceite |
| --- | --- |
| ED04 | [Contrato V1](../../contracts/api-contract.md), schema Draft 2020‑12, três respostas completas reproduzidas por HTTP e testadas pelo schema. A integração do adaptador fica com A. |
| ED06 | Datas de calendário distintas, tempo decorrido, lacunas nulas e rejeição de valores não finitos no ajuste. Casos irregulares, duplicados e degenerados cobertos. |
| ED07 | Teste e intervalo clássicos usam a mesma Student t com `n − 2` graus de liberdade. Referência independente reproduz o caso anual auditado. |
| ED08 | Estado descritivo com inferência nula em ambas as rotas de fontes. Casos insuficientes e circulares têm estados próprios. |
| ED09 | Taxa em unidade física por década, direção pelo sinal/magnitude numérica e texto em [Método científico](SCIENCE_METHOD.md). |
| ED10 | Referências para reta crescente, decrescente, constante e irregular, amostra curta, lacunas, sazonalidade sintética e dois snapshots reais. |
| ED11 | Método, limites e texto para apresentação em [SCIENCE_METHOD.md](SCIENCE_METHOD.md). |
| ED12 | Consultas públicas POWER/T2M em MERRA‑2 confirmadas. Respostas originais, origem, revisão e horário de aquisição preservados. |
| ED13 | Meses POWER completos, distinção de lacunas e cobertura. Meteomatics e Earthdata desabilitados por padrão. Testes de agregação experimental com finitude e cobertura. |
| ED14 | POWER até 360 meses completos. Janeiro/1994 a dezembro/2023 retornou 360 válidos por HTTP e 360 linhas CSV. Arquivos Earthdata retêm até 120 meses. |
| ED15 | Reabertura e exportação por ID usam SQLite e a mesma análise. Legado retém os campos originais. CSV conserva as colunas antigas e acrescenta metadados com proteção de fórmulas. |
| ED16 | Dois resultados POWER do mesmo ponto podem ser importados explicitamente e reabertos sem consultar a NASA. |
| ED17 | Erros, limites, CORS explícito, disponibilidade, validação e rotas conferidos em testes e no servidor local. |

## Referências numéricas

| Caso | Esperado independente | Obtido | Tolerância absoluta |
| --- | --- | --- | --- |
| +2 em datas irregulares com lacuna | +2 por década | +2 por década | `1e-12` |
| −2 em datas irregulares com lacuna | −2 por década | −2 por década | `1e-12` |
| Série constante | 0, `stable` | 0, `stable` | `1e-12` |
| Série curta ou sem dados | Inclinação e inferência nulas | Ambas nulas | Igualdade |
| Caso auditado, inclinação | 6,996431060381 por década | 6,996431060381 por década | `1e-12` |
| Caso auditado, p bilateral clássico | 0,153918150486 | 0,153918150486 | `1e-12` |
| Caso auditado, IC clássico de 95% | [−14,925643814, 28,918505935] | [−14,925643814, 28,918505935] | `1e-8` |
| POWER 2020–2023 | 1,869107719344 °C/década | 1,869107719344 °C/década | `1e-10` |
| POWER 2021–2023 | 2,948014894135 °C/década | 2,948014894135 °C/década | `1e-10` |

A linha de base `09b49c31242f2c8c6cb732cb58cf05ff564749d4` passou 30 testes
e reproduziu o intervalo inconsistente no caso auditado. A revisão B passou
62 testes em Python 3.12 no Windows, com um aviso de depreciação em Starlette/AnyIO
também presente na base. No sandbox, `--basetemp` apontou para uma pasta gravável
porque o diretório temporário padrão do pytest estava inacessível.
