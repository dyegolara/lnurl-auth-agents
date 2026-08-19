# Publicacion pendiente - `lnurl-auth` (LUD-04)

Actualizado: 2026-08-19

## Alcance

Este documento separa lo que ya esta preparado en este repositorio de las
acciones externas que el mantenedor debe ejecutar manualmente. Durante esta
auditoria no se hizo ningun `publish`, login, push, fork, PR ni envio a un
marketplace.

El objetivo tecnico queda cumplido en el proyecto: despues de aplicar los
cambios de esta rama, las unicas tareas pendientes son publicar o abrir las
contribuciones en cada plataforma y verificar la indexacion remota.

## Cambios realizados

- `package.json` ahora tiene `files`, `engines.node` (`>=20.19.0`) y version
  `1.3.0`.
- `package-lock.json`, MCP, plugins y frontmatter usan la misma version
  `1.3.0`.
- `skills.sh.json` usa el schema actual de skills.sh (`groupings`, no el
  formato obsoleto `skills: [...]`).
- `skills/lnurl-auth/` es un bundle autonomo para OpenClaw/ClawHub, con
  `SKILL.md` y `scripts/lnurl_auth.js`. El helper usa solo Node.js estandar,
  incluido secp256k1 BigInt para firmar el digest raw de LUD-04 sin depender de
  una instalacion externa de npm.
- `contrib/anthropics/skills/lnurl-auth/SKILL.md` es la variante educativa que
  se entrega a `anthropics/skills` sin scripts ejecutables.
- README, AGENTS y ejemplos ya describen callback GET, no POST, y el requisito
  real de Node.js.
- CI valida sintaxis del bundle, `npm pack --dry-run` y la suite completa.
- El runtime MCP es un servidor stdio autosuficiente (`mcp/server.js`) sin
  dependencias npm: JSON-RPC 2.0 minimo conforme al protocolo MCP, usa la
  misma `lib/` vendored que el CLI. Arranca desde un clon limpio sin
  `npm install`.
- La suite local termina en `164 tests passed`.

## Evidencia ejecutada

| Verificacion | Resultado |
|---|---|
| `npm ci` | OK |
| `npm audit --omit=dev --json` | OK - 0 vulnerabilidades runtime |
| `npm test` | OK - 10 archivos, 164 tests |
| `npm pack --dry-run --json` | OK - `lnurl-auth@1.3.0`, 10 archivos intencionados |
| `node --check` sobre CLI, handshake, MCP y helper portable | OK |
| `git diff --check` | OK |
| `openclaw/agent-skills/scripts/validate-skills` en checkout temporal oficial | OK - 9 skills |
| `scripts/validate-skills.test.py` en checkout temporal oficial | OK - 9 tests |
| `npx skills@latest add . --list` | OK - descubre 1 skill: `lnurl-auth` |
| `clawhub skill publish ./skills/lnurl-auth ... --dry-run --json` | OK - `would-publish`, version `1.3.0`, 2 archivos |
| `claude plugin validate . --strict` | No ejecutable en este entorno: el binario nativo de Claude Code no esta instalado |

El ultimo punto no es un gap del proyecto. Antes del envio a Claude Community,
ejecutar el comando indicado en la seccion 8 desde una instalacion funcional de
Claude Code.

## 5. `openclaw/agent-skills` (PR)

Fuentes consultadas:

- Repo: https://github.com/openclaw/agent-skills
- Reglas: https://github.com/openclaw/agent-skills/blob/main/README.md
- Vision: https://github.com/openclaw/agent-skills/blob/main/VISION.md
- Validador: https://github.com/openclaw/agent-skills/blob/main/scripts/validate-skills

### Requisitos actuales y estado

