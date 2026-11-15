# Scraping de páginas NASA — snapshot de 15/11/2026

## Arquivos

- `nasa_sites_scrape.json`: extração estruturada por página, com os campos encontrados e notas de acesso.
- `nasa_sites_scrape.csv`: resumo tabular dos principais produtos/portais.
- `scrape_nasa_sites.py`: script Python para repetir uma coleta limitada das páginas e links internos.

Para executar a coleta com Python 3:

```powershell
py -3 outputs/scrape_nasa_sites.py --output-dir outputs
```

O script salva a nova execução em `nasa_sites_crawl.json` e `nasa_sites_crawl.csv`, preservando o snapshot acima. Por padrão, visita no máximo oito páginas por site, segue links até profundidade 1, espera um segundo entre páginas e respeita `robots.txt`. Ele usa apenas a biblioteca padrão do Python.

## Escopo

Foram consultadas as quatro URLs fornecidas e páginas oficiais diretamente ligadas a catálogo ou acesso a dados: diretório IMERG do GPM, acesso MERRA-2 e Earthdata Search. A página inicial Earthdata retornou **403 Forbidden** para o leitor automatizado; por isso, o relatório registra o bloqueio e usa Earthdata Search como portal alternativo, sem atribuir o conteúdo dele à homepage bloqueada.

Este snapshot contém metadados e descrições de páginas. Não percorre todos os links dos domínios e não baixa arquivos científicos em HDF5, NetCDF, GeoTIFF ou outros formatos. Para baixar coleções, siga os links de acesso no JSON/CSV; alguns serviços NASA podem exigir uma conta Earthdata Login ou registro específico.

## Observações de qualidade

- As páginas de catálogo podem mostrar versões diferentes entre avisos gerais e fichas de produto. O JSON registra as versões que aparecem nas fichas IMERG Early/Late/Final e recomenda confirmar no diretório antes de uma análise.
- A página GLDAS menciona capacidade do sistema entre 2.5° e 1 km, mas descreve as simulações arquivadas citadas como 1° e 0.25°. Esses campos foram mantidos separados.
- As resoluções, latências e períodos são os valores publicados nas páginas consultadas; podem variar conforme coleção, variável e versão.
