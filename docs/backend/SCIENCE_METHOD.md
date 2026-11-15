# Método científico

## Estimativa

O backend ajusta uma reta com intercepto por mínimos quadrados ordinários a pelo menos
três observações mensais finitas em datas distintas. Cada data é o primeiro dia do mês
da observação. O eixo usa dias decorridos divididos por 365,2425 e a inclinação anual
é multiplicada por dez. A unidade da observação vem do produto e a taxa inclui
“per decade”.

A série conserva meses ausentes com `null` e o ajuste usa somente valores observados
nas datas originais. Datas inválidas ou duplicadas e valores não finitos não entram
como observações válidas. Um eixo degenerado é rejeitado. A direção usa o sinal da
inclinação. `stable` corresponde a magnitude inferior a `1e-9` na unidade por década.
O mínimo de três pontos é um requisito do ajuste. A API informa as datas extremas
observadas e a cobertura para contextualizar estimativas com muitos intervalos.

Para POWER, somente meses completos são solicitados para a análise. As chaves anuais
do provedor são descartadas. Ausências, sentinelas e valores não finitos viram lacunas.
A cobertura mede meses válidos divididos pelos meses completos selecionados.
No conector Meteomatics experimental, médias requerem 90% das horas UTC esperadas de
um mês completo. Totais requerem 100%. A direção do vento usa média circular e sua
tendência linear retorna `unsupported`.

## Teste clássico e limite da inferência

O cálculo clássico de referência usa erro padrão residual, `n − 2` graus de liberdade,
p-valor bilateral de Student e intervalo de 95% com o quantil do mesmo teste.
No caso auditado `[0, 1, 1.4]` em 01/01 de 2020–2022, a inclinação é
`6.996431060381` por década, erro padrão `1.725304709728`, p-valor `0.153918150486`
e intervalo `[-14.925643814148, 28.918505934911]`. A base usava multiplicador `1.96`
e retornava intervalo `[3.614834, 10.378028]` com p-valor `0.153918`.
O teste novo obteve a referência independente pela relação entre covariância e
variância e pela distribuição de Cauchy com um grau de liberdade. O procedimento
clássico pressupõe ajuste linear, erros independentes, variância constante e
normalidade dos erros para a inferência exata em amostras pequenas.
[NIST Engineering Statistics Handbook](https://www.itl.nist.gov/div898/handbook/eda/section4/eda4223.htm).

Nenhuma série ambiental da entrega foi validada nesses pressupostos. A API publica
`descriptive` quando há inclinação calculável, com `p_value`, `confidence_interval`
e `significant` nulos. `insufficient_data` e `unsupported` também retornam taxa nula.
O panorama histórico de meses homólogos, quando presente em `forecast`, é uma
estimativa separada por médias históricas. O MAE usa previsões retrospectivas
com pelo menos três valores anteriores para o mesmo mês.

## Caso de apresentação

NASA POWER distribui temperatura do ar a 2 m de MERRA‑2 como `T2M` em °C.
No ponto `[-39.5, -5.2]`, foram obtidas 48 médias mensais válidas de 2020 a 2023.
A reta descritiva foi de **+1,87 °C por década**. De 2021 a 2023, com 36 médias,
o valor foi **+2,95 °C por década**. Os períodos se sobrepõem. Os valores descrevem
o recorte de uma única célula e a sensibilidade da reta ao período selecionado.
Sazonalidade, dependência serial e representatividade espacial continuam limitando a
interpretação. [NASA POWER Monthly and Annual API](https://power.larc.nasa.gov/docs/services/api/temporal/monthly/).

| Situação | Texto para a interface ou apresentação |
| --- | --- |
| Positiva | A reta ajustada sobe no período observado. A taxa indica quanto ela sobe por década nessa célula. |
| Negativa | A reta ajustada desce no período observado. A taxa indica quanto ela desce por década nessa célula. |
| Insuficiente | São necessários pelo menos três meses com valores válidos em datas distintas para calcular a inclinação. |
| Descritiva | A taxa resume a série observada. A significância estatística fica indisponível porque a sazonalidade e a dependência serial ainda precisam ser avaliadas. |
