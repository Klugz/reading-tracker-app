# Trilha de Leitura

Aplicação de acompanhamento de leitura para professores e alunos, com prioridade para celulares e layout adaptado a desktop. Desenvolvida com Next.js App Router, React e TypeScript. A publicação em Sites utiliza o runtime compatível Vinext e Cloudflare Workers. O banco persistente é Cloudflare D1, com migrações Drizzle.

## Começar a usar

1. O professor entra com ChatGPT e informa seu nome no primeiro acesso.
2. Em **Alunos → Adicionar aluno**, informa nome completo e matrícula. E-mail e seleção de turmas são opcionais.
3. O professor informa ao aluno a matrícula e a senha inicial **EDU123**. Nenhuma mensagem externa é enviada automaticamente.
4. O aluno abre **/entrar**, informa matrícula e senha inicial e cria uma senha pessoal de 8 a 128 caracteres. Nenhuma leitura ou dado escolar fica disponível antes da troca.
5. O professor cadastra livros e atribui leituras por turma ou individualmente, com prazo opcional e resumo antes da confirmação.
6. O aluno registra progresso em **Minhas leituras**; o professor acompanha os avanços no dashboard e nas turmas. As telas atualizam a cada dez segundos quando visíveis e ao recuperar o foco.
7. Em **Alunos → Gerenciar**, o professor edita dados, altera turmas, redefine senha, desativa/reativa a conta ou confirma uma correção de matrícula.

A audiência do site permanece privada, como na versão anterior. Essa barreira da hospedagem é anterior ao login do aplicativo. Para estudantes acessarem apenas com matrícula e senha, o proprietário precisa autorizar a audiência pública do site; todas as rotas de dados continuarão exigindo autenticação e autorização. Criar uma conta de aluno não concede acesso à audiência privada do Sites.


## Funcionalidades

- Cadastro de alunos por matrícula única em todo o sistema, permitindo nomes repetidos. Pesquisa por nome ou matrícula, filtro por turma e indicação de conta ativa/desativada.
- Biblioteca do professor: criar, editar, buscar, inserir URL HTTPS de capa e remover livros ainda não atribuídos.
- Turmas com nome, descrição, membros, edição, arquivamento/restauração e exclusão lógica. Um aluno pode pertencer a várias turmas.
- Uma atribuição por livro/aluno/origem (turma ou individual), com professor, prazo opcional, data de atribuição, início, atualização, conclusão e versão de concorrência. O mesmo livro em turmas diferentes gera leituras independentes; o resumo distingue alunos únicos de leituras totais.
- Progresso por páginas, capítulos ou percentual. Os valores são inteiros. Chegar ao total finaliza a leitura; o fluxo visual pede confirmação.
- Etapas de 25%, 50%, 75% e 100% preenchem um marco do progresso. O histórico é gravado após confirmar o salvamento.
- Status: não iniciada, em andamento, concluída ou atrasada. Atraso é calculado quando o prazo passou e a leitura ainda não terminou, considerando o dia em America/Sao_Paulo.
- Dashboard de professor com turmas, médias por turma, alunos, leituras atribuídas, andamento, conclusões, atrasos e média de progresso. Em andamento inclui leituras iniciadas atrasadas; os indicadores de atraso são uma condição adicional.
- Dashboard do aluno com leitura atual, pendências, conclusões, próximos prazos e atividades.
- Navegação dashboard → turma → livro → aluno e detalhes livro → alunos, detalhes do aluno e diário individual de atualizações.
- Metas pessoais preservadas. O professor registra seu próprio progresso em **Biblioteca → livro → Minha leitura pessoal**. Para alunos, as atribuições concluídas contam para metas no período.
- O histórico e o total de unidades de um livro atribuído são preservados. Título, autor e capa podem ser corrigidos. Exclusão de livros atribuídos e alterações de unidade/total são recusadas.

## Arquitetura

