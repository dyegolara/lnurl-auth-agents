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

- [ ] Agregar topics al repo: `lnurl`, `lnurl-auth`, `lud-04`, `lightning`, `agent-skill`, `openclaw-skill`, `opencode-skill`, `mcp`
- [ ] Agregar seccion "About" descriptiva en el repo
- [ ] Agregar link al sitio web / demo si existe

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

- [ ] Agregar instrucciones de instalacion para OpenCode en README.md
- [ ] Agregar instrucciones de instalacion para Claude Code en README.md
- [ ] Agregar instrucciones de instalacion para Codex en README.md

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

- [ ] Crear `mcp/server.js` con una tool `lnurl_auth`
- [ ] Crear `mcp/package.json` con `@modelcontextprotocol/sdk`
- [ ] Probar con Claude Desktop (`claude_desktop_config.json`)
- [ ] Documentar instalacion en README.md

---

## 6. Publicar en ClawHub (ultimo paso)

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

## 7. Publicar en npm (ultimo paso)

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

## Checklist general de publicacion

- [x] **0.** Arreglar URLs inconsistentes en package.json
- [x] **1.** Agregar CI con GitHub Actions
- [ ] **2.** Optimizar GitHub topics y discoverability
- [ ] **3.** Documentar instalacion para OpenCode, Claude Code, Codex
- [ ] **4.** PR a openclaw/agent-skills
- [ ] **5.** Crear MCP server wrapper
- [ ] **6.** Publicar en ClawHub
- [ ] **7.** Publicar en npm

---

## Estado actual del skill (pre-publicacion)

- [x] Codigo estable con 5 bugs corregidos (code review)
- [x] Tests: `npm test` = 22/22 PASS (14 selftest + 8 unit)
- [x] `SKILL.md` con frontmatter valido (`name`, `description`, `license`, `homepage`, `metadata`)
- [x] Dependencias vendorizadas en `node_modules/` (offline-capable)
- [x] Documentacion completa: `README.md`, `SKILL.md`, `AGENTS.md`
- [x] `LICENSE` (MIT), `examples/`
- [x] Login real verificado en bitsimp.com y lightninglogin.live (status OK)
- [x] Repo en GitHub: https://github.com/dyegolara/lnurl-auth-agents

---

## Evidencia de pruebas reales

| Servicio | Resultado | Respuesta |
|---|---|---|
| bitsimp.com | Exito | `HTTP 200 {"status":"OK","success":true}` |
| lightninglogin.live | Exito | `HTTP 200 {"status":"OK"}` |

Metodo: se navego el sitio, se pulso "Sign in with Lightning", se capturo el
`lnurl1...` del enlace "Open Lightning Wallet", y se ejecuto
`node lnurl_auth.js <lnurl1>`. Ambos cerraron el handshake con `status: OK`.