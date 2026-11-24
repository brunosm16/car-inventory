#### Filas SQS

Já possuímos as filas do SQS, porém existe um contrato, vou te mandar porém só faça as alterações que forem de extrema necessidade jamais faça alterações que quebrem o que foi implementado. 

Filas de Integração (SQS)
Fila	Produtor	Consumidor	Gatilho
locaviaweb-integracao-desmobilizacao-so-estoque	Locavia Web	API de Integração	Desmobilização Aberta, Cancelada ou Fechada; ação manual no gerenciador.
locaviaweb-integracao-empresas-so-estoque	Locavia Web	API de Integração	Habilitar a integração na tela de configuração.
locaviaweb-integracao-reserva-so-estoque	API de Integração	Locavia Web	POST /reservas da plataforma.
locaviaweb-integracao-pagamento-so-estoque	API de Integração	Locavia Web	POST /pagamentos da plataforma.

Observações
- As duas primeiras filas devem ser solicitadas ao Gui.
- As filas de reserva e pagamento também precisam ser confirmadas com ele.
- Recomenda-se configurar uma Dead Letter Queue (DLQ) para cada fila.
Exemplo de mensagem de desmobilização
Estrutura sugerida, sujeita à validação com o time.

{
  "evento": "DESMOBILIZACAO_FECHADA",
  "empresaId": "123",
  "dataEvento": "2026-11-16T10:00:00Z",
  "veiculo": {
    "id": "987",
    "placa": "ABC1D23",
    "chassi": "...",
    "fipe": {},
    "opcionais": [],
    "dadosCompra": {},
    "dadosVenda": {},
    "tipoUtilizacao": "..."
  },
  "desmobilizacao": {
    "id": "555",
    "situacao": "Fechada",
    "data": "2026-11-15"
  },
  "manutencao": [
    {
      "os": "1001",
      "itens": []
    }
  ],
  "reserva": null,
  "pagamento": null
}



Requisito de idempotência
Toda mensagem deve carregar um idEvento único para garantir a idempotência no consumidor.

Observação: O campo idEvento é obrigatório conforme o requisito descrito, mas ainda não está presente no exemplo JSON acima. Deve ser incluído na estrutura definitiva da mensagem.