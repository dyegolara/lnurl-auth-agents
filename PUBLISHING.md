# Plan de publicacion pendiente — `lnurl-auth` (LUD-04)

Estado pre-publicacion: codigo estable, 151 tests pass, CI configurado, SKILL.md valido,
plugin manifests listos (`.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`),
MCP server funcional, dependencias vendorizadas, verificado en 2 servicios reales.

---

## 5. openclaw/agent-skills (PR)

Repo: https://github.com/openclaw/agent-skills (950 estrellas, 173 commits)

### Requisitos

- `skills/<name>/SKILL.md` con YAML frontmatter (`name` + `description`)
- Workflow portable y reutilizable entre proyectos/agentes
- Responsabilidad acotada: inputs, outputs, failure modes explicitos
- Licencia MIT
- Pasar `scripts/validate-skills`
- El skill debe ser generico, no atado a un producto especifico (VISION.md)

### Cumplimiento

| Requisito | Estado |
|---|---|
| SKILL.md con frontmatter `name` + `description` | ✅ |
| Workflow portable multi-agente | ✅ |
| Alcance acotado (LUD-04, auth-only) | ✅ |
| Licencia MIT | ✅ |
| Pasar `scripts/validate-skills` | ❌ No verificado |
| Skill generico (no product-specific) | ✅ |

### Estructura requerida en el PR

```
skills/lnurl-auth/
  SKILL.md           # adaptado del SKILL.md actual
  scripts/           # helpers (lnurl_auth.js, lib/, etc.)
```

### Acciones

- [ ] Fork/clonar https://github.com/openclaw/agent-skills
- [ ] Reestructurar: `skills/lnurl-auth/SKILL.md` + `scripts/` con helpers
- [ ] Validar con `scripts/validate-skills`
- [ ] Abrir PR

---

## 6. skills.sh (Vercel Agent Skills Directory)

Directorio: https://skills.sh (982k+ installs, 20+ agentes). Indexa automaticamente
repos publicos de GitHub que tengan `skills.sh.json`.

### Requisitos

- `skills.sh.json` en raiz del repo con schema y array `skills`
- Repo publico en GitHub
- SKILL.md con frontmatter agentskills.io
- Instalacion via `npx skills add dyegolara/lnurl-auth-agents`

### Cumplimiento

| Requisito | Estado |
|---|---|
| `skills.sh.json` en raiz | ❌ **NO EXISTE** |
| Repo publico | ✅ |
| SKILL.md agentskills.io | ✅ |

### Archivo faltante

```json
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

### Acciones

- [ ] Crear `skills.sh.json` con el contenido de arriba
- [ ] `git add skills.sh.json && git commit && git push`
- [ ] Verificar en https://skills.sh/dyegolara/lnurl-auth-agents

---

## 7. anthropics/skills (164k estrellas)

Repo: https://github.com/anthropics/skills — PR-based, cada skill en `skills/<name>/SKILL.md`.

### Requisitos

- PR con `skills/<skill-name>/SKILL.md` + frontmatter YAML (`name`, `description`)
- Skills demostrativas/educativas (no esperan codigo ejecutable completo)
- Formato agentskills.io

### Evaluacion de encaje

⚠️ Este repo aloja SKILL.md puro (instrucciones para Claude). No incluye codigo
ejecutable, tests, ni MCP servers. Publicar aqui solo aportaria visibilidad del
SKILL.md como documentacion, no la herramienta completa.

### Acciones

- [ ] Fork/clonar https://github.com/anthropics/skills
- [ ] Agregar `skills/lnurl-auth/SKILL.md` (solo el markdown, sin codigo)
- [ ] Abrir PR

---

## 8. Claude Community Marketplace

Marketplace oficial: https://platform.claude.com/plugins/submit
Requiere cuenta en Anthropic Console (Team/Enterprise o individual).

### Requisitos tecnicos ya cubiertos

- `.claude-plugin/plugin.json` con metadata completa + mcpServers ✅
- `SKILL.md` en raiz del repo ✅
- `.mcp.json` declarando MCP server integrado ✅
- MCP server funcional (`mcp/server.js`) ✅

### Acciones

- [ ] Crear cuenta en https://console.anthropic.com (si no existe)
- [ ] Submit via https://platform.claude.com/plugins/submit
- [ ] Verificar en el community catalog

---

## 9. HuggingFace skills — DESCARTADO

Repo: https://github.com/huggingface/skills (10.9k estrellas, 326 commits)

**Motivo:** todos los skills en este repo giran alrededor del ecosistema Hugging Face
(Hub, transformers, datasets, gradio, SageMaker, spaces). Un skill de autenticacion
LNURL-auth/Lightning no tiene relacion con el ecosistema HF. PR seria rechazado.

---

## 10. NVIDIA/skills — DESCARTADO

Repo: https://github.com/NVIDIA/skills (2.7k estrellas, 448 commits)

**Motivos:**

- Es exclusivo para equipos internos de NVIDIA con skills de productos NVIDIA
- Requiere firma criptografica `skill.oms.sig` (sistema OMS propietario de NVIDIA)
- Requiere `skill-card.md` (governance card)
- Licencia debe ser Apache 2.0 / CC-BY 4.0 (nosotros: MIT)
- Requiere IP review interno de NVIDIA (6 pasos)
- Requiere security scanning con SkillSpector
- Requiere commit sign-off (DCO)
- El skill no es de un producto NVIDIA

No hay camino viable para un contribuidor externo.

---

## 11. npm

### Requisitos

- `package.json` con `name`, `version`, `description`, `license`, `repository`, `bin`
- `files` field para controlar que se publica
- `npm login` (cuenta en npmjs.com)
- `npm publish`

### Cumplimiento

| Requisito | Estado |
|---|---|
| `package.json` con campos obligatorios | ✅ |
| `bin: { "lnurl-auth": "lnurl_auth.js" }` | ✅ |
| Shebang `#!/usr/bin/env node` | ✅ |
| README.md, LICENSE | ✅ |
| `files` field en package.json | ❌ No definido |
| npm account | ❌ Pendiente |

