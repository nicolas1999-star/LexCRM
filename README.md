# LexCRM

Aplicação desktop offline construída com **Tauri + React + TypeScript (Vite)** e backend **Rust + SQLite**.

## ✅ Requisitos atendidos
- Frontend com React Router e layout base (/login e /app).
- UI moderna com MUI.
- Backend Rust com rusqlite + migrator simples (schema_migrations).
- Autenticação local com admin inicial e sessão de 8h.
- Auditoria para login/logout/criação de admin.
- RBAC mínimo com administração restrita a ADMIN e PARTNER.

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

## 💾 Banco de dados
O SQLite é criado automaticamente em:
```
%APPDATA%\LexCRM\db.sqlite
```

Migrações são registradas em `schema_migrations`.
