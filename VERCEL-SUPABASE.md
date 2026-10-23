# Publicar na Vercel com dados salvos no Supabase

A Vercel hospeda a interface do site. Os cadastros dos alunos, treinos, dietas e históricos ficam no banco PostgreSQL do Supabase e são protegidos por autenticação e políticas de acesso por usuário.

## 1. Criar o banco e as regras de acesso

1. Crie um projeto no [Supabase](https://supabase.com/).
2. No painel do projeto, abra **SQL Editor**, cole o conteúdo de [`supabase/schema.sql`](./supabase/schema.sql) e execute-o. Se o Supabase já foi configurado, execute o arquivo atualizado novamente para criar o armazenamento dos links permanentes e a função segura de leitura.
3. Em **Authentication → Providers → Email**, mantenha o acesso por e-mail habilitado e desative o cadastro público de novos usuários.
4. Em **Authentication → Users**, crie o usuário privado do Gabriel. Não habilite cadastro livre: as políticas protegem cada conta, mas o painel foi pensado para um único consultor.
5. Em **Project Settings → API**, copie a URL do projeto e a chave pública **publishable/anon**. Nunca use nem coloque no frontend a chave `service_role`/secret.

## 2. Configurar o projeto

Para executar localmente, copie `.env.example` para `.env.local` e preencha:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica
```

Reinicie o servidor local após mudar as variáveis. O arquivo `.env.local` é ignorado pelo Git.

## 3. Publicar

1. Envie o projeto para um repositório Git e importe-o na Vercel.
2. Em **Project Settings → Environment Variables**, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` para os ambientes necessários.
3. Faça um novo deploy após salvar as variáveis.
4. Em **Supabase → Authentication → URL Configuration**, configure o endereço publicado da Vercel como **Site URL** e adicione os endereços de produção e preview à lista de redirecionamento permitida.

O painel administrativo passa a exigir o login criado no Supabase. Sem as variáveis de ambiente, o painel administrativo permanece bloqueado; links antigos com os dados no endereço continuam funcionando, mas novos links atualizados precisam do Supabase.

## 4. Importar os dados que já estão neste navegador

Depois do primeiro login, se o banco ainda estiver vazio e este navegador tiver registros antigos, o painel mostrará **Importar para a nuvem**. Confirme a importação para copiar alunos, treinos, dietas, peso e medidas para o banco. Os dados locais só são importados após essa confirmação e não são apagados. Os dados novos e alterações são enviados ao Supabase; se uma gravação falhar, o painel apresenta um aviso.

Cada cadastro é armazenado como um registro JSON associado à conta autenticada. As políticas de segurança do banco impedem que outro usuário leia ou altere esses registros.

## 5. Links permanentes atualizados

Ao compartilhar um aluno pela primeira vez após aplicar o SQL atualizado, o painel cria um token aleatório permanente e publica somente os dados de treino, plano alimentar e evolução destinados ao aluno. Cada alteração salva sincroniza esse mesmo registro, então o link e o QR Code existentes mostram a versão mais recente quando o aluno os abre ou atualiza.

Links antigos que contêm os dados diretamente no endereço continuam funcionando como cópias daquele momento. Gere e envie um novo link/QR uma vez para passar ao compartilhamento atualizado. O token do link dá acesso ao painel do aluno; envie-o somente para a pessoa correspondente.

## 6. Backups

Ative e revise backups do projeto no plano do Supabase escolhido. A cópia local do navegador não substitui um backup do banco.