- `app/page.tsx` e `app/entrar/page.tsx`: login por matrícula e encaminhamento por perfil.
- `app/aluno/nova-senha/page.tsx`: troca obrigatória da senha inicial.
- `app/api/student-auth/[action]/route.ts`: login, troca inicial e logout; cookies HttpOnly/Secure/SameSite=Strict e validação de origem.
- `lib/classroom/accounts.ts`: gestão administrativa, matrícula e vínculos.
- `lib/classroom/student-auth.ts` e `passwords.ts`: sessões, limitação de tentativas e hashes de senha.
- `app/professor/page.tsx`, `app/professor/turmas/page.tsx`, `app/professor/turmas/[id]/page.tsx` e `app/aluno/page.tsx`: rotas protegidas por identidade e papel.
- `app/chatgpt-auth.ts`: autenticação gerenciada pela plataforma; usa os cabeçalhos de identidade confiáveis fornecidos pelo dispatcher.
- `app/api/classroom/route.ts`: leitura de dados autorizados e comandos de escrita validados.
- `app/api/books/route.ts` e `app/api/goals/route.ts`: endpoints legados protegidos, sem identificação por localStorage ou `x-reader-id`.
- `lib/classroom/service.ts`: validação Zod, regras de negócio e consultas SQL preparadas. A identidade é fornecida pelo servidor, nunca pelo corpo do comando.
- `lib/classroom/types.ts`: contratos compartilhados, percentuais, status e métricas.
- `components/classroom/`: interface compartilhada, formulários, detalhes e apresentação específica por perfil.
- `db/schema.ts` e `drizzle/`: usuários, vínculo professor-aluno, turmas, membros, livros da turma, livros, atribuições individuais, eventos e metas.

Professores podem criar seu próprio perfil no primeiro acesso. Não há aprovação institucional de professores nesta versão. Novos alunos são criados apenas pelo professor. Nenhuma conta pode alterar seu papel depois de criada. O acesso de professor continua usando autenticação ChatGPT. Professores só consultam alunos vinculados e as atribuições sob sua responsabilidade. Alunos recebem apenas a identificação de suas turmas e suas próprias participações, sem nomes, progresso ou histórico de colegas. Não recebem livros administrativos nem leituras de outras contas. Cada mutação valida papel e propriedade no servidor. Dados privados usam `Cache-Control: no-store`, e escritas de origem cruzada são recusadas.

O progresso usa controle de versão otimista, e a atualização e o evento são persistidos em uma transação. Eventos não são editáveis. Leituras concluídas não são reabertas. O diário registra o avanço declarado pelo aluno, sem pretender comprovar a leitura do conteúdo.

## Contas e autenticação dos alunos

- A matrícula é a chave primária `reading_users.id` dos alunos gerenciados e o código de login. É uma string de 1 a 32 dígitos; zeros à esquerda são preservados. Nomes não têm restrição de unicidade.
- A correção de matrícula atualiza a mesma conta e todas as referências em uma única transação D1, com verificação de unicidade, confirmação, registro administrativo e validação de integridade referencial. Não recria leituras ou eventos. Sessões anteriores são revogadas; a senha é mantida.
- Contas antigas podem ser convertidas com **Cadastrar matrícula e acesso**. O vínculo com a identidade antiga impede que ela seja reutilizada para criar um perfil de professor. O aluno passa a entrar por matrícula.
- Senhas usam scrypt com salt aleatório por hash (N=16384, r=8, p=5). Nenhuma senha pessoal é devolvida ao professor, à API de consulta ou registrada nos eventos.
- A senha inicial é EDU123 e `must_change_password=1`. O login inicial emite sessão restrita de 15 minutos. A troca cria sessão nova de até 8 horas e invalida a anterior.
- Tokens de sessão são aleatórios de 256 bits; somente seus hashes SHA-256 são persistidos. A sessão é verificada no servidor a cada chamada.
- Reset de senha restaura EDU123, exige nova troca e revoga sessões. Desativar/reativar e corrigir matrícula também revogam sessões. Nenhuma dessas ações apaga leituras.
- Limitação de login persistida em D1: até 5 tentativas por matrícula e 50 por origem de rede em uma janela de 10 minutos, incluindo contas inexistentes. Mensagens de login não distinguem conta inexistente, senha incorreta ou conta desativada.
- Metadados e credenciais são separados. Somente o professor responsável pela conta pode editar dados, redefinir senha, corrigir matrícula ou desativar. Toda ação administrativa exige autorização no servidor.
- Criação de conta e vínculos de turma são atômicos. Edições usam versões para impedir sobrescritas concorrentes. Transferências mantêm as turmas de origem das leituras anteriores.
- A migração `0004` adiciona contas gerenciadas, sessões, controle de tentativas e eventos administrativos sem alterar registros preexistentes.

