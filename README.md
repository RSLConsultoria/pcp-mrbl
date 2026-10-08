# PCP MRBL

Software de PCP da MRBL Confecção. Quadro de faltas por caixa e, nas próximas fases, saídas com falta, solicitações, controle de produção e visão das peças.

- App: https://rslconsultoria.github.io/pcp-mrbl/
- Front: `web/` (Vite + React + TS). `npm run dev`, `npm test`, `npm run e2e`
- Backend: workflows n8n em `n8n/` (lógica testável em `n8n/src`, Code nodes gerados em `n8n/build`). Veja `n8n/workflows/README.md`
- Specs e planos: `docs/superpowers/`

Nenhuma credencial fica neste repositório. Ele é público.

## Novo usuário

1. Adicionar uma linha na aba USUARIOS (`email, nome, perfil, senha_hash, ativo=SIM`).
2. Quem vai usar roda `cd n8n && node scripts/hash-senha.js` (no PowerShell, `npm run` pode ser bloqueado pela política de scripts) na própria máquina e cola o resultado em `senha_hash`.

## Conferência local

Para ver as telas sem o n8n, com dados fictícios e todas as ações funcionando em memória:

```
cd web
npm run dev:mock
```

Depois abra http://localhost:5174/pcp-mrbl/ e entre com qualquer e-mail e senha. O servidor de mentira roda em http://localhost:8787 (troque com `MOCK_PORT`) e volta ao estado inicial quando é reiniciado. A OS 90002 fica somente leitura de propósito.
