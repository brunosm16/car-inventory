# Autenticação com o Locavia — usuário `INTEGRACAO_CAR_INVENTORY`

## Resumo

A Só Estoque não fornece login, senha nem organização. O `api-locaviaweb-car-inventory` não tem login, senha, organização nem segredo de token no ambiente: ele autentica somente pelo usuário `INTEGRACAO_CAR_INVENTORY`.

| Acesso | Como funciona | Autenticação |
| --- | --- | --- |
| Leitura (veículos, vendas, OS, empresas) | Direto no banco do Locavia (TypeORM), sem filtro de organização | Nenhuma: só o acesso ao banco (`TYPEORM_*`) |
| Escrita (reservas, clientes) | `api-locavia-web-ts` | `POST /sessoes` com o usuário `INTEGRACAO_CAR_INVENTORY` da organização do veículo |

## Usuário `INTEGRACAO_CAR_INVENTORY`

O `api-locavia-web-ts` cria o usuário em **todas** as organizações, no mesmo padrão do `INTEGRACAO_VEX`:

- **Organizações existentes:** migration `20261115100000-CriarUsuarioIntegracaoCarInventoryNasOrganizacoes` (pessoa "Integracao Car Inventory", usuário e vínculo com todas as empresas). Pode ser executada de novo sem efeito colateral.
- **Organizações novas:** `CreateOrganizacoes` cria o usuário junto com os demais usuários padrão.
- **Empresas novas:** `CreateEmpresa` vincula a empresa ao usuário, como já faz com o `Faturamento_Auto`.
- `AcessoSimultaneoEmpresas = 'S'`, para enxergar todas as empresas da organização, com o grupo `Suporte` da organização (`CodigoGrupoUsuarioAcessoSimultaneoEmpresa`), exigido pelo login.
- Senha fixa, igual nos dois repositórios (como a do `INTEGRACAO_VEX`), gravada com hash argon2. No car-inventory ela fica em `LOCAVIA_WEB_CONSTANTS`.
- A senha do usuário não expira (`AutenticacaoUsuario` ignora o prazo de senha para esse login).
- O usuário não conta no limite de usuários da organização (`QuantidadeUsuarioOrganizacao.sql` e `VerificaUsuarioIntegracaoCadastrado.sql`).

## Como a escrita autentica

1. A operação é sobre um veículo. A organização vem do próprio veículo (`Veiculos.CodigoOrganizacao`) e fica gravada na cópia da reserva.
2. A integração lê no banco o CNPJ dessa organização (`Organizacoes` + `Pessoas`).
3. A integração faz login:

   ```json
   POST /sessoes
   { "login": "INTEGRACAO_CAR_INVENTORY", "senha": "<senha do usuário>", "organizacao": "<CNPJ da organização do veículo>" }
   ```

4. O Locavia devolve o token, e a reserva e o cliente são gravados na organização do veículo.

Há uma sessão por organização, mantida até 5 min antes do `exp` do token. Se o Locavia responder 401, a integração faz login de novo e repete a chamada uma vez. Falha de login responde 503 e a operação é reprocessada.

## Variáveis de ambiente

| Variável | Situação |
| --- | --- |
| `LOCAVIA_WEB_LOGIN` | Removida |
| `LOCAVIA_WEB_PASSWORD` | Removida |
| `LOCAVIA_WEB_ORGANIZATION` | Removida |

Nenhuma variável nova.

## Infra

- DynamoDB `car-inventory-reservations`: o índice `organizationId-index` deixou de ser usado e pode ser removido. A listagem de reservas lê a tabela inteira.

## Conferência no banco

```sql
SELECT U.CodigoOrganizacao, U.CodigoUsuario, U.Ativo, U.AcessoSimultaneoEmpresas,
       U.CodigoGrupoUsuarioAcessoSimultaneoEmpresa,
       (SELECT COUNT(*) FROM UsuariosEmpresas UE WHERE UE.CodigoUsuario = U.CodigoUsuario) AS Empresas,
       (SELECT COUNT(*) FROM Empresas E WHERE E.CodigoOrganizacao = U.CodigoOrganizacao) AS EmpresasOrganizacao
FROM Usuarios U WITH (NOLOCK)
WHERE U.Login = 'INTEGRACAO_CAR_INVENTORY'
ORDER BY U.CodigoOrganizacao
```

Deve haver uma linha por organização, com `Ativo = 'S'`, grupo preenchido e `Empresas = EmpresasOrganizacao`.