Referências de implementação: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Cloudflare node:crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/) e [D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/).

## Regras de turmas

- A lista de destinatários é calculada no servidor. O resumo inclui livro, turmas, alunos únicos, leituras por origem, prazo e quantidade de novas leituras.
- A distribuição ocorre em transação. Versões das turmas impedem confirmar uma composição alterada desde o resumo; conflito exige revisão. Edição de membros também usa versão e transação.
- Repetir uma atribuição na mesma origem não duplica registros nem altera progresso ou prazo existentes. Para ajustar prazos já atribuídos, abra a leitura individual.
- Novos membros não recebem livros anteriores automaticamente. Atribuir o mesmo livro novamente entrega apenas as leituras faltantes. Remover membros não apaga leituras.
- Arquivar bloqueia novos membros e atribuições, mas permite acompanhamento e progresso dos alunos. Restaurar reabre a turma.
- Excluir remove a turma da gestão sem destruir origem, leituras, eventos ou conclusões. O nome permanece identificado no histórico.
- Métricas da turma consideram todas as leituras originadas nela, inclusive ex-membros. O total de alunos mostra os membros atuais. O dashboard geral usa alunos vinculados únicos.
- A migração `0003` adiciona a origem das atribuições sem recriar ou apagar leituras anteriores; as existentes recebem origem individual.

## Desenvolvimento e verificação

Requer Node.js 24 (testes usam `node:sqlite`) e dependências do lockfile.

```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
node --test tests/classroom.test.mjs
pnpm build
```

As rotas e componentes seguem Next.js App Router. Os comandos padrão de build/dev usam a adaptação Vinext necessária ao ambiente Sites; a camada `cloudflare:workers` em `lib/classroom/server.ts` é específica desta hospedagem.

Em ambiente managed-linux, use a prévia supervisionada de Sites. Para mudanças de schema, gere uma migração com `pnpm db:generate`; jamais reescreva migrações já publicadas. Sites aplica as migrações de produção antes de publicar o Worker. Para um banco local, aplique as migrações pendentes em ordem com Wrangler usando `dist/server/wrangler.json` e a pasta `.wrangler/state`.

## Testes

Os 38 testes usam SQLite em memória e um adaptador D1, exercitando a camada de serviço real: preservação de dados legados, autenticação obrigatória, papéis imutáveis, isolamento entre alunos e professores, atribuição em lote e duplicatas, início e conclusão, histórico, concorrência, validação de datas e progresso, edição e remoção de livros e privacidade de metas. Incluem autenticação por matrícula, hashes, primeiro acesso, reset, desativação, expiração e revogação de sessões, preservação do histórico na correção da matrícula e migração de alunos existentes, além de múltiplas turmas, resumo, idempotência por origem, mudanças de membros, arquivamento, restauração, exclusão com histórico e rollback de distribuição concorrente. Não substituem testes visuais nem uma sessão de ponta a ponta com duas contas autenticadas na plataforma.

WebMCP fornece ações de consulta, atribuição e progresso quando o navegador disponibiliza `document.modelContext`. Os mesmos comandos e validações da interface são reutilizados. A verificação dessa integração em navegador não ficou disponível neste ambiente.