| Requisito | Estado | Evidencia en este proyecto |
|---|---|---|
| `skills/<name>/SKILL.md` | LISTO | `skills/lnurl-auth/SKILL.md` |
| Frontmatter YAML con `name` y `description` | LISTO | Validador oficial: `validated 9 skills` |
| Workflow portable y reutilizable | LISTO | Helper sin dependencias de npm; solo Node.js estandar |
| Inputs, outputs, fallos y limites explicitos | LISTO | Secciones correspondientes del `SKILL.md` |
| Licencia del proyecto MIT | LISTO | `LICENSE` en la raiz |
| Helper en `scripts/` | LISTO | `skills/lnurl-auth/scripts/lnurl_auth.js` |
| Encaje con `VISION.md` | LISTO | Workflow de protocolo generico, no atado a un servicio o producto |
| `scripts/validate-skills` | LISTO | Ejecutado contra un checkout temporal del repo oficial |

La copia del PR esta preparada en `skills/lnurl-auth/`. El helper portable se
probo contra el mock LUD-04 local y el servidor acepto la firma.

### Unica accion manual

1. Crear una rama en un fork o checkout de `openclaw/agent-skills`.
2. Incorporar `skills/lnurl-auth/` desde este repositorio.
3. Ejecutar `scripts/validate-skills` y las pruebas del repositorio destino.
4. Abrir el PR y responder cualquier revision de encaje con `VISION.md`.

No hay mas cambios tecnicos pendientes en este repositorio para este PR.

## 6. skills.sh (Vercel Agent Skills Directory)

Fuentes consultadas:

- Documentacion: https://skills.sh/docs
- Personalizacion: https://skills.sh/docs/customize
- Schema: https://skills.sh/schemas/skills.sh.schema.json
- CLI: https://github.com/vercel-labs/skills

### Requisitos actuales y estado

| Requisito | Estado | Evidencia |
|---|---|---|
| `skills.sh.json` en la raiz | LISTO | Archivo valido con `$schema`, `notGrouped` y `groupings` |
| `groupings` con skill existente | LISTO | Grupo `Lightning Authentication` incluye `lnurl-auth` |
| Skill Agent Skills con `name` y `description` | LISTO | Raiz y bundle pasan discovery |
| Repo publico en GitHub | LISTO | Remote configurado a `dyegolara/lnurl-auth-agents` |
| Instalacion via `npx skills add` | LISTO | `npx skills@latest add . --list` descubre 1 skill |
| Pagina remota actualizada | PENDIENTE EXTERNO | Requiere push y una instalacion/telemetria posterior |

### Unica accion manual

Despues de subir estos cambios al repo publico:

```bash
npx skills add dyegolara/lnurl-auth-agents --skill lnurl-auth --list
npx skills add dyegolara/lnurl-auth-agents --skill lnurl-auth
```

Verificar la pagina cuando termine la actualizacion de cache:

```text
https://skills.sh/dyegolara/lnurl-auth-agents
```

`skills.sh.json` solo organiza la pagina; no cambia la instalacion ni el
contenido del skill.

## 7. `anthropics/skills` (PR)

Fuentes consultadas:

- Repo: https://github.com/anthropics/skills
- Formato: https://github.com/anthropics/skills/blob/main/README.md
- Especificacion Agent Skills: https://agentskills.io

### Requisitos actuales y estado

| Requisito | Estado | Evidencia |
|---|---|---|
| `skills/<name>/SKILL.md` | LISTO | `contrib/anthropics/skills/lnurl-auth/SKILL.md` preparado |
| Frontmatter con `name` y `description` | LISTO | Verificacion local de frontmatter |
| Skill demostrativo/educativo | LISTO | Variante sin scripts ni dependencia del repo del producto |
| Formato Agent Skills | LISTO | YAML frontmatter valido y cuerpo operacional |

La variante para este PR es deliberadamente separada de la variante ejecutable
de OpenClaw. Para Anthropic se envia solo el markdown, sin
`scripts/`, MCP ni codigo runtime.

### Unica accion manual

1. Crear una rama o fork de `anthropics/skills`.
2. Agregar `contrib/anthropics/skills/lnurl-auth/SKILL.md` como
   `skills/lnurl-auth/SKILL.md` en el checkout destino.
3. Abrir el PR con una descripcion educativa del protocolo y su limite
   auth-only.

## 8. Claude Community Marketplace

Fuentes consultadas:

