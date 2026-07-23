# Plan de publicacion -- `lnurl-auth` (LUD-04)

Herramienta de LNURL-auth ("Sign in with Lightning") para **cualquier agente LLM**
(OpenClaw, Codex, Cursor, Claude Code, OpenCode, etc.). Sin nodo Lightning, sin
pago, sin costo.

---

## 0. Preliminares: arreglar referencias inconsistentes

`package.json` apunta a `openclaw-lnurl-auth` pero el repo real es
`lnurl-auth-agents`. Unificar antes de hacer cualquier otra cosa.

- [x] Corregir `homepage` en `package.json` a `https://github.com/dyegolara/lnurl-auth-agents`
- [x] Corregir `repository.url` en `package.json` a `https://github.com/dyegolara/lnurl-auth-agents.git`

---

## 1. CI/CD -- GitHub Actions

Agregar un workflow que corra los tests automaticamente en cada push/PR.
Da confianza a los consumidores y detecta regresiones.

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm test
```

- [x] Crear `.github/workflows/ci.yml`
- [ ] Verificar que pasa en GitHub Actions
- [x] Agregar badge de CI al README.md

---

## 2. GitHub Topics y discoverability

Optimizar el repositorio para que sea encontrable desde GitHub.

- [x] Agregar topics al repo: `lnurl`, `lnurl-auth`, `lud-04`, `lightning`, `agent-skill`, `openclaw-skill`, `opencode-skill`, `mcp`
- [x] Agregar seccion "About" descriptiva en el repo
- [x] Agregar link al sitio web / demo si existe

---

## 3. Compatibilidad nativa con OpenCode, Claude Code y Codex

El `SKILL.md` actual ya cumple con el formato requerido por todas las plataformas
(YAML frontmatter con `name` + `description`). Solo falta documentar como instalarlo.

OpenCode descubre skills desde `~/.config/opencode/skills/<name>/SKILL.md`
o `.opencode/skills/<name>/SKILL.md`. Claude Code usa `~/.claude/skills/`.
Codex usa `~/.codex/skills/`.

```bash
# OpenCode (global)
mkdir -p ~/.config/opencode/skills/lnurl-auth
cp SKILL.md AGENTS.md lnurl_auth.js ~/.config/opencode/skills/lnurl-auth/
cp -r lib/ ~/.config/opencode/skills/lnurl-auth/

# OpenCode (por proyecto)
mkdir -p .opencode/skills/lnurl-auth
cp SKILL.md AGENTS.md lnurl_auth.js .opencode/skills/lnurl-auth/
cp -r lib/ .opencode/skills/lnurl-auth/

# Claude Code
mkdir -p ~/.claude/skills
ln -sfn "$(pwd)" ~/.claude/skills/lnurl-auth

# Codex
mkdir -p ~/.codex/skills
ln -sfn "$(pwd)" ~/.codex/skills/lnurl-auth
```

- [x] Agregar instrucciones de instalacion para OpenCode en README.md
- [x] Agregar instrucciones de instalacion para Claude Code en README.md
- [x] Agregar instrucciones de instalacion para Codex en README.md

---

## 4. Contribuir al repo canonico de skills compartidas

Repo oficial de la comunidad OpenClaw: https://github.com/openclaw/agent-skills
(949 estrellas, 170+ commits). Es la fuente canonica de skills reusables.

Agregar `lnurl-auth` en `skills/lnurl-auth/SKILL.md` y abrir un PR.

Esto daria:
- Instalacion via `scripts/install-skills lnurl-auth`
- Visibilidad en la comunidad OpenClaw
- Compatibilidad automatica con Codex, Claude Code, OpenCode

- [ ] Fork/clonar https://github.com/openclaw/agent-skills
- [ ] Agregar `skills/lnurl-auth/SKILL.md` con el contenido actual
- [ ] Abrir PR con descripcion clara del skill
- [ ] Responder a feedback del code review

---

## 5. MCP Server wrapper -- maxima compatibilidad

Crear un wrapper MCP (Model Context Protocol) que exponga una tool `lnurl_auth`.
Esto haria el skill usable desde **cualquier** agente con soporte MCP:
Claude Desktop, Cursor, Continue, Cody, Zed, etc.

Estructura sugerida:

```
mcp/
  server.js          # MCP server (stdio transport)
  package.json       # dependencia: @modelcontextprotocol/sdk
