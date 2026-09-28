# Validação da Trilha de Leitura

Os testes usam dados sintéticos e bancos isolados. Não acessam dados de produção.

## Verificações automatizadas

```sh
node --test tests/classroom.test.mjs tests/ux-regressions.test.mjs tests/teacher-auth.test.mjs
pnpm exec tsc --noEmit --incremental false
pnpm build
node tests/worker-smoke.mjs
node tests/http-journeys.mjs
```

- `classroom.test.mjs`: serviços, regras de acesso, matrícula, concorrência, vínculos, distribuição, progresso e histórico.
- `ux-regressions.test.mjs`: lógica de reconciliação de rascunhos, destinos de retorno, projeção do histórico e migração sobre dados existentes. Não simula cliques nem layout.
- `worker-smoke.mjs`: serviços executados em Worker com D1 isolado.
- `http-journeys.mjs`: utiliza o build em `dist/`, carrega os módulos reais e chama rotas HTTP da aplicação. Verifica cookies, redirecionamentos, primeiro acesso, autorização, atribuição e progresso. O professor entra com a conta inicial por e-mail e senha; cabeçalhos de identidade ChatGPT são rejeitados.

## Homologação visual pendente

A aprovação técnica não encerra T09/T18. Executar, no navegador de testes permitido pelo ambiente Sites:

- Cadastro iniciado na turma A mantendo A, escolhendo apenas B, sem turma e com A+B; preservar seleções ainda não salvas.
- Interromper a atualização da lista após cadastro bem-sucedido: mostrar sucesso, impedir salvar versão presumida e recuperar sem recriar a conta.
- Turma → livro → filtros → Turmas; leitura → Ver aluno → retorno; fechar, recarregar e usar Voltar/Avançar.
- Ver aluno a partir de uma leitura dentro do próprio aluno: fechar o painel sem substituir a origem de retorno do aluno.
- Abrir, fechar e substituir diálogos; foco no acionador ou destino lógico, Tab/Shift+Tab e Escape; cadastro sequencial deve focar Nome.
- Biblioteca: um link de detalhes por card, abertura em nova aba, atribuição independente; capa válida, removida e indisponível.
- Fluxos completos de professor e aluno, incluindo confirmação da conclusão e atualização automática no professor.
- Larguras 320, 375, 768 e 1280 px; texto a 200%; teclado físico e teclado virtual em dispositivo/emulação adequada.

Registrar cenário, dispositivo, resultado e evidência. Falta de navegador não equivale a aprovação. A publicação desta revisão aguarda esses critérios do plano.