- Creacion y distribucion: https://code.claude.com/docs/en/plugins
- Referencia de plugins: https://code.claude.com/docs/en/plugins-reference
- Formulario Console: https://platform.claude.com/plugins/submit
- Catalogo community: https://github.com/anthropics/claude-plugins-community

### Requisitos tecnicos y estado

| Requisito | Estado | Evidencia |
|---|---|---|
| `.claude-plugin/plugin.json` | LISTO | Metadata, version `1.3.0`, MIT y MCP server |
| Skill compatible | LISTO | `SKILL.md` en la raiz con frontmatter valido |
| `.mcp.json` | LISTO | Servidor stdio `node mcp/server.js`, sin dependencias npm |
| MCP server funcional | LISTO | Tests MCP y roundtrip local |
| Manifests Codex/Cursor | LISTO | `.codex-plugin/` y `.cursor-plugin/` |
| Validacion estricta del CLI | EJECUTAR MANUALMENTE | El binario nativo de Claude Code no esta instalado en este entorno |

### Unica accion manual

Ejecutar primero desde una instalacion real de Claude Code:

```bash
claude plugin validate . --strict
```

Enviar el plugin mediante una de estas rutas:

- Autor individual: https://platform.claude.com/plugins/submit
- Organizacion Team/Enterprise con permisos de directorio:
  https://claude.ai/admin-settings/directory/submissions/plugins/new

Tras la aprobacion, el catalogo community se sincroniza de forma automatica y
puede tardar hasta el siguiente ciclo nocturno. El marketplace official es
curado por Anthropic y no tiene un proceso de solicitud equivalente.

## 9. HuggingFace skills - descartado

No se acciona. El repositorio esta enfocado en Hub, transformers, datasets,
gradio, SageMaker y Spaces. LNURL-auth no pertenece a ese ecosistema.

## 10. NVIDIA/skills - descartado

No se acciona. La ruta exige gobernanza y tooling interno de NVIDIA, firma OMS,
`skill-card.md`, licencias Apache 2.0/CC-BY 4.0, IP review, SkillSpector y DCO.
El proyecto es MIT y no es un skill de un producto NVIDIA.

## 11. npm

Fuentes consultadas:

- Registry: https://www.npmjs.com
- Packaging: https://docs.npmjs.com/cli/v11/commands/npm-pack

### Requisitos actuales y estado

| Requisito | Estado | Evidencia |
|---|---|---|
| `name`, `version`, `description`, `license` | LISTO | `package.json` |
| `repository` y `bin` | LISTO | `package.json` |
| `files` restrictivo | LISTO | 7 entradas intencionadas |
| Shebang ejecutable | LISTO | `lnurl_auth.js` mode `755` |
| README y LICENSE | LISTO | Incluidos automaticamente y confirmados en pack |
| Version sincronizada | LISTO | `1.3.0` en package, lock, plugins, MCP y skills |
| Paquete construible | LISTO | `npm pack --dry-run`: 11 archivos, sin tests ni docs internos |
| Cuenta/login de npm | PENDIENTE EXTERNO | No se ejecuto `npm login` |
| Publicacion en registry | PENDIENTE EXTERNO | `npm view lnurl-auth` devuelve 404 porque aun no se publico |

### Contenido del paquete

El artefacto npm incluye `lnurl_auth.js`, `lib/` y el entrypoint MCP
`mcp/server.js` (autosuficiente, sin dependencias npm), `SKILL.md`, README y
LICENSE. Excluye deliberadamente
tests, CI, `PUBLISHING.md`, `AGENTS.md`, manifests de marketplaces y el bundle
de contribucion `skills/`; esos artefactos se distribuyen desde GitHub en sus
plataformas correspondientes.

### Unica accion manual

```bash
npm login
npm publish
npm view lnurl-auth version
npm install -g lnurl-auth@1.3.0
lnurl-auth --help
```

No ejecutar `npm publish` desde otra version o un checkout distinto sin volver
a confirmar `npm pack --dry-run`.

## 12. ClawHub

Fuentes consultadas:

- Registro: https://clawhub.ai
- Formato de skills: https://docs.openclaw.ai/clawhub/skill-format
- Publicacion: https://docs.openclaw.ai/clawhub/publishing
- CLI: https://docs.openclaw.ai/clawhub/cli
- Bundles: https://docs.openclaw.ai/plugins/bundles

### Superficie elegida

Se prepara la publicacion como **skill de ClawHub**, no como plugin nativo
OpenClaw. `skills/lnurl-auth/` contiene exactamente un `SKILL.md` y un helper
regular. Su `name` coincide con el directorio, declara `node` y la variable
opcional `LNURL_AUTH_KEYFILE`, y no declara una licencia incompatible con el
MIT-0 que ClawHub aplica a skills publicados.

El repositorio raiz tambien sigue siendo un bundle compatible Claude/Codex/
Cursor para los hosts que soportan esos formatos. No se agrego
`openclaw.plugin.json`: hacerlo cambiaria la deteccion a plugin nativo y
exigiria un entrypoint in-process, metadatos de compatibilidad del API y otra
prueba de runtime. Eso no es necesario para publicar este skill de ClawHub.

### Requisitos y estado

| Requisito | Estado | Evidencia |
|---|---|---|
| Carpeta con `SKILL.md` | LISTO | `skills/lnurl-auth/SKILL.md` |
| `name` coincide con el directorio | LISTO | Ambos son `lnurl-auth` |
| Archivos de soporte regulares | LISTO | `scripts/lnurl_auth.js` |
| Metadata runtime de OpenClaw | LISTO | `metadata.openclaw.requires.bins` y `envVars` |
| Bundle menor a los limites | LISTO | 2 archivos en dry-run |
| Preflight CLI | LISTO | `would-publish`, version `1.3.0`, sin token |
| Cuenta/login ClawHub | PENDIENTE EXTERNO | No se ejecuto `clawhub login` |
| Publicacion y scan remoto | PENDIENTE EXTERNO | No se hizo upload |

### Preflight reproducible

Este comando ya se ejecuto y no publica nada:

```bash
npx --yes clawhub skill publish ./skills/lnurl-auth \
  --slug lnurl-auth \
  --name "LNURL Auth" \
  --version 1.3.0 \
  --categories security \
  --topics lightning,lnurl,authentication \
  --dry-run --json
```

### Unica accion manual

```bash
npm i -g clawhub
clawhub login
clawhub whoami
clawhub skill publish ./skills/lnurl-auth \
  --slug lnurl-auth \
  --name "LNURL Auth" \
  --version 1.3.0 \
  --categories security \
  --topics lightning,lnurl,authentication
```

Despues del scan y la publicacion, verificar con el handle real del publicador:

```bash
clawhub inspect @<publisher>/lnurl-auth --files
openclaw skills install @<publisher>/lnurl-auth
openclaw skills verify @<publisher>/lnurl-auth --card
```

## Checklist final

### Listo en este repositorio

- [x] Bundle OpenClaw portable y validado por `scripts/validate-skills`.
- [x] Variante educativa para PR de `anthropics/skills`.
- [x] `skills.sh.json` con schema actual.
- [x] Plugin Claude/Codex/Cursor y MCP funcionales.
- [x] Paquete npm limitado, versionado y packable.
- [x] Skill ClawHub con preflight `--dry-run` exitoso.
- [x] Documentacion y ejemplos alineados con LUD-04 GET.
- [x] CI y 164 tests locales.

### Acciones externas que quedan para el mantenedor

- [x] Push del repositorio publico con estos cambios.
- [ ] PR a `openclaw/agent-skills`.
- [ ] PR a `anthropics/skills`.
- [ ] Validar con `claude plugin validate . --strict` desde Claude Code instalado.
- [ ] Submit en Claude Community Marketplace.
- [ ] `npm login` y `npm publish`.
- [ ] `clawhub login` y `clawhub skill publish ...`.
- [ ] Esperar y verificar indexacion de skills.sh y scans/catalogos de ClawHub.

No se requiere ningun cambio adicional en el proyecto antes de ejecutar esas
acciones manuales.