```

La tool recibiria un `lnurl1` string y devolveria el resultado del handshake.

- [x] Crear `mcp/server.js` con una tool `lnurl_auth`
- [x] Crear `mcp/package.json` con `@modelcontextprotocol/sdk`
- [ ] Probar con Claude Desktop (`claude_desktop_config.json`)
- [x] Documentar instalacion en README.md

---

## 5b. Empaquetar como plugin (Claude Code, OpenClaw, Codex, Cursor)

El repo ya tiene estructura compatible con plugins de Claude Code (`.claude-plugin/plugin.json`),
Codex (`.codex-plugin/plugin.json`) y Cursor (`.cursor-plugin/plugin.json`).
OpenClaw detecta automaticamente bundles en formato Claude.

El `SKILL.md` en la raiz del repo funciona como skill unico del plugin y
el `.mcp.json` declara el MCP server integrado.

La skill usa el estandar agentskills.io (YAML frontmatter con `name` + `description`).

- [x] Crear `.claude-plugin/plugin.json` con metadata, skill, MCP server
- [x] Crear `.codex-plugin/plugin.json` (compatibilidad Codex)
- [x] Crear `.cursor-plugin/plugin.json` (compatibilidad Cursor)
- [x] Crear `.mcp.json` en raiz del repo (MCP server integrado)
- [x] Verificar que el MCP server referenciado funciona
- [x] Tests de validacion de manifiestos (9 tests en `test/plugin.test.js`)
- [x] Documentar instalacion como plugin en README.md

---

## 6. Publicar en skills.sh (Vercel Agent Skills Directory)

Directorio publico de agent skills: https://skills.sh
(980k+ installs, 20+ agentes compatibles, indexa automaticamente repos de GitHub)

Para listar un skill se necesita `skills.sh.json` en la raiz del repo con metadatos
de catalogo. El directorio indexa automaticamente repos publicos de GitHub.

```json
// skills.sh.json
{
  "$schema": "https://skills.sh/schemas/skills.sh.schema.json",
  "skills": [
    {
      "name": "lnurl-auth",
      "path": "/",
      "description": "LNURL-auth (LUD-04) — Sign in with Lightning. No wallet, no node, no payment."
    }
  ]
}
```

- [ ] Crear `skills.sh.json` en raiz del repo
- [ ] Verificar en https://skills.sh/dyegolara/lnurl-auth-agents

---

## 7. Publicar en anthropics/skills (164k estrellas)

Repo canonico de skills de Anthropic: https://github.com/anthropics/skills
PR-based, cada skill en `skills/<name>/SKILL.md`.

Agregar `skills/lnurl-auth/SKILL.md` con el contenido actual y abrir PR.

- [ ] Fork/clonar https://github.com/anthropics/skills
- [ ] Agregar `skills/lnurl-auth/SKILL.md` con el contenido actual
- [ ] Abrir PR con descripcion clara

---

## 8. Publicar en Claude Community Marketplace

Marketplace oficial de plugins de Claude Code:
https://github.com/anthropics/claude-plugins-community

Submission via formulario en claude.ai o platform.claude.com.
Requiere Team/Enterprise org o cuenta individual via Console.
El repo ya tiene `.claude-plugin/plugin.json` listo.

- [ ] Submit via https://platform.claude.com/plugins/submit
- [ ] Verificar en el community catalog

---

## 9. Publicar en HuggingFace skills

Repo de skills del ecosistema HF: https://github.com/huggingface/skills

- [ ] Fork/clonar https://github.com/huggingface/skills
- [ ] Agregar `skills/lnurl-auth/SKILL.md`
- [ ] Abrir PR

---

## 10. Publicar en NVIDIA/skills

Repo de skills verificados por NVIDIA: https://github.com/NVIDIA/skills
Requiere skill firmada (`skill.oms.sig`) + governance card (`skill-card.md`).

- [ ] Evaluar requisitos de firma y governance
- [ ] Abrir PR si aplica

---

## 11. Publicar en npm

`package.json` ya tiene `"bin": {"lnurl-auth": "lnurl_auth.js"}`.
Publicar en npm permite `npm i -g lnurl-auth`.

```bash
npm login
npm publish
```

Verificacion:
```bash
npm info lnurl-auth
npm i -g lnurl-auth
lnurl-auth --help
```

- [ ] `npm login` (requiere cuenta en npmjs.com)
- [ ] `npm publish`
- [ ] Verificar que `npm i -g lnurl-auth` funciona

---

## 12. Publicar en ClawHub

Registro publico de skills y plugins: https://clawhub.ai
(30+ skills, 12+ plugins, marketplace principal del ecosistema OpenClaw)

```bash
npm i -g clawhub
clawhub login
clawhub whoami
clawhub skill publish . --version 1.1.0
```

Verificacion post-publicacion:
```bash
openclaw skills search lnurl-auth
openclaw skills verify lnurl-auth
openclaw skills install lnurl-auth
```

- [ ] Instalar `clawhub` CLI
- [ ] `clawhub login` (requiere cuenta en ClawHub)
- [ ] `clawhub skill publish . --version 1.1.0`
- [ ] Verificar que aparece en https://clawhub.ai/skills

---

## Checklist general de publicacion

- [x] **0.** Arreglar URLs inconsistentes en package.json
- [x] **1.** Agregar CI con GitHub Actions
- [x] **2.** Optimizar GitHub topics y discoverability
- [x] **3.** Documentar instalacion para 8 plataformas en README
- [ ] **4.** PR a openclaw/agent-skills
- [x] **5.** Crear MCP server wrapper
- [x] **5b.** Empaquetar como plugin multi-plataforma
- [ ] **6.** Publicar en skills.sh
- [ ] **7.** PR a anthropics/skills (164k estrellas)
- [ ] **8.** Publicar en Claude Community Marketplace
- [ ] **9.** PR a huggingface/skills
- [ ] **10.** PR a NVIDIA/skills
- [ ] **11.** Publicar en npm
- [ ] **12.** Publicar en ClawHub

---

## Estado actual del skill (pre-publicacion)

- [x] Codigo estable con 5 bugs corregidos (code review)
- [x] Tests: `npm test` = 151/151 PASS (9 suites)
- [x] `SKILL.md` con frontmatter valido (`name`, `description`, `license`, `homepage`, `metadata`)
- [x] Dependencias vendorizadas en `node_modules/` (offline-capable)
- [x] Documentacion completa: `README.md`, `SKILL.md`, `AGENTS.md`
- [x] `LICENSE` (MIT), `examples/`
- [x] Login real verificado en bitsimp.com y lightninglogin.live (status OK)
- [x] Repo en GitHub: https://github.com/dyegolara/lnurl-auth-agents
- [x] Plugin manifests: `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`

---

## Evidencia de pruebas reales

| Servicio | Resultado | Respuesta |
|---|---|---|
| bitsimp.com | Exito | `HTTP 200 {"status":"OK","success":true}` |
| lightninglogin.live | Exito | `HTTP 200 {"status":"OK"}` |

Metodo: se navego el sitio, se pulso "Sign in with Lightning", se capturo el
`lnurl1...` del enlace "Open Lightning Wallet", y se ejecuto
`node lnurl_auth.js <lnurl1>`. Ambos cerraron el handshake con `status: OK`.