### Gap: campo `files`

Sin `files`, `npm pack` incluye archivos innecesarios (PUBLISHING.md, test/,
vitest.config.js, mock_server.js, .claude-plugin/, .codex-plugin/, .cursor-plugin/,
mcp/package-lock.json, AGENTS.md).

Agregar a `package.json`:

```json
"files": [
  "lnurl_auth.js",
  "lib/",
  "mcp/server.js",
  "mcp/package.json",
  "SKILL.md",
  "README.md",
  "LICENSE"
]
```

### Acciones

- [ ] Agregar campo `files` a `package.json`
- [ ] `npm login` (crear cuenta en https://npmjs.com si no existe)
- [ ] `npm publish`
- [ ] Verificar: `npm i -g lnurl-auth && lnurl-auth --help`

---

## 12. ClawHub

Registro: https://clawhub.ai (30+ skills, 12+ plugins). Marketplace del ecosistema
OpenClaw. Auto-detecta bundles en formato Claude.

### Requisitos

- SKILL.md con frontmatter agentskills.io
- `.claude-plugin/plugin.json` (OpenClaw lo detecta automaticamente)
- MCP server integrado
- `clawhub` CLI: `npm i -g clawhub && clawhub login`

### Cumplimiento

| Requisito | Estado |
|---|---|
| SKILL.md agentskills.io | ✅ |
| `.claude-plugin/plugin.json` | ✅ |
| `.mcp.json` + MCP server | ✅ |
| `clawhub` CLI instalado | ❌ Pendiente |
| Cuenta ClawHub | ❌ Pendiente |

### Acciones

- [ ] `npm i -g clawhub`
- [ ] `clawhub login` (crear cuenta en https://clawhub.ai si no existe)
- [ ] `clawhub skill publish . --version 1.1.0`
- [ ] Verificar: `openclaw skills search lnurl-auth`

---

## Checklist final

- [ ] **5.** PR a openclaw/agent-skills — requiere reestructuracion + validacion
- [ ] **6.** skills.sh — crear `skills.sh.json` (~10 lineas) y push
- [ ] **7.** PR a anthropics/skills — solo SKILL.md, sin codigo
- [ ] **8.** Claude Community Marketplace — submit en platform.claude.com
- [ ] ~~**9.** HuggingFace~~ — descartado (no encaja en ecosistema HF)
- [ ] ~~**10.** NVIDIA~~ — descartado (exclusivo interno NVIDIA)
- [ ] **11.** npm — agregar `files` a package.json + `npm publish`
- [ ] **12.** ClawHub — `clawhub login` + `clawhub skill publish`

### Orden recomendado

1. **npm** (11) — maximo alcance, minima friccion (1 campo JSON + publish)
2. **skills.sh** (6) — 1 archivo nuevo, indexacion automatica
3. **ClawHub** (12) — sin cambios de codigo, solo CLI
4. **Claude Marketplace** (8) — requiere cuenta Anthropic pero sin cambios tecnicos
5. **openclaw/agent-skills** (5) — requiere reestructuracion de archivos
6. **anthropics/skills** (7) — visibilidad limitada (solo doc, no herramienta)
