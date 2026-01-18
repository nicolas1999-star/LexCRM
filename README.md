# LexCRM

Aplicação desktop offline construída com **Tauri + React + TypeScript (Vite)** e backend **Rust + SQLite**.

## ✅ Requisitos atendidos
- Frontend com React Router e layout base (/login e /app).
- UI moderna com MUI.
- Backend Rust com rusqlite + migrator simples (schema_migrations).
- Autenticação local com admin inicial e sessão de 8h.
- Auditoria para login/logout/criação de admin.
- RBAC mínimo com administração restrita a ADMIN e PARTNER.
- Módulo de usuários em `/admin/users` com CRUD básico e reset de senha.
- Módulo de equipes em `/admin/teams` com membros e responsável.

## 🧰 Pré-requisitos
- Node.js 18+
- Rust (stable) + cargo
- Dependências do Tauri para Windows 10

## ▶️ Rodar em desenvolvimento
```bash
npm install
npm run tauri dev
```

## 🏗️ Build
```bash
npm install
npm run tauri build
```

## 🔐 Criar admin inicial
1. Abra o app em `/login`.
2. Caso não exista nenhum usuário, será exibido o formulário **Criar Admin Inicial**.
3. Preencha nome, email e senha e confirme.

## 🔒 RBAC mínimo
- Apenas roles `ADMIN` e `PARTNER` conseguem visualizar e acessar a rota `/admin`.
- Tentativas de acesso sem permissão redirecionam para `/app/home` com aviso.

## 👥 Módulo de usuários
- Acesse `/admin/users` para gerenciar usuários.
- Reset de senha exige reautenticação (confirmação da senha do usuário logado).

## 👥 Módulo de equipes
- Acesse `/admin/teams` para gerenciar equipes e membros.

## 💾 Banco de dados
O SQLite é criado automaticamente em:
```
%APPDATA%\LexCRM\db.sqlite
```

Migrações são registradas em `schema_migrations`.

## 📄 Documentos assinados
- Cada geração de documento cria um `documentId` (UUID) que identifica o conteúdo assinado.
- O hash é calculado em duas etapas:
  - `content_hash`: SHA-256 do HTML base normalizado (CRLF → LF e `trim_end()`), sem assinatura.
  - `document_hash`: SHA-256 de uma string canônica com metadados + `content_hash`.
- A assinatura e o HTML final são persistidos na tabela `DOCUMENT_SIGNATURES`, junto com `document_hash` e o `signed_html`.
- Para verificar a assinatura, compare o `document_hash` exibido no app com o valor gravado na coluna `document_hash` da tabela `DOCUMENT_SIGNATURES` para o mesmo `document_id`.
